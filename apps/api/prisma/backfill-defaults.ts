/**
 * Bù danh mục và rule mặc định cho user ĐÃ TỒN TẠI.
 *
 * Bộ mặc định trong `DEFAULT_CATEGORIES` chỉ được copy vào DB một lần, lúc đăng
 * ký (auth.service). Thêm danh mục hoặc keyword mới vào file đó thì user cũ
 * không nhận được gì — script này lấp đúng khoảng trống ấy.
 *
 * Ba tính chất được giữ, theo thứ tự quan trọng:
 *
 *   KHÔNG phá thứ người dùng đã tự sửa. Danh mục đối chiếu theo (tên, chiều),
 *   rule đối chiếu theo keyword. Cái nào đã có thì bỏ qua, kể cả khi nó đang trỏ
 *   sang danh mục khác — đó là lựa chọn của người dùng, không phải lỗi cần sửa.
 *
 *   Chạy lại được nhiều lần. Lần chạy thứ hai không tạo thêm gì và in ra 0.
 *
 *   Mặc định KHÔNG ghi. Phải có `--apply` mới thật sự đụng vào DB, vì script này
 *   chạy trên dữ liệu thật của mọi user chứ không phải trên seed.
 *
 * Cách dùng:
 *
 *   tsx prisma/backfill-defaults.ts                     # xem trước, không ghi
 *   tsx prisma/backfill-defaults.ts --apply
 *   tsx prisma/backfill-defaults.ts --apply --email=a@b.com
 *   tsx prisma/backfill-defaults.ts --apply --recategorize
 *
 * `--recategorize` là bước riêng và phải xin thêm, vì nó sửa giao dịch chứ không
 * chỉ thêm dòng mới. Nó chỉ đụng vào giao dịch đang CHƯA PHÂN LOẠI — danh mục do
 * người dùng tự chọn không bao giờ bị ghi đè.
 */
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories';
import { categorize, type CategorizerRule } from '../src/imports/categorizer';
import { normalizeDescription } from '../src/imports/dedupe';
import { buildMccRules, extractMcc } from '../src/imports/mcc';
import { PrismaClient } from '../src/generated/prisma/client';

loadEnv({ quiet: true });

interface Options {
  apply: boolean;
  recategorize: boolean;
  email: string | null;
}

function parseArgs(argv: string[]): Options {
  const email = argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length) ?? null;

  return {
    apply: argv.includes('--apply'),
    recategorize: argv.includes('--recategorize'),
    email: email === '' ? null : email,
  };
}

interface UserReport {
  email: string;
  categoriesAdded: string[];
  rulesAdded: number;
  /** Keyword đã thuộc về rule khác — bỏ qua, nhưng phải nói ra. */
  rulesSkipped: Array<{ keyword: string; belongsTo: string }>;
  recategorized: number;
}

/** Khoá danh mục. Unique trong DB là (userId, name, type) nên chiều phải nằm trong khoá. */
function categoryKey(name: string, type: string): string {
  return `${type}:${name}`;
}

async function backfillUser(
  prisma: PrismaClient,
  user: { id: string; email: string },
  options: Options,
): Promise<UserReport> {
  const report: UserReport = {
    email: user.email,
    categoriesAdded: [],
    rulesAdded: 0,
    rulesSkipped: [],
    recategorized: 0,
  };

  // ─── 1. Danh mục còn thiếu ───
  const existingCategories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, type: true },
  });
  const haveCategory = new Set(existingCategories.map((c) => categoryKey(c.name, c.type)));

  const missingCategories = DEFAULT_CATEGORIES.filter(
    (category) => !haveCategory.has(categoryKey(category.name, category.type)),
  );

  if (missingCategories.length > 0) {
    report.categoriesAdded = missingCategories.map((c) => `${c.name} (${c.type})`);

    if (options.apply) {
      await prisma.category.createMany({
        data: missingCategories.map((category) => ({
          userId: user.id,
          name: category.name,
          type: category.type,
          icon: category.icon,
          color: category.color,
          sortOrder: category.sortOrder,
        })),
        skipDuplicates: true,
      });
    }
  }

  // Đọc lại sau khi tạo: rule cần id thật của danh mục vừa thêm.
  const categories = options.apply
    ? await prisma.category.findMany({
        where: { userId: user.id },
        select: { id: true, name: true, type: true },
      })
    : existingCategories;

  const categoryIdByKey = new Map(categories.map((c) => [categoryKey(c.name, c.type), c.id]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  if (!options.apply) {
    // Chế độ xem trước không tạo danh mục nên không có id để rule trỏ vào. Gán
    // id giả, nếu không thì rule của danh mục mới không được đếm và con số xem
    // trước báo ít hơn thực tế — đúng cái mà người chạy script dựa vào để quyết
    // định có `--apply` hay không.
    for (const category of missingCategories) {
      categoryIdByKey.set(categoryKey(category.name, category.type), `(chưa tạo) ${category.name}`);
    }
  }

  // ─── 2. Rule còn thiếu ───
  const existingRules = await prisma.categoryRule.findMany({
    where: { userId: user.id },
    select: { keyword: true, categoryId: true },
  });
  const ruleByKeyword = new Map(existingRules.map((r) => [r.keyword, r.categoryId]));

  const missingRules: CategorizerRule[] = [];

  for (const category of DEFAULT_CATEGORIES) {
    const categoryId = categoryIdByKey.get(categoryKey(category.name, category.type));
    if (!categoryId) continue;

    for (const raw of category.keywords) {
      const keyword = raw.toUpperCase();
      const owner = ruleByKeyword.get(keyword);

      if (owner === undefined) {
        missingRules.push({ keyword, categoryId, categoryType: category.type, priority: 0 });
        continue;
      }

      // Keyword đã có nhưng trỏ sang danh mục khác: người dùng đã tự đổi, hoặc
      // một danh mục mặc định khác đã nhận nó trước. Không giành lại.
      if (owner !== categoryId) {
        report.rulesSkipped.push({
          keyword,
          belongsTo: categoryNameById.get(owner) ?? owner,
        });
      }
    }
  }

  report.rulesAdded = missingRules.length;

  if (options.apply && missingRules.length > 0) {
    await prisma.categoryRule.createMany({
      data: missingRules.map((rule) => ({
        userId: user.id,
        keyword: rule.keyword,
        categoryId: rule.categoryId,
        priority: rule.priority,
      })),
      skipDuplicates: true,
    });
  }

  // ─── 3. Phân loại lại các giao dịch chưa phân loại ───
  if (options.recategorize) {
    // Ở chế độ xem trước, rule vừa tính chưa nằm trong DB — phải truyền tay vào,
    // nếu không thì lần xem trước nào cũng báo 0 giao dịch và cả bước này trông
    // như vô dụng.
    report.recategorized = await recategorizeUncategorized(
      prisma,
      user.id,
      options.apply,
      options.apply ? [] : missingRules,
    );
  }

  return report;
}

/**
 * Gán danh mục cho các giao dịch đang để trống, dùng đúng hàm mà đường import
 * dùng — nếu viết lại logic ở đây thì hai đường sẽ trôi khỏi nhau.
 *
 * `normalizedDescription` không được lưu trong bảng Transaction nên phải tính
 * lại từ `description`. Không áp `stripPattern` của bank profile: giao dịch đã
 * mất dấu vết profile sinh ra nó, và bỏ qua strip chỉ làm mô tả DÀI hơn, tức
 * khớp keyword rộng hơn chứ không hụt.
 *
 * MCC cũng chỉ rút lại được từ mô tả. Giao dịch nào lúc import lấy MCC từ CỘT
 * RIÊNG thì ở đây không còn mã đó nữa — cột MCC không được lưu vào bảng
 * Transaction. Nghĩa là bước này bù được ít hơn đường import, và đó là đánh đổi
 * có ý thức: thêm một cột chỉ để chạy lại script thì không đáng. Muốn phân loại
 * đầy đủ theo MCC cho một file cũ thì rollback rồi import lại file đó.
 */
async function recategorizeUncategorized(
  prisma: PrismaClient,
  userId: string,
  apply: boolean,
  pendingRules: CategorizerRule[],
): Promise<number> {
  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    select: { keyword: true, categoryId: true, priority: true, category: { select: { type: true } } },
  });

  const categorizerRules: CategorizerRule[] = [
    ...rules.map((rule) => ({
      keyword: rule.keyword,
      categoryId: rule.categoryId,
      categoryType: rule.category.type,
      priority: rule.priority,
    })),
    ...pendingRules,
  ];

  const categories = await prisma.category.findMany({
    where: { userId },
    select: { id: true, name: true, type: true },
  });
  const mccRules = buildMccRules(categories);

  const rows = await prisma.transaction.findMany({
    where: { userId, categoryId: null },
    select: { id: true, description: true, type: true },
  });

  // Gom theo categoryId rồi update một lần mỗi nhóm, thay vì mỗi giao dịch một
  // câu UPDATE. Vài nghìn dòng chưa phân loại là chuyện bình thường sau khi
  // import vài file.
  const idsByCategory = new Map<string, string[]>();

  for (const row of rows) {
    const normalizedDescription = normalizeDescription(row.description);
    const categoryId = categorize(
      {
        normalizedDescription,
        type: row.type,
        mcc: extractMcc(normalizedDescription),
      },
      categorizerRules,
      mccRules,
    );
    if (categoryId === null) continue;

    const bucket = idsByCategory.get(categoryId);
    if (bucket) bucket.push(row.id);
    else idsByCategory.set(categoryId, [row.id]);
  }

  let updated = 0;
  for (const [categoryId, ids] of idsByCategory) {
    updated += ids.length;
    if (apply) {
      await prisma.transaction.updateMany({
        // Giữ `categoryId: null` trong điều kiện: nếu có request khác gán danh
        // mục cho đúng giao dịch này giữa chừng thì lựa chọn đó thắng.
        where: { id: { in: ids }, userId, categoryId: null },
        data: { categoryId },
      });
    }
  }

  return updated;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('Thiếu DATABASE_URL. Chạy `npm run setup` trước.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const users = await prisma.user.findMany({
      where: options.email ? { email: options.email } : {},
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (users.length === 0) {
      console.log(options.email ? `Không có user nào với email ${options.email}` : 'Chưa có user nào');
      return;
    }

    if (!options.apply) {
      console.log('── XEM TRƯỚC, không ghi gì. Thêm --apply để thực hiện. ──\n');
    }

    let totalCategories = 0;
    let totalRules = 0;
    let totalRecategorized = 0;

    for (const user of users) {
      const report = await backfillUser(prisma, user, options);

      totalCategories += report.categoriesAdded.length;
      totalRules += report.rulesAdded;
      totalRecategorized += report.recategorized;

      const touched =
        report.categoriesAdded.length > 0 || report.rulesAdded > 0 || report.recategorized > 0;
      if (!touched && report.rulesSkipped.length === 0) continue;

      console.log(report.email);
      for (const name of report.categoriesAdded) {
        console.log(`  + danh mục  ${name}`);
      }
      if (report.rulesAdded > 0) {
        console.log(`  + ${report.rulesAdded} rule`);
      }
      for (const skipped of report.rulesSkipped) {
        console.log(`  · bỏ qua keyword "${skipped.keyword}" — đang thuộc "${skipped.belongsTo}"`);
      }
      if (options.recategorize) {
        console.log(`  ~ ${report.recategorized} giao dịch được phân loại lại`);
      }
      console.log();
    }

    const verb = options.apply ? 'Đã thêm' : 'Sẽ thêm';
    console.log(
      `${verb} ${totalCategories} danh mục, ${totalRules} rule` +
        (options.recategorize
          ? `, ${options.apply ? 'đã phân loại lại' : 'sẽ phân loại lại'} ${totalRecategorized} giao dịch`
          : '') +
        ` cho ${users.length} user.`,
    );

    if (!options.apply) {
      console.log('\nChưa ghi gì. Chạy lại với --apply để thực hiện.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
