import type { TxType } from '../generated/prisma/enums';
import type { Cell } from './table-parser';

/**
 * Phân loại giao dịch THẺ TÍN DỤNG theo MCC (Merchant Category Code).
 *
 * ─── Vì sao cần MCC bên cạnh keyword ───
 *
 * Sao kê thẻ tín dụng không ghi tên cửa hàng như người ta nói, nó ghi
 * *descriptor* do đơn vị thanh toán đặt — bị cắt cụt, viết tắt, và hay dính tiền
 * tố của cổng trung gian:
 *
 *   'TCH*THE COFFEE HO'      cắt cụt giữa chữ
 *   'PAYOO*CTY TNHH ABC'     tên cổng, không phải tên quán
 *   'NGUYEN VAN A 0908...'   hộ kinh doanh đứng tên cá nhân
 *
 * Không keyword nào bắt được ba dòng trên, và tệ hơn: descriptor bị băm nhỏ làm
 * so khớp "contains" dễ trúng nhầm — keyword 'GO' khớp luôn 'GOJEK'.
 *
 * MCC thì ngược lại: nó là mã 4 chữ số do TỔ CHỨC THẺ gán cho ngành nghề của
 * điểm bán, đi kèm mọi giao dịch thẻ, và không phụ thuộc vào việc descriptor
 * được viết ra sao. Với thẻ tín dụng nó là tín hiệu tốt nhất đang có.
 *
 * ─── MCC KHÔNG thay thế keyword ───
 *
 * MCC chỉ có ở giao dịch thẻ. Chuyển khoản, QR, ví điện tử, phí ngân hàng đều
 * không có — nên keyword vẫn là đường chính, MCC là đường bổ sung cho thẻ.
 * Thứ tự thắng khi cả hai cùng khớp nằm ở `categorize` trong ./categorizer.
 *
 * ─── Vì sao bảng này ánh xạ theo TÊN danh mục, không theo id ───
 *
 * Danh mục thuộc về từng user (mỗi người một bộ id riêng, tạo lúc đăng ký), nên
 * một bảng hằng số không thể giữ id. Nó giữ tên trong DEFAULT_CATEGORIES, và
 * `buildMccRules` đổi tên sang id thật của user tại thời điểm import.
 *
 * Hệ quả cần biết: user đổi TÊN một danh mục mặc định thì MCC trỏ vào danh mục
 * đó ngừng hoạt động (tra tên không thấy → bỏ qua, không gán bừa). Đó là lựa
 * chọn có chủ ý — thà mất tự động phân loại còn hơn gán vào một danh mục mà hệ
 * thống chỉ đoán là "chắc nó đây".
 */

/** Nhóm các mã MCC cùng trỏ về một danh mục. */
export interface MccGroup {
  /** Phải khớp CHÍNH XÁC `name` trong DEFAULT_CATEGORIES — có test kiểm việc này. */
  category: string;
  type: TxType;
  /** Mã đơn '5812', hoặc khoảng ['3000', '3350'] tính CẢ hai đầu. */
  codes: Array<string | readonly [string, string]>;
}

/**
 * Bảng MCC → danh mục, theo ISO 18245.
 *
 * Hai quy tắc khi thêm mã mới:
 *
 *   1. KHÔNG ánh xạ mã mơ hồ. Mã không nằm trong bảng thì giao dịch rơi về
 *      keyword, và nếu keyword cũng không khớp thì nó hiện ra ở bước preview
 *      dưới dạng "chưa phân loại" — người dùng thấy và tự gán. Còn một mã bị ánh
 *      xạ sai thì đi thẳng vào danh mục sai mà không ai biết. Bỏ sót rẻ hơn
 *      đoán sai, nên khi lưỡng lự thì để trống.
 *   2. KHÔNG ánh xạ vào "Khác". Đưa vào "Khác" là khẳng định "đã phân loại rồi",
 *      nó biến mất khỏi số đếm chưa-phân-loại ở preview và người dùng không còn
 *      được nhắc để sửa. Để null thì họ được nhắc.
 */
const MCC_GROUPS: MccGroup[] = [
  {
    category: 'Ăn uống',
    type: 'expense',
    codes: [
      '5811', // Dịch vụ nấu ăn / tiệc
      '5812', // Nhà hàng, quán ăn
      '5813', // Quán bar, pub
      '5814', // Đồ ăn nhanh, giao đồ ăn
      '5441', // Cửa hàng bánh kẹo
      '5462', // Tiệm bánh
      // 5715 nằm LỌT GIỮA dải đồ nội thất 5712–5719 của Mua sắm nhưng lại là
      // "bán buôn đồ uống có cồn" — một cái tên rất dễ bị dải đó nuốt mất.
      '5715', // Bán buôn bia rượu
      '5921', // Cửa hàng bia rượu
    ],
  },
  /**
   * 5499 (cửa hàng thực phẩm khác) là nơi Circle K / GS25 / Ministop nằm, nên
   * cửa hàng tiện lợi vào đây chứ không vào "Ăn uống" như keyword hiện xếp.
   * Đây là khác biệt CÓ THẬT giữa hai đường: cùng một cửa hàng tiện lợi, dòng
   * quẹt thẻ (có MCC) vào Đi chợ, dòng chuyển khoản (chỉ có keyword) vào Ăn
   * uống. Chọn theo MCC vì mua ở cửa hàng tiện lợi phần lớn là mua đồ mang về.
   */
  {
    category: 'Đi chợ / Siêu thị',
    type: 'expense',
    codes: [
      '5300', // Siêu thị bán sỉ (Mega Market, Costco)
      '5411', // Siêu thị, cửa hàng thực phẩm
      '5422', // Cửa hàng thịt
      '5451', // Cửa hàng sữa
      '5499', // Cửa hàng thực phẩm khác — gồm cửa hàng tiện lợi
    ],
  },
  {
    category: 'Di chuyển',
    type: 'expense',
    codes: [
      ['3000', '3350'], // Dải mã riêng của từng hãng hàng không
      ['3351', '3441'], // Dải mã riêng của từng hãng cho thuê xe
      '4111', // Vận tải hành khách nội đô
      '4112', // Đường sắt chở khách
      '4121', // Taxi, xe công nghệ (Grab, Be, Xanh SM)
      '4131', // Xe khách tuyến
      '4511', // Hàng không
      '4582', // Sân bay
      '4722', // Đại lý du lịch, tour
      '4784', // Phí cầu đường (VETC, ePass)
      '4789', // Dịch vụ vận tải khác
      '5013', // Phụ tùng xe (bán buôn)
      '5511', // Đại lý ô tô
      '5531', // Cửa hàng phụ tùng, đồ gia dụng cho xe
      '5532', // Cửa hàng lốp
      '5533', // Phụ tùng ô tô
      '5541', // Cây xăng
      '5542', // Trạm xăng tự động
      '5571', // Cửa hàng, đại lý xe máy — nhóm chi lớn và rất phổ biến ở VN
      '5599', // Đại lý xe khác
      '7511', // Trạm dừng xe tải
      '7512', // Thuê xe
      '7523', // Bãi đỗ xe
      '7531', // Sửa chữa thân vỏ
      '7534', // Đắp lốp, vá lốp
      '7535', // Sơn xe
      '7538', // Gara, bảo dưỡng
      '7542', // Rửa xe
    ],
  },
  {
    category: 'Mua sắm',
    type: 'expense',
    codes: [
      '4812', // Cửa hàng điện thoại (TGDĐ, FPT Shop) — mua máy, không phải cước
      '5045', // Máy tính, thiết bị ngoại vi, phần mềm
      '5065', // Thiết bị, linh kiện điện
      '5111', // Văn phòng phẩm, giấy in
      '5192', // Sách, báo, tạp chí
      '5200', // Siêu thị vật liệu, đồ gia dụng
      '5211', // Vật liệu xây dựng
      '5231', // Kính, sơn
      '5251', // Cửa hàng kim khí
      '5261', // Cây cảnh, làm vườn
      // 5262 là mã mới của các NỀN TẢNG bán hàng (Shopee, Lazada, TikTok Shop).
      // Nó không có trong bảng ISO đời đầu nên hay bị bỏ sót, mà lại là mã xuất
      // hiện nhiều nhất trên sao kê thẻ ở VN hiện nay.
      '5262', // Sàn thương mại điện tử
      '5309', // Cửa hàng miễn thuế
      '5310', // Cửa hàng giảm giá
      '5311', // Trung tâm thương mại
      '5331', // Cửa hàng tạp hoá tổng hợp
      '5399', // Bán lẻ tổng hợp khác
      ['5611', '5699'], // Toàn bộ nhóm quần áo, giày dép, phụ kiện
      // Dải nội thất bị ngắt ở 5715 (bán buôn bia rượu) — xem nhóm "Ăn uống".
      ['5712', '5714'], // Nội thất, thảm sàn, rèm
      ['5718', '5719'], // Lò sưởi, đồ trang trí nhà khác
      '5722', // Đồ điện gia dụng
      '5732', // Điện tử
      '5733', // Nhạc cụ
      '5734', // Phần mềm đóng hộp
      '5735', // Cửa hàng băng đĩa
      ['5941', '5950'], // Đồ thể thao, sách, văn phòng phẩm, trang sức, đồ chơi…
      ['5964', '5969'], // Bán hàng qua mạng / catalog — sàn TMĐT nằm ở đây
      // Ngắt quãng ở 5975–5976 (máy trợ thính, dụng cụ chỉnh hình): chúng thuộc
      // Sức khoẻ, và một mã nằm ở hai nhóm làm expandGroups ném lỗi lúc nạp module.
      ['5970', '5974'], // Đồ mỹ nghệ, tranh, tem, đồ sưu tầm
      ['5977', '5978'], // Mỹ phẩm, máy chữ
      ['5992', '5999'], // Bán lẻ chuyên biệt còn lại
    ],
  },
  {
    category: 'Hoá đơn & Tiện ích',
    type: 'expense',
    codes: [
      '4814', // Viễn thông — nạp thẻ, cước di động
      '4815', // Cước điện thoại tính theo tháng
      '4816', // Dịch vụ mạng, internet
      '4821', // Điện tín
      '4899', // Truyền hình cáp, vệ tinh
      '4900', // Điện, nước, gas, vệ sinh
      '6513', // Cho thuê bất động sản — tiền nhà
    ],
  },
  {
    category: 'Sức khoẻ',
    type: 'expense',
    codes: [
      '4119', // Xe cứu thương
      '5047', // Thiết bị y tế
      '5122', // Dược phẩm (bán buôn)
      '5912', // Nhà thuốc
      '5975', // Máy trợ thính
      '5976', // Dụng cụ chỉnh hình
      ['8011', '8099'], // Bác sĩ, nha khoa, bệnh viện, xét nghiệm…
    ],
  },
  /**
   * 5815–5818 (nội dung số) là nơi Netflix, Spotify, App Store, Google Play,
   * Steam rơi vào. Đây là phần MCC giúp được nhiều nhất: descriptor của các
   * dịch vụ này thường chỉ là mã đơn hàng, keyword không bắt được gì.
   *
   * 7941 / 7997 (câu lạc bộ thể thao, phòng gym) xếp ở Giải trí chứ không ở Sức
   * khoẻ — hai cách hiểu đều có lý, chọn Giải trí cho cùng nhóm với các khoản
   * chi tuỳ ý khác. Ai muốn ngược lại thì đổi một dòng ở đây.
   */
  {
    category: 'Giải trí',
    type: 'expense',
    codes: [
      ['5815', '5818'], // Nội dung số: phim, nhạc, game, ứng dụng
      '7829', // Sản xuất, phát hành phim
      '7832', // Rạp chiếu phim
      '7841', // Thuê phim
      '7911', // Sàn nhảy, lớp khiêu vũ
      '7922', // Nhà hát, bán vé sự kiện
      '7929', // Ban nhạc, nghệ sĩ biểu diễn
      '7932', // Bi-a
      '7933', // Bowling
      '7941', // Câu lạc bộ thể thao, sân bãi
      ['7991', '7999'], // Khu vui chơi, công viên, sở thú, gym, giải trí khác
    ],
  },
  {
    category: 'Giáo dục',
    type: 'expense',
    codes: [
      '8211', // Trường phổ thông
      '8220', // Đại học, cao đẳng
      '8241', // Đào tạo từ xa
      '8244', // Trường nghiệp vụ
      '8249', // Trường nghề
      '8299', // Dịch vụ giáo dục khác
      '8351', // Nhà trẻ, trông trẻ
    ],
  },
  /**
   * Rút tiền mặt và nạp ví bằng thẻ tín dụng. Đưa vào "Chuyển tiền" là đúng bản
   * chất: tiền chỉ đổi chỗ, chưa phải là đã tiêu. Riêng PHÍ rút tiền mặt thì
   * ngân hàng ghi thành một dòng riêng không có MCC, nên nó đi đường keyword.
   */
  {
    category: 'Chuyển tiền',
    type: 'expense',
    codes: [
      '4829', // Chuyển tiền
      '6010', // Ứng tiền mặt tại quầy
      '6011', // Rút tiền ATM
      '6012', // Tổ chức tài chính — hàng hoá, dịch vụ
      '6051', // Ngoại tệ, séc du lịch, tiền mã hoá
      // Nạp tiền vào tài khoản chứng khoán là tiền ĐỔI CHỖ, không phải đã tiêu.
      // Xếp vào "Chuyển tiền" để nó không thổi phồng chi tiêu của tháng.
      '6211', // Công ty chứng khoán
      '6532', // Trung gian thanh toán — chuyển tiền
      '6534', // Chuyển tiền qua trung gian
      '6540', // Nạp thẻ trả trước, nạp ví điện tử
    ],
  },
  /**
   * KHÔNG có nhóm cho "Phí & Lãi".
   *
   * Phí thường niên, phí trả chậm, lãi thẻ không phải là giao dịch tại điểm bán
   * — chúng do chính ngân hàng ghi vào sao kê nên không mang MCC. Bịa một mã cho
   * chúng chỉ tạo ra ánh xạ sai. Keyword ('PHI THUONG NIEN', 'LAI VAY'…) mới là
   * chỗ xử lý đúng cho nhóm này.
   */
];

export interface MccCategoryRef {
  /** Tên danh mục trong DEFAULT_CATEGORIES. */
  category: string;
  type: TxType;
}

/** Khoảng dài nhất được phép khai báo — chặn lỗi gõ nhầm kiểu ['5812', '9999']. */
const MAX_RANGE_SIZE = 500;

function expandGroups(groups: MccGroup[]): ReadonlyMap<string, MccCategoryRef> {
  const index = new Map<string, MccCategoryRef>();

  const claim = (code: string, group: MccGroup): void => {
    const existing = index.get(code);

    // Một mã thuộc hai danh mục thì kết quả sẽ phụ thuộc thứ tự khai báo trong
    // mảng — đúng loại "không xác định" mà categorizer đã cố tránh. Nổ ngay lúc
    // nạp module để lỗi lộ ra ở lần chạy đầu tiên, không phải ở dữ liệu người dùng.
    if (existing && existing.category !== group.category) {
      throw new Error(
        `MCC ${code} được khai báo ở cả "${existing.category}" và "${group.category}"`,
      );
    }

    index.set(code, { category: group.category, type: group.type });
  };

  for (const group of groups) {
    for (const entry of group.codes) {
      if (typeof entry === 'string') {
        claim(entry, group);
        continue;
      }

      const [from, to] = entry;
      const start = Number(from);
      const end = Number(to);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        throw new Error(`Khoảng MCC không hợp lệ: [${from}, ${to}]`);
      }
      if (end - start + 1 > MAX_RANGE_SIZE) {
        throw new Error(`Khoảng MCC [${from}, ${to}] quá rộng — nhiều khả năng gõ nhầm`);
      }

      for (let code = start; code <= end; code += 1) {
        claim(String(code).padStart(4, '0'), group);
      }
    }
  }

  return index;
}

const MCC_INDEX = expandGroups(MCC_GROUPS);

/** Tra mã MCC. `null` nghĩa là chưa ánh xạ — để keyword hoặc người dùng quyết định. */
export function lookupMcc(mcc: string | null | undefined): MccCategoryRef | null {
  if (!mcc) return null;
  return MCC_INDEX.get(mcc) ?? null;
}

/** Dùng cho test và cho việc tra cứu bảng. */
export function mccGroups(): readonly MccGroup[] {
  return MCC_GROUPS;
}

/**
 * Đọc ô của cột MCC thành mã 4 chữ số.
 *
 * Ba dạng phải chịu được:
 *   number  — XLSX đọc '5812' thành số 5812, và 0742 thành 742 (mất số 0 đầu)
 *   '5812'  — CSV
 *   '5812 - Nhà hàng'  — vài bản export ghép cả mô tả vào ô
 *
 * Trả `null` khi không chắc, theo đúng lệ của parse-value.ts: một dòng không có
 * MCC chỉ mất phần tự phân loại theo MCC, còn một mã đọc sai thì đẩy giao dịch
 * vào danh mục sai mà không ai phát hiện.
 */
export function parseMcc(cell: Cell): string | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'boolean' || cell instanceof Date) return null;

  if (typeof cell === 'number') {
    if (!Number.isInteger(cell) || cell < 1 || cell > 9999) return null;
    return String(cell).padStart(4, '0');
  }

  // Dấu nháy đầu ô là cách Excel đánh dấu "giữ nguyên dạng text", không phải dữ liệu.
  const text = String(cell).trim().replace(/^'/, '');

  const digits = /^\d{3,4}(?!\d)/.exec(text)?.[0];
  if (!digits) return null;

  const code = digits.padStart(4, '0');
  return code === '0000' ? null : code;
}

/**
 * Lấy MCC nằm trong mô tả, cho sao kê không tách MCC thành cột riêng.
 *
 * BẮT BUỘC phải có chữ 'MCC' đứng ngay trước số. Đây là hạn chế cố ý: mô tả
 * giao dịch thẻ đầy số 4 chữ số — 4 số cuối thẻ, mã chuẩn chi, mã đơn hàng, năm.
 * Nhận bừa cụm 4 chữ số đầu tiên thì '...THE 1234...' thành MCC 1234 (dịch vụ
 * xe buýt) và giao dịch bay sang một danh mục hoàn toàn ngẫu nhiên. Đòi có nhãn
 * thì bỏ sót vài sao kê, nhưng cái bỏ sót đó hiện ra ở preview để người dùng sửa.
 *
 * Nhận `normalizedDescription` (đã uppercase, đã gộp ký tự lạ thành khoảng
 * trắng) nên cả 'MCC: 5812', 'MCC-5812', '(MCC 5812)' đều về cùng một dạng.
 */
const MCC_IN_TEXT = /MCC\s*(\d{4})(?!\d)/;

export function extractMcc(normalizedDescription: string): string | null {
  const code = MCC_IN_TEXT.exec(normalizedDescription)?.[1];
  if (!code || code === '0000') return null;
  return code;
}

/** Một mã MCC đã được nối vào danh mục THẬT của một user. */
export interface MccRule {
  /** 4 chữ số. */
  mcc: string;
  categoryId: string;
  /** Chiều của danh mục — dùng để chặn gán rule chi cho một dòng thu. */
  categoryType: TxType;
}

/**
 * Nối bảng MCC với danh mục của một user cụ thể.
 *
 * Danh mục nào không tìm thấy theo (tên, chiều) thì các mã trỏ vào nó bị bỏ —
 * xem chú thích đầu file về việc user đổi tên danh mục.
 */
export function buildMccRules(
  categories: Array<{ id: string; name: string; type: TxType }>,
): Map<string, MccRule> {
  const idByKey = new Map(categories.map((category) => [`${category.type}:${category.name}`, category.id]));
  const rules = new Map<string, MccRule>();

  for (const [mcc, ref] of MCC_INDEX) {
    const categoryId = idByKey.get(`${ref.type}:${ref.category}`);
    if (!categoryId) continue;

    rules.set(mcc, { mcc, categoryId, categoryType: ref.type });
  }

  return rules;
}
