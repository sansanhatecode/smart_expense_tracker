import { z } from 'zod';
import { dateOnlySchema, type AccountKind, type TxType } from '../common';

/**
 * Kỳ thống kê. Bỏ trống thì API dùng tháng hiện tại theo giờ Việt Nam.
 * `to` là bao gồm (inclusive) — dùng `<= to` trong SQL, không phải `< to`.
 */
export const statsQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Bỏ trống = gộp mọi nguồn tiền. */
    accountId: z.string().min(1).optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Ngày bắt đầu phải trước ngày kết thúc',
    path: ['from'],
  });

export type StatsQuery = z.infer<typeof statsQuerySchema>;

export const trendGranularitySchema = z.enum(['day', 'month']).default('month');
export type TrendGranularity = z.infer<typeof trendGranularitySchema>;

export const trendQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    accountId: z.string().min(1).optional(),
    granularity: trendGranularitySchema,
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'Ngày bắt đầu phải trước ngày kết thúc',
    path: ['from'],
  });

export type TrendQuery = z.infer<typeof trendQuerySchema>;

/**
 * Tổng quan một kỳ, kèm số của kỳ liền trước cùng độ dài.
 *
 * Có kỳ trước ngay trong response vì một con số đứng một mình thì khó đọc —
 * "chi 8,4 tr" không nói lên gì, "chi 8,4 tr, tăng 23% so với tháng trước"
 * thì có. FE không phải gọi thêm request thứ hai để biết điều đó.
 */
export interface SummaryDto {
  /** 'YYYY-MM-DD' */
  from: string;
  to: string;
  /** Thu nhập THẬT: đã loại các khoản nội bộ (`internalKind` khác null). */
  income: number;
  /**
   * Chi tiêu THẬT: đã loại các khoản nội bộ. Chi bằng thẻ tín dụng được tính
   * ngay tại ngày mua (dồn tích), không đợi tới ngày thanh toán sao kê.
   */
  expense: number;
  /** income - expense. Có thể âm. */
  net: number;
  /**
   * Tiền thật sự rời khỏi các nguồn tiền có sẵn trong kỳ.
   *
   * Khác `expense` ở hai đầu, và đó là chủ đích:
   *   - KHÔNG tính khoản mua bằng thẻ tín dụng (tiền chưa đi đâu cả).
   *   - CÓ tính khoản thanh toán sao kê thẻ (tiền đi thật), dù nó là nội bộ.
   *   - KHÔNG tính nạp ví / chuyển giữa tài khoản của chính mình, vì tiền vẫn
   *     nằm trong túi người dùng, chỉ đổi chỗ.
   */
  cashOutflow: number;
  transactionCount: number;
  /**
   * Các khoản đã bị loại khỏi income/expense vì là dịch chuyển nội bộ. Đưa ra
   * đây để dashboard nói rõ "đã loại N khoản" thay vì âm thầm giấu tiền đi.
   */
  internal: {
    total: number;
    count: number;
  };
  previous: {
    from: string;
    to: string;
    income: number;
    expense: number;
    net: number;
  };
}

export interface CategoryBreakdownItemDto {
  categoryId: string | null;
  /** null categoryId → "Chưa phân loại" */
  name: string;
  color: string;
  icon: string;
  type: TxType;
  total: number;
  /** Tỷ lệ trên tổng cùng `type`, trong khoảng 0..1. */
  share: number;
  transactionCount: number;
}

export interface CategoryBreakdownDto {
  from: string;
  to: string;
  expense: CategoryBreakdownItemDto[];
  income: CategoryBreakdownItemDto[];
}

/**
 * Chi tiêu chia theo nguồn tiền. Cùng hình dạng với breakdown theo danh mục để
 * FE dùng chung một component bar.
 *
 * `icon`/`color` do API sinh từ `kind` — nguồn tiền không có màu do người dùng
 * chọn như danh mục, và để FE tự map thì hai đầu sẽ lệch nhau lúc thêm loại mới.
 */
export interface AccountBreakdownItemDto {
  /** null = giao dịch nhập tay không gắn nguồn nào. */
  accountId: string | null;
  name: string;
  kind: AccountKind | null;
  color: string;
  icon: string;
  total: number;
  /** Tỷ lệ trên tổng chi tiêu thật trong kỳ, 0..1. */
  share: number;
  transactionCount: number;
}

export interface AccountBreakdownDto {
  from: string;
  to: string;
  /** Chỉ chi tiêu thật, đã loại khoản nội bộ. Tổng khớp `SummaryDto.expense`. */
  expense: AccountBreakdownItemDto[];
}

export interface TrendPointDto {
  /** 'YYYY-MM-DD' khi granularity=day, 'YYYY-MM' khi =month */
  period: string;
  income: number;
  expense: number;
  net: number;
}

export interface TrendDto {
  from: string;
  to: string;
  granularity: TrendGranularity;
  points: TrendPointDto[];
}
