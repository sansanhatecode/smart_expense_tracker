/**
 * Tiền trong hệ thống này LUÔN là số nguyên VND.
 *
 * VND không có đơn vị nhỏ hơn đồng, nên không có gì để làm tròn và không cần
 * thư viện decimal. DB lưu `BigInt`; qua HTTP thì đi dưới dạng `number` vì mọi
 * số tiền thực tế đều nhỏ hơn 2^53 (xem MAX_SAFE_VND) nên không mất chính xác.
 *
 * Quy ước: `amount` luôn DƯƠNG, chiều thu/chi nằm ở `type`. Xem ADR 9.4.
 */

/** Ngưỡng an toàn của IEEE-754 double: 9.007.199.254.740.991đ (~9 triệu tỷ). */
export const MAX_SAFE_VND = Number.MAX_SAFE_INTEGER;

/** Trần hợp lệ cho một giao dịch đơn lẻ: 10^15đ. Dưới MAX_SAFE_VND nhiều lần. */
export const MAX_TRANSACTION_VND = 1_000_000_000_000_000;

/**
 * BigInt (từ Prisma) → number (ra HTTP). Ném lỗi thay vì mất chính xác âm thầm.
 */
export function bigintToNumber(value: bigint): number {
  if (value > BigInt(MAX_SAFE_VND) || value < BigInt(-MAX_SAFE_VND)) {
    throw new RangeError(
      `Số tiền ${value} vượt ngưỡng an toàn của Number (${MAX_SAFE_VND}). ` +
        `Nếu tình huống này là thật thì phải chuyển sang truyền tiền dưới dạng string.`,
    );
  }
  return Number(value);
}

/** number (từ HTTP) → BigInt (vào Prisma). */
export function numberToBigint(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Số tiền VND phải là số nguyên, nhận được ${value}.`);
  }
  return BigInt(value);
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const plainFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

/** 1234567 → "1.234.567 ₫" */
export function formatVnd(amount: number): string {
  return vndFormatter.format(amount);
}

/** 1234567 → "1.234.567" (không ký hiệu tiền, dùng trong input/table) */
export function formatVndPlain(amount: number): string {
  return plainFormatter.format(amount);
}

/**
 * Dạng rút gọn cho chỗ chật: chart axis, tooltip, nhãn trên cột.
 * 850 → "850đ", 45000 → "45 ng", 12500000 → "12,5 tr", 3400000000 → "3,4 tỷ"
 *
 * KHÔNG dùng cho stat tile hay bảng giao dịch — ở đó dùng formatVnd(), vì rút
 * gọn là làm tròn, và người dùng cần thấy đúng số tiền của mình.
 */
export function formatVndCompact(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const n = Math.abs(amount);

  if (n < 1_000) return `${sign}${n}đ`;

  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000, suffix: 'nghìn tỷ' },
    { threshold: 1_000_000_000, suffix: 'tỷ' },
    { threshold: 1_000_000, suffix: 'tr' },
    { threshold: 1_000, suffix: 'ng' },
  ];

  for (const { threshold, suffix } of units) {
    if (n >= threshold) {
      const value = n / threshold;
      // Giữ 1 chữ số thập phân đến 100 đơn vị: "12,5 tr" thay vì "13 tr", vì làm
      // tròn ở mức triệu là mất 500 nghìn — đủ lớn để người dùng thấy sai.
      const text = value < 100 ? trimTrailingZero(value.toFixed(1)) : String(Math.round(value));
      return `${sign}${text} ${suffix}`;
    }
  }

  return `${sign}${n}đ`;
}

function trimTrailingZero(text: string): string {
  return text.replace(/[.,]0$/, '').replace('.', ',');
}

/**
 * Đọc số tiền người dùng gõ vào form. Chấp nhận "1.234.567", "1 234 567",
 * "1234567", "1,5tr", "45k", "2 tỷ". Trả null nếu không parse được.
 */
export function parseVndInput(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/₫|vnd|đồng/g, '').trim();
  if (!text) return null;

  const shorthand = text.match(/^([\d.,\s]+)\s*(k|ng|nghìn|tr|triệu|t|tỷ|ty)$/);
  if (shorthand) {
    const base = parseDecimalish(shorthand[1]);
    if (base === null) return null;
    const multiplier = shorthandMultiplier(shorthand[2]);
    const result = Math.round(base * multiplier);
    return Number.isSafeInteger(result) ? result : null;
  }

  // Không có hậu tố: mọi dấu . , và khoảng trắng đều là phân tách nghìn
  const digitsOnly = text.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digitsOnly)) return null;
  const result = Number(digitsOnly);
  return Number.isSafeInteger(result) ? result : null;
}

function shorthandMultiplier(suffix: string): number {
  switch (suffix) {
    case 'k':
    case 'ng':
    case 'nghìn':
      return 1_000;
    case 'tr':
    case 'triệu':
      return 1_000_000;
    default:
      return 1_000_000_000; // t | tỷ | ty
  }
}

/**
 * "1,5" → 1.5 — trong tiếng Việt dấu phẩy là thập phân. Với "1.5" thì cũng coi
 * là 1.5, vì ở dạng shorthand ("1.5tr") không ai dùng dấu chấm phân tách nghìn.
 */
function parseDecimalish(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Số tiền có dấu, chỉ dùng cho HIỂN THỊ và cho chart. DB không bao giờ lưu dấu.
 */
export function signedAmount(amount: number, type: 'income' | 'expense'): number {
  return type === 'expense' ? -amount : amount;
}

/** Tỷ lệ đã dùng của ngân sách, kẹp ở 0 (không kẹp trên — cần biết khi vượt). */
export function budgetRatio(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, spent / limit);
}
