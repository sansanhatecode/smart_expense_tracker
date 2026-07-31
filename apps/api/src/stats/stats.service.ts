import { Injectable } from '@nestjs/common';
import type {
  CategoryBreakdownDto,
  CategoryBreakdownItemDto,
  StatsQuery,
  SummaryDto,
  TrendDto,
  TrendPointDto,
  TrendQuery,
} from '@expense/shared';
import { Prisma } from '../generated/prisma/client';
import type { TxType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Thống kê.
 *
 * Mọi phép tổng hợp chạy ở DB, không kéo row về app rồi cộng bằng JS. Với vài
 * nghìn giao dịch thì cả hai cách đều nhanh, nhưng cách kéo về sẽ chậm dần theo
 * số giao dịch của người dùng — tức chậm đúng lúc app trở nên hữu ích.
 *
 * `date` là cột DATE nên mọi so sánh và nhóm theo tháng làm trực tiếp trên ngày
 * lịch, không cần `AT TIME ZONE` ở đâu cả. Xem ADR 9.5.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tổng quan một kỳ, kèm số của kỳ liền trước CÙNG ĐỘ DÀI.
   *
   * Trả kèm kỳ trước ngay trong response vì một con số đứng một mình thì khó
   * đọc: "chi 8,4 tr" không nói lên gì, "chi 8,4 tr, tăng 23% so với kỳ trước"
   * thì có. Để FE tự gọi request thứ hai nghĩa là mọi FE đều phải tự tính lại
   * biên kỳ trước, và sẽ có chỗ tính sai.
   */
  async summary(userId: string, query: StatsQuery): Promise<SummaryDto> {
    const { from, to } = resolvePeriod(query);
    const previous = previousPeriod(from, to);

    const [current, prior] = await Promise.all([
      this.sumByType(userId, from, to),
      this.sumByType(userId, previous.from, previous.to),
    ]);

    return {
      from,
      to,
      income: current.income,
      expense: current.expense,
      net: current.income - current.expense,
      transactionCount: current.count,
      previous: {
        from: previous.from,
        to: previous.to,
        income: prior.income,
        expense: prior.expense,
        net: prior.income - prior.expense,
      },
    };
  }

  /**
   * Tổng theo danh mục, cho biểu đồ tròn và bảng xếp hạng.
   *
   * Giao dịch chưa phân loại được gộp thành một mục "Chưa phân loại" thay vì bị
   * bỏ đi — nếu bỏ thì tổng trên chart không khớp với tổng ở summary, và người
   * dùng sẽ nghĩ app tính sai.
   */
  async byCategory(userId: string, query: StatsQuery): Promise<CategoryBreakdownDto> {
    const { from, to } = resolvePeriod(query);

    const rows = await this.prisma.$queryRaw<
      Array<{
        categoryId: string | null;
        name: string | null;
        color: string | null;
        icon: string | null;
        type: TxType;
        total: bigint;
        count: bigint;
      }>
    >(Prisma.sql`
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
       GROUP BY t."categoryId", c."name", c."color", c."icon", t."type"
       ORDER BY SUM(t."amount") DESC
    `);

    const expense = rows.filter((row) => row.type === 'expense');
    const income = rows.filter((row) => row.type === 'income');

    return {
      from,
      to,
      expense: toBreakdownItems(expense, 'expense'),
      income: toBreakdownItems(income, 'income'),
    };
  }

  /**
   * Chuỗi thời gian theo ngày hoặc tháng.
   *
   * Đây là chỗ buộc phải dùng `$queryRaw`: Prisma `groupBy` không nhận expression
   * nên không gọi được `date_trunc`. Dùng `Prisma.sql` với tham số thay vì nội
   * suy chuỗi — `granularity` đến từ enum đã validate, nhưng nó vẫn được map qua
   * một hằng trong code thay vì ghép thẳng vào SQL.
   */
  async trend(userId: string, query: TrendQuery): Promise<TrendDto> {
    const { from, to } = resolvePeriod(query);
    const granularity = query.granularity;

    // Không nội suy `granularity` vào SQL: map qua hằng, nên dù enum có bị thêm
    // giá trị lạ thì cũng không có đường nào chạm tới câu lệnh.
    const truncUnit = granularity === 'day' ? Prisma.sql`'day'` : Prisma.sql`'month'`;

    const rows = await this.prisma.$queryRaw<
      Array<{ period: Date; type: TxType; total: bigint }>
    >(Prisma.sql`
      SELECT date_trunc(${truncUnit}, t."date")::date AS "period",
             t."type"                                 AS "type",
             SUM(t."amount")                          AS "total"
        FROM "Transaction" t
       WHERE t."userId" = ${userId}
         AND t."date" >= ${from}::date
         AND t."date" <= ${to}::date
       GROUP BY 1, 2
       ORDER BY 1 ASC
    `);

    // Điền các kỳ không có giao dịch bằng 0. Nếu để trống, chart đường sẽ nối
    // thẳng qua khoảng trống và trông như tháng đó vẫn có chi tiêu.
    const buckets = new Map<string, TrendPointDto>();
    for (const period of enumeratePeriods(from, to, granularity)) {
      buckets.set(period, { period, income: 0, expense: 0, net: 0 });
    }

    for (const row of rows) {
      const key = formatPeriod(row.period, granularity);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      const total = Number(row.total);
      if (row.type === 'income') bucket.income += total;
      else bucket.expense += total;
      bucket.net = bucket.income - bucket.expense;
    }

    return { from, to, granularity, points: [...buckets.values()] };
  }

  private async sumByType(
    userId: string,
    from: string,
    to: string,
  ): Promise<{ income: number; expense: number; count: number }> {
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
}

function toBreakdownItems(
  rows: Array<{
    categoryId: string | null;
    name: string | null;
    color: string | null;
    icon: string | null;
    total: bigint;
    count: bigint;
  }>,
  type: TxType,
): CategoryBreakdownItemDto[] {
  const grandTotal = rows.reduce((sum, row) => sum + Number(row.total), 0);

  return rows.map((row) => {
    const total = Number(row.total);
    return {
      categoryId: row.categoryId,
      // categoryId null nghĩa là chưa phân loại — vẫn phải hiện, xem chú thích ở byCategory
      name: row.name ?? 'Chưa phân loại',
      color: row.color ?? '#94a3b8',
      icon: row.icon ?? 'CircleHelp',
      type,
      total,
      share: grandTotal > 0 ? total / grandTotal : 0,
      transactionCount: Number(row.count),
    };
  });
}

/**
 * Kỳ mặc định là tháng hiện tại theo giờ Việt Nam.
 *
 * Dùng ICT chứ không phải UTC: nếu người dùng ở VN mở app lúc 0h30 ngày 1/8 thì
 * "tháng này" phải là tháng 8. Với UTC thì lúc đó vẫn là 31/7 và app hiện tháng 7
 * — đúng kỹ thuật nhưng sai với điều người dùng thấy trên đồng hồ.
 */
function resolvePeriod(query: { from?: string; to?: string }): { from: string; to: string } {
  if (query.from && query.to) return { from: query.from, to: query.to };

  const nowIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = nowIct.getUTCFullYear();
  const month = nowIct.getUTCMonth();

  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));

  return {
    from: query.from ?? iso(first),
    to: query.to ?? iso(last),
  };
}

/**
 * Kỳ liền trước để so sánh.
 *
 * Có hai quy tắc, và việc phải có cả hai là điều phát hiện qua test:
 *
 * 1. Nếu kỳ đang xem là ĐÚNG MỘT THÁNG LỊCH → dùng tháng lịch liền trước.
 * 2. Ngược lại → dùng khoảng cùng độ dài, kết thúc ngay trước `from`.
 *
 * Chỉ có quy tắc (2) thì trường hợp phổ biến nhất lại ra kết quả kỳ quái: tháng 7
 * dài 31 ngày, nên "31 ngày trước tháng 7" là 31/05–30/06, tức lấn một ngày sang
 * tháng 5. Người dùng xem tháng 7 và đọc "so với kỳ trước" thì hiểu là tháng 6,
 * không phải "31 ngày cuối tính từ 31/5".
 *
 * Nhưng vẫn cần (2): nếu người dùng đang xem 10 ngày thì so với 10 ngày trước đó
 * mới có nghĩa, còn so với cả tháng trước thì phần trăm vô nghĩa.
 */
function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isFullCalendarMonth(from, to)) {
    const [year, month] = from.split('-').map(Number) as [number, number];
    const firstOfPrev = new Date(Date.UTC(year, month - 2, 1));
    const lastOfPrev = new Date(Date.UTC(year, month - 1, 0));
    return { from: iso(firstOfPrev), to: iso(lastOfPrev) };
  }

  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  const lengthMs = toMs - fromMs + 86_400_000;

  return {
    from: iso(new Date(fromMs - lengthMs)),
    to: iso(new Date(fromMs - 86_400_000)),
  };
}

/** `from` là ngày 1 và `to` là ngày cuối của cùng tháng đó. */
function isFullCalendarMonth(from: string, to: string): boolean {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];

  if (fd !== 1 || fy !== ty || fm !== tm) return false;

  // Ngày 0 của tháng sau = ngày cuối tháng này
  const lastDay = new Date(Date.UTC(fy, fm, 0)).getUTCDate();
  return td === lastDay;
}

function enumeratePeriods(from: string, to: string, granularity: 'day' | 'month'): string[] {
  const periods: string[] = [];
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  if (granularity === 'day') {
    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      periods.push(iso(new Date(t)));
    }
    return periods;
  }

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    periods.push(iso(cursor).slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return periods;
}

function formatPeriod(date: Date, granularity: 'day' | 'month'): string {
  const text = iso(date);
  return granularity === 'day' ? text : text.slice(0, 7);
}

/** Date → 'YYYY-MM-DD', luôn dùng UTC để không lệch theo múi giờ máy chạy. */
function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
