import type { TxType } from '../generated/prisma/enums';
import type { MccRule } from './mcc';

export interface CategorizerRule {
  /** Đã uppercase. */
  keyword: string;
  categoryId: string;
  /** Chiều của danh mục — rule chỉ áp cho giao dịch cùng chiều. */
  categoryType: TxType;
  priority: number;
}

export interface CategorizableRow {
  /** Mô tả đã qua normalizeDescription. */
  normalizedDescription: string;
  type: TxType;
  /** Mã MCC 4 chữ số, chỉ có ở giao dịch thẻ. Xem ./mcc.ts. */
  mcc?: string | null;
}

/** Bảng tra MCC → danh mục của user, khoá là mã 4 chữ số. Xem `buildMccRules`. */
export type MccRuleMap = ReadonlyMap<string, MccRule>;

const NO_MCC_RULES: MccRuleMap = new Map();

/**
 * Mốc priority mà một rule keyword phải VƯỢT QUA mới thắng được MCC.
 *
 * Rule mặc định sinh lúc đăng ký có priority 0, rule người dùng tự tạo thì họ tự
 * đặt (mặc định của API cũng là 0, nhưng ai muốn đè thì đặt cao hơn). Nên con số
 * 0 ở đây có nghĩa: "MCC thắng phỏng đoán mặc định của hệ thống, nhưng thua ý
 * muốn được nói rõ của người dùng".
 */
const MCC_PRIORITY = 0;

/**
 * Auto-categorize bằng keyword, có MCC hỗ trợ cho giao dịch thẻ.
 *
 * ─── Thứ tự thắng giữa các rule keyword ───
 *
 *   1. `priority` cao hơn — người dùng đặt được rule đè lên rule mặc định
 *   2. keyword DÀI hơn — cụ thể hơn thì thắng
 *
 * Điểm (2) là thứ dễ bỏ sót nhưng quyết định kết quả có hợp lý không. Ví dụ có
 * cả rule "COFFEE" → Ăn uống và "THE COFFEE HOUSE" → Cà phê: nếu chỉ xét
 * priority thì kết quả phụ thuộc thứ tự đọc từ DB, tức không xác định. Chọn
 * keyword dài hơn cho ra kết quả ổn định và đúng trực giác.
 *
 * Rule phải cùng chiều thu/chi với giao dịch. Không có kiểm tra này thì keyword
 * "LUONG" (danh mục thu) sẽ gán cho một khoản chi có chữ "LUONG" trong mô tả, và
 * transactions.service sẽ từ chối vì lệch chiều — tức người dùng nhận lỗi ở chỗ
 * họ không hiểu được.
 *
 * ─── Thứ tự thắng giữa MCC và keyword ───
 *
 *     rule người dùng (priority > 0)  >  MCC  >  rule mặc định (priority 0)
 *
 * MCC ĐÈ LÊN rule mặc định, và đó là phần dễ gây ngạc nhiên nhất ở đây nên xin
 * nói rõ lý do: trên sao kê thẻ, thứ mà keyword đem đi so khớp là descriptor —
 * chuỗi bị cắt cụt và dính tiền tố cổng thanh toán ('TCH*THE COFFEE HO',
 * 'PAYOO*CTY TNHH ABC'). So khớp "contains" trên một chuỗi như thế vừa hay hụt
 * vừa hay trúng nhầm. MCC thì do tổ chức thẻ gán cho chính điểm bán đó. Giữa một
 * suy đoán từ chuỗi bị băm và một mã ngành nghề có thật, mã có thật đáng tin hơn.
 *
 * Nhưng MCC KHÔNG đè lên rule người dùng tự đặt priority: khi người ta đã bỏ
 * công nói "cứ thấy chuỗi này thì xếp vào đây", hệ thống không có tư cách cãi.
 *
 * MCC cũng phải cùng chiều thu/chi. Điều này quan trọng với giao dịch HOÀN TIỀN
 * trên thẻ: dòng hoàn tiền vẫn mang MCC của điểm bán (ví dụ 5812 — nhà hàng)
 * nhưng nó là một khoản THU. Thiếu kiểm tra chiều thì nó bị xếp vào "Ăn uống",
 * một danh mục chi, và chi tiêu tháng đó bị trừ khống. Có kiểm tra thì MCC im
 * lặng, keyword 'HOAN TIEN' làm việc của nó và dòng đó vào "Tiền hoàn".
 */
export function categorize(
  row: CategorizableRow,
  rules: CategorizerRule[],
  mccRules: MccRuleMap = NO_MCC_RULES,
): string | null {
  let best: CategorizerRule | null = null;

  for (const rule of rules) {
    if (rule.categoryType !== row.type) continue;
    if (!row.normalizedDescription.includes(rule.keyword)) continue;

    if (best === null || isBetter(rule, best)) {
      best = rule;
    }
  }

  const byMcc = row.mcc ? mccRules.get(row.mcc) : undefined;

  if (!byMcc || byMcc.categoryType !== row.type) {
    return best?.categoryId ?? null;
  }

  if (best && best.priority > MCC_PRIORITY) {
    return best.categoryId;
  }

  return byMcc.categoryId;
}

function isBetter(candidate: CategorizerRule, current: CategorizerRule): boolean {
  if (candidate.priority !== current.priority) {
    return candidate.priority > current.priority;
  }
  return candidate.keyword.length > current.keyword.length;
}

/** Gán danh mục cho cả loạt. Tách ra để service không phải lặp thủ công. */
export function categorizeAll<T extends CategorizableRow>(
  rows: T[],
  rules: CategorizerRule[],
  mccRules: MccRuleMap = NO_MCC_RULES,
): Array<T & { categoryId: string | null }> {
  return rows.map((row) => ({ ...row, categoryId: categorize(row, rules, mccRules) }));
}
