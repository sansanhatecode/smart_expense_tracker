import { z } from 'zod';
import { dateOnlySchema, type TxType } from '../common';

/**
 * Kỳ thống kê. Bỏ trống thì API dùng tháng hiện tại theo giờ Việt Nam.
 * `to` là bao gồm (inclusive) — dùng `<= to` trong SQL, không phải `< to`.
 */
export const statsQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
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
  income: number;
  expense: number;
  /** income - expense. Có thể âm. */
  net: number;
  transactionCount: number;
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
