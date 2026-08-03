import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { AccountKind, TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mọi truy vấn thống kê.
 *
 * Mọi phép tổng hợp chạy ở DB, không kéo row về app rồi cộng bằng JS. Với vài
 * nghìn giao dịch thì cả hai cách đều nhanh, nhưng cách kéo về sẽ chậm dần theo
 * số giao dịch của người dùng — tức chậm đúng lúc app trở nên hữu ích.
 *
 * `date` là cột DATE nên mọi so sánh và nhóm theo tháng làm trực tiếp trên ngày
 * lịch, không cần `AT TIME ZONE` ở đâu cả. Xem ADR 9.5.
 *
 * Đây là chỗ buộc phải dùng `$queryRaw`: Prisma `groupBy` không nhận expression
 * nên không gọi được `date_trunc`, và các câu dưới đây cần LEFT JOIN kèm điều
 * kiện trên bảng join. Mọi giá trị đi vào SQL qua tham số của `Prisma.sql`,
 * không nội suy chuỗi.
 */

export interface AccountTotalRow {
  accountId: string | null;
  name: string | null;
  kind: AccountKind | null;
  total: bigint;
  count: bigint;
}

export interface CategoryTotalRow {
  categoryId: string | null;
  name: string | null;
  color: string | null;
  icon: string | null;
  type: TxType;
  total: bigint;
  count: bigint;
}

export interface PeriodTotalRow {
  period: Date;
  type: TxType;
  total: bigint;
}

export interface TypeTotals {
  income: number;
  expense: number;
  count: number;
}

@Injectable()
export class StatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tổng thu/chi và số giao dịch của một kỳ.
   *
   * Lọc `internalKind IS NULL` như mọi query thu/chi ở đây: tiền chuyển giữa các
   * nguồn của chính người dùng — trả nợ thẻ, nạp ví — không phải chi tiêu, và
   * cộng nó vào là đếm hai lần đúng số tiền đã được ghi nhận ở nơi khác.
   */
  async sumByType(
    userId: string,
    from: string,
    to: string,
    accountId?: string,
  ): Promise<TypeTotals> {
    const rows = await this.prisma.$queryRaw<
      Array<{ type: TxType; total: bigint; count: bigint }>
    >(Prisma.sql`
      SELECT t."type"        AS "type",
             SUM(t."amount") AS "total",
             COUNT(*)        AS "count"
        FROM "Transaction" t
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."internalKind" IS NULL
         ${accountFilter(accountId)}
       GROUP BY t."type"
    `);

    let income = 0;
    let expense = 0;
    let count = 0;

    for (const row of rows) {
      const total = Number(row.total);
      if (row.type === 'income') income = total;
      else expense = total;
      count += Number(row.count);
    }

    return { income, expense, count };
  }

  /**
   * Tiền thật sự rời khỏi các nguồn có sẵn trong kỳ.
   *
   * Ba điều kiện, mỗi điều kiện loại đúng một dạng đếm sai:
   *
   *   `a."kind" <> 'credit_card'` — khoản mua bằng thẻ chưa làm tiền rời đi
   *   đâu cả. Nó đã nằm trong `expense` (dồn tích), cộng vào đây nữa là đếm hai
   *   lần với chính khoản thanh toán sao kê ở dưới.
   *
   *   `internalKind IN (NULL, 'card_payment')` — giữ lại khoản trả nợ thẻ vì đó
   *   là lúc tiền đi thật, nhưng bỏ nạp ví và chuyển giữa tài khoản của chính
   *   mình: tiền vẫn trong túi người dùng, chỉ đổi chỗ.
   *
   *   `a."kind" IS NULL OR …` — giao dịch nhập tay không gắn nguồn được coi như
   *   tiền mặt. LEFT JOIN mà quên nhánh NULL này thì INNER JOIN ngầm sẽ nuốt
   *   mất chúng.
   */
  async sumCashOutflow(
    userId: string,
    from: string,
    to: string,
    accountId?: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(t."amount"), 0) AS "total"
        FROM "Transaction" t
        LEFT JOIN "Account" a ON a."id" = t."accountId"
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."type" = 'expense'
         AND (a."kind" IS NULL OR a."kind" <> 'credit_card')
         AND (t."internalKind" IS NULL OR t."internalKind" = 'card_payment')
         ${accountFilter(accountId)}
    `);

    return Number(rows[0]?.total ?? 0);
  }

  /** Các khoản đã bị loại khỏi thu/chi vì là dịch chuyển nội bộ. */
  async sumInternal(
    userId: string,
    from: string,
    to: string,
    accountId?: string,
  ): Promise<{ total: number; count: number }> {
    const rows = await this.prisma.$queryRaw<Array<{ total: bigint; count: bigint }>>(Prisma.sql`
      SELECT COALESCE(SUM(t."amount"), 0) AS "total",
             COUNT(*)                     AS "count"
        FROM "Transaction" t
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."internalKind" IS NOT NULL
         ${accountFilter(accountId)}
    `);

    return { total: Number(rows[0]?.total ?? 0), count: Number(rows[0]?.count ?? 0) };
  }

  /**
   * Chi tiêu nhóm theo nguồn tiền.
   *
   * LEFT JOIN để giao dịch không gắn nguồn (nhập tay) vẫn ra một dòng với
   * `accountId` null, thay vì bị INNER JOIN ngầm nuốt mất.
   */
  expenseByAccount(
    userId: string,
    from: string,
    to: string,
    accountId?: string,
  ): Promise<AccountTotalRow[]> {
    return this.prisma.$queryRaw<AccountTotalRow[]>(Prisma.sql`
      SELECT t."accountId"                 AS "accountId",
             a."name"                      AS "name",
             a."kind"                      AS "kind",
             SUM(t."amount")               AS "total",
             COUNT(*)                      AS "count"
        FROM "Transaction" t
        LEFT JOIN "Account" a ON a."id" = t."accountId"
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."type" = 'expense'
         AND t."internalKind" IS NULL
         ${accountFilter(accountId)}
       GROUP BY t."accountId", a."name", a."kind"
       ORDER BY SUM(t."amount") DESC
    `);
  }

  /** Tổng thu và chi nhóm theo danh mục. Danh mục null = chưa phân loại. */
  totalsByCategory(
    userId: string,
    from: string,
    to: string,
    accountId?: string,
  ): Promise<CategoryTotalRow[]> {
    return this.prisma.$queryRaw<CategoryTotalRow[]>(Prisma.sql`
      SELECT t."categoryId"                AS "categoryId",
             c."name"                      AS "name",
             c."color"                     AS "color",
             c."icon"                      AS "icon",
             t."type"                      AS "type",
             SUM(t."amount")               AS "total",
             COUNT(*)                      AS "count"
        FROM "Transaction" t
        LEFT JOIN "Category" c ON c."id" = t."categoryId"
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."internalKind" IS NULL
         ${accountFilter(accountId)}
       GROUP BY t."categoryId", c."name", c."color", c."icon", t."type"
       ORDER BY SUM(t."amount") DESC
    `);
  }

  /** Chuỗi thời gian theo ngày hoặc tháng. */
  totalsByPeriod(
    userId: string,
    from: string,
    to: string,
    granularity: 'day' | 'month',
    accountId?: string,
  ): Promise<PeriodTotalRow[]> {
    // Không nội suy `granularity` vào SQL: map qua hằng, nên dù enum có bị thêm
    // giá trị lạ thì cũng không có đường nào chạm tới câu lệnh.
    const truncUnit = granularity === 'day' ? Prisma.sql`'day'` : Prisma.sql`'month'`;

    return this.prisma.$queryRaw<PeriodTotalRow[]>(Prisma.sql`
      SELECT date_trunc(${truncUnit}, t."date")::date AS "period",
             t."type"                                 AS "type",
             SUM(t."amount")                          AS "total"
        FROM "Transaction" t
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
         AND t."internalKind" IS NULL
         ${accountFilter(accountId)}
       GROUP BY 1, 2
       ORDER BY 1 ASC
    `);
  }
}

/** Mảnh WHERE lọc theo nguồn tiền. `Prisma.empty` khi không lọc — không nội suy chuỗi. */
function accountFilter(accountId: string | undefined): Prisma.Sql {
  return accountId === undefined ? Prisma.empty : Prisma.sql`AND t."accountId" = ${accountId}`;
}
