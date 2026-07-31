/**
 * Seed dữ liệu mẫu để xem UI với dữ liệu thật.
 *
 * Hai tính chất quan trọng:
 *
 *   Tái lập được — dùng PRNG có seed cố định, không dùng Math.random. Chạy lại
 *   cho ra đúng dữ liệu cũ, nên khi UI trông sai thì biết là do code đổi chứ
 *   không phải do dữ liệu đổi.
 *
 *   Chạy lại được nhiều lần — xoá user demo trước khi tạo lại, nên không cần
 *   db:reset và không tích luỹ rác.
 *
 * Giao dịch được sinh theo cách chi tiêu thật ở VN (lương giữa tháng, cà phê vài
 * lần một tuần, tiền nhà đầu tháng…) chứ không phải số ngẫu nhiên đều — vì
 * dashboard chỉ nói được điều gì có nghĩa khi dữ liệu có hình dạng thật.
 */
import { config as loadEnv } from 'dotenv';
import { hash as argonHash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories';
import { assignSequences, computeDedupeHash, normalizeDescription } from '../src/imports/dedupe';
import { PrismaClient } from '../src/generated/prisma/client';
import type { TxType } from '../src/generated/prisma/enums';

loadEnv({ quiet: true });

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo12345';
const MONTHS_OF_HISTORY = 6;

/**
 * PRNG tuyến tính (mulberry32). Cần một nguồn ngẫu nhiên TÁI LẬP ĐƯỢC — dùng
 * Math.random thì mỗi lần seed ra dữ liệu khác và không so sánh được UI giữa
 * hai lần chạy.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260731);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/** Số tiền làm tròn về nghìn — người ta không tiêu 47.312đ. */
function roundToThousand(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}

interface SeedTx {
  date: string;
  amount: number;
  type: TxType;
  description: string;
  categoryName: string;
}

/** Mẫu chi tiêu: mỗi mục là một loại giao dịch với tần suất và biên độ riêng. */
const PATTERNS = [
  // ─── Định kỳ hàng tháng ───
  { day: 5, categoryName: 'Lương', type: 'income' as TxType, min: 24_000_000, max: 26_000_000,
    descriptions: ['LUONG THANG {M} CONG TY TNHH ABC'] },
  { day: 6, categoryName: 'Hoá đơn & Tiện ích', type: 'expense' as TxType, min: 4_500_000, max: 4_500_000,
    descriptions: ['TIEN NHA THANG {M}'] },
  { day: 12, categoryName: 'Hoá đơn & Tiện ích', type: 'expense' as TxType, min: 380_000, max: 920_000,
    descriptions: ['EVN HCMC TIEN DIEN THANG {M}'] },
  { day: 12, categoryName: 'Hoá đơn & Tiện ích', type: 'expense' as TxType, min: 95_000, max: 180_000,
    descriptions: ['SAWACO TIEN NUOC THANG {M}'] },
  { day: 15, categoryName: 'Hoá đơn & Tiện ích', type: 'expense' as TxType, min: 250_000, max: 250_000,
    descriptions: ['FPT TELECOM INTERNET THANG {M}'] },
  { day: 15, categoryName: 'Hoá đơn & Tiện ích', type: 'expense' as TxType, min: 120_000, max: 250_000,
    descriptions: ['VIETTEL NAP TIEN DIEN THOAI'] },
  { day: 20, categoryName: 'Giải trí', type: 'expense' as TxType, min: 260_000, max: 260_000,
    descriptions: ['NETFLIX.COM'] },
  { day: 22, categoryName: 'Giải trí', type: 'expense' as TxType, min: 59_000, max: 59_000,
    descriptions: ['SPOTIFY PREMIUM'] },

  // ─── Nhiều lần trong tháng ───
  { timesPerMonth: [10, 16], categoryName: 'Ăn uống', type: 'expense' as TxType, min: 35_000, max: 75_000,
    descriptions: ['HIGHLANDS COFFEE {PLACE}', 'THE COFFEE HOUSE {PLACE}', 'PHUC LONG {PLACE}',
                   'KATINAT {PLACE}', 'CIRCLE K {PLACE}', 'MIXUE {PLACE}'] },
  { timesPerMonth: [18, 24], categoryName: 'Ăn uống', type: 'expense' as TxType, min: 40_000, max: 120_000,
    descriptions: ['QUAN COM TAM {PLACE}', 'BUN BO {PLACE}', 'PHO {PLACE}', 'QUAN AN {PLACE}',
                   'BANH MI {PLACE}', 'GRABFOOD {PLACE}'] },
  { timesPerMonth: [8, 14], categoryName: 'Di chuyển', type: 'expense' as TxType, min: 25_000, max: 140_000,
    descriptions: ['GRAB*RIDE', 'BE GROUP', 'XANH SM TAXI'] },
  { timesPerMonth: [2, 4], categoryName: 'Di chuyển', type: 'expense' as TxType, min: 60_000, max: 120_000,
    descriptions: ['PETROLIMEX XANG DAU'] },
  { timesPerMonth: [3, 5], categoryName: 'Đi chợ / Siêu thị', type: 'expense' as TxType, min: 250_000, max: 850_000,
    descriptions: ['WINMART {PLACE}', 'BACH HOA XANH {PLACE}', 'COOPMART {PLACE}', 'AEON {PLACE}'] },
  { timesPerMonth: [2, 6], categoryName: 'Mua sắm', type: 'expense' as TxType, min: 89_000, max: 1_500_000,
    descriptions: ['SHOPEE', 'LAZADA', 'TIKI', 'TIKTOK SHOP'] },
  { timesPerMonth: [1, 3], categoryName: 'Chuyển tiền', type: 'expense' as TxType, min: 200_000, max: 2_000_000,
    descriptions: ['CHUYEN TIEN MOMO', 'CK DEN 0912xxxxxx', 'ZALOPAY NAP TIEN'] },
  { timesPerMonth: [1, 2], categoryName: 'Phí & Lãi', type: 'expense' as TxType, min: 11_000, max: 55_000,
    descriptions: ['PHI SMS BANKING', 'PHI QUAN LY TAI KHOAN', 'PHI CHUYEN TIEN'] },

  // ─── Thỉnh thoảng ───
  { chancePerMonth: 0.5, categoryName: 'Sức khoẻ', type: 'expense' as TxType, min: 120_000, max: 1_800_000,
    descriptions: ['NHA THUOC LONG CHAU', 'PHARMACITY', 'PHONG KHAM DA KHOA'] },
  { chancePerMonth: 0.45, categoryName: 'Giải trí', type: 'expense' as TxType, min: 90_000, max: 400_000,
    descriptions: ['CGV CINEMAS', 'LOTTE CINEMA', 'GALAXY CINE'] },
  { chancePerMonth: 0.25, categoryName: 'Giáo dục', type: 'expense' as TxType, min: 400_000, max: 3_500_000,
    descriptions: ['UDEMY.COM', 'TRUNG TAM ANH NGU', 'COURSERA'] },
  { chancePerMonth: 0.3, categoryName: 'Thưởng', type: 'income' as TxType, min: 1_000_000, max: 8_000_000,
    descriptions: ['THUONG DU AN', 'THUONG KPI THANG {M}'] },
  { chancePerMonth: 0.2, categoryName: 'Lãi tiết kiệm', type: 'income' as TxType, min: 150_000, max: 900_000,
    descriptions: ['LAI TIEN GUI TIET KIEM'] },
  { chancePerMonth: 0.15, categoryName: 'Khác', type: 'expense' as TxType, min: 50_000, max: 600_000,
    descriptions: ['THANH TOAN QR', 'RUT TIEN ATM'] },
];

const PLACES = [
  'THAO DIEN', 'PHU MY HUNG', 'NGUYEN HUE', 'LE VAN SY', 'CMT8', 'QUAN 1', 'QUAN 3',
  'QUAN 7', 'BINH THANH', 'PHU NHUAN', 'GO VAP', 'TAN BINH',
];

function fillTemplate(template: string, month: number): string {
  return template.replace('{M}', String(month)).replace('{PLACE}', pick(PLACES));
}

/** Danh sách tháng cần sinh, tính lùi từ tháng hiện tại theo giờ VN. */
function monthsToSeed(): Array<{ year: number; month: number }> {
  const nowIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const months: Array<{ year: number; month: number }> = [];

  for (let back = MONTHS_OF_HISTORY - 1; back >= 0; back -= 1) {
    const cursor = new Date(Date.UTC(nowIct.getUTCFullYear(), nowIct.getUTCMonth() - back, 1));
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
  }

  return months;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateTransactions(): SeedTx[] {
  const rows: SeedTx[] = [];
  const nowIct = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayIso = nowIct.toISOString().slice(0, 10);

  for (const { year, month } of monthsToSeed()) {
    const lastDay = daysInMonth(year, month);

    for (const pattern of PATTERNS) {
      const occurrences: number[] = [];

      if ('day' in pattern && pattern.day !== undefined) {
        occurrences.push(Math.min(pattern.day, lastDay));
      } else if ('timesPerMonth' in pattern && pattern.timesPerMonth) {
        const [min, max] = pattern.timesPerMonth;
        const count = randomInt(min, max);
        for (let i = 0; i < count; i += 1) occurrences.push(randomInt(1, lastDay));
      } else if ('chancePerMonth' in pattern && pattern.chancePerMonth !== undefined) {
        if (random() < pattern.chancePerMonth) occurrences.push(randomInt(1, lastDay));
      }

      for (const day of occurrences) {
        const date = isoDate(year, month, day);
        // Không sinh giao dịch ở tương lai — dashboard "tháng này" sẽ trông sai
        if (date > todayIso) continue;

        rows.push({
          date,
          amount: roundToThousand(randomInt(pattern.min, pattern.max)),
          type: pattern.type,
          description: fillTemplate(pick(pattern.descriptions), month),
          categoryName: pattern.categoryName,
        });
      }
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('Thiếu DATABASE_URL. Chạy `npm run setup` trước.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // Xoá user demo cũ để seed chạy lại được nhiều lần. Cascade lo phần còn lại.
    const deleted = await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    if (deleted.count > 0) {
      console.log(`Đã xoá dữ liệu demo cũ`);
    }

    const passwordHash = await argonHash(DEMO_PASSWORD, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    const user = await prisma.user.create({
      data: { email: DEMO_EMAIL, passwordHash, name: 'Người dùng demo' },
      select: { id: true },
    });

    // ─── Danh mục + rule: dùng đúng bộ mà đăng ký thật tạo ra ───
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((category) => ({
        userId: user.id,
        name: category.name,
        type: category.type,
        icon: category.icon,
        color: category.color,
        sortOrder: category.sortOrder,
      })),
    });

    const categories = await prisma.category.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, type: true },
    });
    const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

    const rules = DEFAULT_CATEGORIES.flatMap((category) => {
      const categoryId = categoryIdByName.get(category.name);
      if (!categoryId) return [];
      return category.keywords.map((keyword) => ({
        userId: user.id,
        keyword: keyword.toUpperCase(),
        categoryId,
        priority: 0,
      }));
    });
    await prisma.categoryRule.createMany({ data: rules, skipDuplicates: true });

    // ─── Giao dịch ───
    const generated = generateTransactions();

    // dedupeHash phải tính đúng như đường import, nếu không thì import một file
    // chứa các giao dịch này sẽ không nhận ra trùng. Xem ADR 9.8.
    const withKeys = generated.map((row) => ({
      ...row,
      amountBig: BigInt(row.amount),
      normalizedDescription: normalizeDescription(row.description),
    }));

    const withSeq = assignSequences(
      withKeys.map((row) => ({
        date: row.date,
        amount: row.amountBig,
        type: row.type,
        normalizedDescription: row.normalizedDescription,
      })),
    );

    await prisma.transaction.createMany({
      data: withKeys.map((row, index) => ({
        userId: user.id,
        categoryId: categoryIdByName.get(row.categoryName) ?? null,
        amount: row.amountBig,
        type: row.type,
        date: new Date(`${row.date}T00:00:00.000Z`),
        description: row.description,
        dedupeHash: computeDedupeHash({
          userId: user.id,
          date: row.date,
          amount: row.amountBig,
          type: row.type,
          normalizedDescription: row.normalizedDescription,
          seq: withSeq[index]!.seq,
        }),
      })),
      skipDuplicates: true,
    });

    // ─── Ngân sách tháng hiện tại ───
    // Đặt cố ý để dashboard có đủ ba trạng thái: ok, sắp vượt, đã vượt. Một
    // dashboard mà mọi ngân sách đều xanh thì không cho thấy cảnh báo trông thế nào.
    const months = monthsToSeed();
    const currentMonth = months[months.length - 1]!;
    const monthKey = `${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}`;

    const spentByCategory = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId: user.id,
        type: 'expense',
        date: {
          gte: new Date(`${monthKey}-01T00:00:00.000Z`),
          lte: new Date(
            `${isoDate(currentMonth.year, currentMonth.month, daysInMonth(currentMonth.year, currentMonth.month))}T00:00:00.000Z`,
          ),
        },
      },
      _sum: { amount: true },
    });

    const spent = new Map(
      spentByCategory
        .filter((row) => row.categoryId !== null)
        .map((row) => [row.categoryId!, Number(row._sum.amount ?? 0n)]),
    );

    /** ratio = đã chi / hạn mức, tức hạn mức = đã chi / ratio. */
    const budgetTargets: Array<{ name: string; ratio: number }> = [
      { name: 'Ăn uống', ratio: 1.12 },     // đã vượt
      { name: 'Di chuyển', ratio: 0.88 },   // sắp vượt
      { name: 'Đi chợ / Siêu thị', ratio: 0.55 },
      { name: 'Mua sắm', ratio: 0.7 },
      { name: 'Hoá đơn & Tiện ích', ratio: 0.95 }, // sắp vượt
      { name: 'Giải trí', ratio: 0.4 },
    ];

    const budgets = budgetTargets.flatMap((target) => {
      const categoryId = categoryIdByName.get(target.name);
      if (!categoryId) return [];
      const actual = spent.get(categoryId) ?? 0;
      // Không có chi tiêu thì không suy ra được hạn mức có nghĩa — bỏ qua
      if (actual === 0) return [];
      const limit = roundToThousand(actual / target.ratio);
      if (limit <= 0) return [];
      return [{ userId: user.id, categoryId, month: monthKey, limitAmount: BigInt(limit) }];
    });

    if (budgets.length > 0) {
      await prisma.budget.createMany({ data: budgets, skipDuplicates: true });
    }

    // ─── Báo cáo ───
    const [txCount, incomeSum, expenseSum] = await Promise.all([
      prisma.transaction.count({ where: { userId: user.id } }),
      prisma.transaction.aggregate({
        where: { userId: user.id, type: 'income' },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId: user.id, type: 'expense' },
        _sum: { amount: true },
      }),
    ]);

    const vnd = (value: bigint | null) =>
      new Intl.NumberFormat('vi-VN').format(Number(value ?? 0n));

    console.log('');
    console.log('  Đã seed dữ liệu demo');
    console.log('  ─────────────────────────────────────────');
    console.log(`  Email       ${DEMO_EMAIL}`);
    console.log(`  Mật khẩu    ${DEMO_PASSWORD}`);
    console.log('');
    console.log(`  Danh mục    ${categories.length}`);
    console.log(`  Rule        ${rules.length}`);
    console.log(`  Giao dịch   ${txCount}  (${MONTHS_OF_HISTORY} tháng)`);
    console.log(`  Ngân sách   ${budgets.length}  (tháng ${monthKey})`);
    console.log(`  Tổng thu    ${vnd(incomeSum._sum.amount)} đ`);
    console.log(`  Tổng chi    ${vnd(expenseSum._sum.amount)} đ`);
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
