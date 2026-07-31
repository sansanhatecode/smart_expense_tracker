/**
 * Nhận định dạng file bằng NỘI DUNG, không bằng đuôi tên.
 *
 * Vì sao cần: đuôi file là thứ người dùng (hoặc ngân hàng) đặt, không phải thứ
 * mô tả nội dung. Trường hợp gặp thật — ngân hàng xuất file Excel 97-2003 (.xls)
 * nhưng đặt tên `.xlsx`, hoặc người dùng đổi đuôi bằng tay. Tin vào đuôi file
 * thì parser .xlsx nhận một file .xls, thư viện ném lỗi ở tầng sâu, và người
 * dùng nhận 500 kèm stack trace trong khi họ "đã up đúng file xlsx".
 *
 * Đổi lại, sniff nội dung còn cho một điều tử tế: một file CSV đặt tên .xlsx
 * vẫn import được, vì ta nhìn thấy nó là text.
 */

export type DetectedFormat =
  /** ZIP có cấu trúc Office Open XML — .xlsx thật */
  | 'xlsx'
  /** OLE2 / Compound File Binary — Excel 97-2003 (.xls), hoặc .doc cũ */
  | 'xls-legacy'
  | 'pdf'
  /** ZIP nhưng không phải .xlsx (.docx, .zip thường…) */
  | 'zip-other'
  /** Nội dung là text — coi là CSV bất kể đuôi là gì */
  | 'text'
  | 'empty'
  | 'unknown-binary';

/** Chữ ký ở đầu file. Đây là thứ đáng tin, không phải tên file. */
const SIGNATURES = {
  zip: [0x50, 0x4b], // 'PK' — mọi biến thể (0304, 0506, 0708) đều bắt đầu thế này
  ole2: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  pdf: [0x25, 0x50, 0x44, 0x46], // '%PDF'
} as const;

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

export function detectFormat(buffer: Buffer): DetectedFormat {
  if (buffer.length === 0) return 'empty';

  if (startsWith(buffer, SIGNATURES.ole2)) return 'xls-legacy';
  if (startsWith(buffer, SIGNATURES.pdf)) return 'pdf';

  if (startsWith(buffer, SIGNATURES.zip)) {
    // .xlsx là zip chứa các entry của Office Open XML. Tên entry nằm ngay trong
    // local file header nên tìm trong phần đầu là đủ — không cần giải nén.
    const head = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
    const looksLikeXlsx = head.includes('[Content_Types].xml') || head.includes('xl/');
    return looksLikeXlsx ? 'xlsx' : 'zip-other';
  }

  return looksLikeText(buffer) ? 'text' : 'unknown-binary';
}

/**
 * Phân biệt text với binary.
 *
 * Cách dùng: byte NUL không xuất hiện trong text (trừ UTF-16, xử lý riêng bên
 * dưới), còn tỷ lệ byte điều khiển cao thì là binary. Không cố nhận encoding ở
 * đây — decodeCsv trong CsvParser lo phần đó.
 */
function looksLikeText(buffer: Buffer): boolean {
  // BOM UTF-16: có NUL rải rác nhưng vẫn là text
  if (buffer.length >= 2) {
    const [b0, b1] = [buffer[0], buffer[1]];
    if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) return true;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let control = 0;

  for (const byte of sample) {
    if (byte === 0x00) return false;
    // Cho phép tab (09), LF (0a), CR (0d)
    const isAllowedControl = byte === 0x09 || byte === 0x0a || byte === 0x0d;
    if (byte < 0x20 && !isAllowedControl) control += 1;
  }

  // Ngưỡng 5%: file text có thể lẫn vài byte lạ, binary thì dày đặc
  return control / sample.length < 0.05;
}

/**
 * Thông báo cho định dạng không đọc được.
 *
 * Mỗi thông báo phải nói được HAI điều: file thực sự là gì, và người dùng làm gì
 * để sửa. "Định dạng không hỗ trợ" thì đúng nhưng vô dụng — người dùng đang nhìn
 * đuôi `.xlsx` trên máy mình và không hiểu vì sao bị từ chối.
 */
export function explainUnsupported(format: DetectedFormat, fileName: string): string {
  switch (format) {
    case 'xls-legacy':
      return (
        `"${fileName}" thực chất là file Excel 97-2003 (.xls), không phải .xlsx — ` +
        `đuôi tên file không khớp với nội dung, ngân hàng hay xuất kiểu này. ` +
        `Mở file bằng Excel hoặc Google Sheets rồi lưu lại dưới dạng .xlsx (hoặc .csv) và tải lên lại.`
      );
    case 'pdf':
      return (
        `"${fileName}" là file PDF. Import PDF chưa được hỗ trợ — ` +
        `hãy tải sao kê dưới dạng .csv hoặc .xlsx từ trang ngân hàng.`
      );
    case 'zip-other':
      return (
        `"${fileName}" là file nén nhưng không phải bảng tính Excel. ` +
        `Kiểm tra lại xem có phải bạn chọn nhầm file không.`
      );
    case 'empty':
      return `"${fileName}" là file rỗng.`;
    case 'unknown-binary':
      return (
        `Không nhận được định dạng của "${fileName}". ` +
        `Chỉ hỗ trợ .csv và .xlsx.`
      );
    default:
      return `Không đọc được "${fileName}".`;
  }
}
