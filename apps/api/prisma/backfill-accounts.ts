/**
 * Gán nguồn tiền và cờ nội bộ cho dữ liệu ĐÃ CÓ trong DB.
 *
 * Cột `accountId` và `internalKind` được thêm ở migration
 * 20260803062638_add_accounts_and_internal_kind, và chúng nullable nên mọi giao
 * dịch cũ đang để trống. Với `internalKind` thì "trống" nghĩa là "chi tiêu thật"
 * — tức khoản trả nợ thẻ và nạp ví trong dữ liệu cũ vẫn đang bị đếm hai lần,
 * đúng cái lỗi mà đường import mới đã sửa. Script này lấp khoảng trống ấy.
 *
 * Ba tính chất được giữ, theo thứ tự quan trọng:
 *
 *   KHÔNG phá thứ người dùng đã tự sửa. Giao dịch nào ĐÃ có `internalKind` thì
 *   bỏ qua hoàn toàn, kể cả khi luật hiện tại nói khác — đó là lựa chọn của họ,
 *   thường là sau khi đã bấm "Tính lại".
 *
 *   Chạy lại được nhiều lần. Lần chạy thứ hai không đổi gì và in ra 0.
 *
 *   Mặc định KHÔNG ghi. Phải có `--apply` mới thật sự đụng vào DB, vì script này
 *   LÀM ĐỔI CÁC CON SỐ người dùng đang thấy. Bản xem trước in bảng so sánh tổng
 *   chi trước/sau để họ biết mình đang đồng ý với điều gì.
 *
 * Cách dùng:
 *
 *   tsx prisma/backfill-accounts.ts                     # xem trước, không ghi
 *   tsx prisma/backfill-accounts.ts --apply
 *   tsx prisma/backfill-accounts.ts --apply --email=a@b.com
 *
 * Giới hạn đã biết: nguồn tiền chỉ suy được cho giao dịch đến TỪ IMPORT, qua
 * `ImportBatch.bankProfile`. Giao dịch nhập tay để `accountId = null` (thống kê
 * coi như tiền mặt), và loại nguồn của batch cũ phải đoán từ mô tả vì cột MCC
 * không được lưu vào bảng Transaction — nên một sao kê thẻ không có chữ 'MCC'
 * trong mô tả sẽ bị xếp thành tài khoản ngân hàng. Muốn chính xác cho một file
 * cũ thì rollback lần import đó rồi import lại.
 */
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { defaultAccountName } from '../src/imports/account-detect';
import { findProfile } from '../src/imports/bank-profiles';
import {
  isCardBillPayment,
  isSavingsPocketTransfer,
  isSelfTransfer,
  isWalletTopup,
} from '../src/imports/parse-value';
import { extractMcc } from '../src/imports/mcc';
import { normalizeDescription } from '../src/imports/dedupe';
import { PrismaClient } from '../src/generated/prisma/client';
import type { AccountKind, InternalKind } from '../src/generated/prisma/enums';

loadEnv({ quiet: true });

interface Options {
  apply: boolean;
  email: string | null;
}

function parseArgs(argv: string[]): Options {
  const email = argv.find((arg) => arg.startsWith('--email='))?.slice('--email='.length) ?? null;

  return {
    apply: argv.includes('--apply'),
    email: email === '' ? null : email,
  };
}

interface UserReport {
  email: string;
  accountsCreated: string[];
  batchesLinked: number;
  transactionsLinked: number;
  /** Số giao dịch được đánh dấu nội bộ, theo từng lý do. */
  flagged: Record<InternalKind, number>;
  /** Tổng chi trước và sau khi loại các khoản vừa đánh dấu. */
  expenseBefore: number;
  expenseAfter: number;
}

/**
 * Loại nguồn tiền của một batch cũ, suy từ những gì còn lại trong DB.
 *
 * Yếu hơn `detectAccount` của đường import, và không thể khác được: cột MCC
 * không được lưu vào `Transaction`, nên dấu hiệu mạnh nhất của sao kê thẻ đã
 * mất. Còn lại hai dấu hiệu:
 *
 *   `bankProfile === 'momo'` → ví. Đây là dấu hiệu chắc chắn.
 *   Có dòng THU mà mô tả là thanh toán sao kê thẻ → thẻ. Trên sao kê tài khoản
 *   thanh toán, cùng khoản đó là dòng CHI, nên chiều tiền phân biệt được hai file.
 */
function detectKindOfBatch(
  bankProfile: string | null,
  rows: Array<{ type: string; description: string }>,
): AccountKind {
  if (bankProfile === 'momo') return 'wallet';

  if (rows.some((row) => row.type === 'income' && isCardBillPayment(row.description))) {
    return 'credit_card';
  }

  // Mô tả có nhúng 'MCC 5812' thì cũng chỉ có ở sao kê thẻ.
  if (rows.some((row) => extractMcc(normalizeDescription(row.description)) !== null)) {
    return 'credit_card';
  }

  return 'bank';
}

/**
 * `ImportBatch.bankProfile` lưu ID profile ('generic-iso', 'momo'), còn
 * fingerprint dùng TÊN NGÂN HÀNG ('generic', 'MoMo'). Tra qua findProfile để
 * hai đường sinh ra cùng một khoá — nhờ đó 'generic' và 'generic-iso' cũng gộp
 * về một account, đúng như đường import.
 */
function bankNameOf(bankProfile: string | null): string {
  return findProfile(bankProfile ?? undefined)?.bank ?? 'generic';
}

/**
 * Cùng luật với `classifyInternal` trong normalizer, nhưng đọc `type` của DB
 * thay vì dấu của `amount` — ở đây `amount` luôn dương, chiều nằm ở `type`.
 */
function classifyInternal(
  description: string,
  type: string,
  accountKind: AccountKind,
): InternalKind | null {
  const moneyIn = type === 'income';

  if (isCardBillPayment(description)) {
    if (accountKind === 'credit_card' ? moneyIn : !moneyIn) return 'card_payment';
    return null;
  }

  // Phải đứng trước luật nạp ví, cùng lý do như trong normalizer.
  if (isSavingsPocketTransfer(description)) return 'self_transfer';

  if (isWalletTopup(description)) {
    if (accountKind === 'wallet' ? moneyIn : !moneyIn) return 'wallet_topup';
    return null;
  }

  if (isSelfTransfer(description)) return 'self_transfer';

  return null;
}

async function backfillUser(
  prisma: PrismaClient,
  user: { id: string; email: string },
  options: Options,
): Promise<UserReport> {
  const report: UserReport = {
    email: user.email,
    accountsCreated: [],
    batchesLinked: 0,
    transactionsLinked: 0,
    flagged: { card_payment: 0, wallet_topup: 0, self_transfer: 0 },
    expenseBefore: 0,
    expenseAfter: 0,
  };

  const batches = await prisma.importBatch.findMany({
    where: { userId: user.id, accountId: null },
    select: {
      id: true,
      bankProfile: true,
      transactions: { select: { id: true, type: true, description: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Account đã có (do import mới tạo, hoặc do lần chạy trước của script này).
  const existing = await prisma.account.findMany({
    where: { userId: user.id },
    select: { id: true, fingerprint: true },
  });
  const accountIdByFingerprint = new Map(existing.map((a) => [a.fingerprint, a.id]));

  // ─── 1. Gán nguồn tiền cho từng batch cũ ───
  // Loại nguồn theo batch, giữ lại cho bước 2. Không đọc lại từ
  // `Transaction.account.kind`: ở chế độ xem trước bước 1 chưa ghi gì, nên bước
  // 2 sẽ thấy mọi giao dịch không có nguồn và đoán sai — bản xem trước phải nói
  // đúng điều mà `--apply` sẽ làm, nếu không thì nó vô dụng.
  const kindByBatchId = new Map<string, AccountKind>();

  for (const batch of batches) {
    const kind = detectKindOfBatch(batch.bankProfile, batch.transactions);
    kindByBatchId.set(batch.id, kind);

    // PHẢI cùng công thức với `detectAccount`: `${profile.bank}:${kind}`. Dùng
    // thẳng `bankProfile` (là id) sẽ sinh 'momo:wallet' trong khi import sau
    // sinh 'MoMo:wallet' — hai account cho cùng một cái ví.
    const fingerprint = `${bankNameOf(batch.bankProfile)}:${kind}`;

    let accountId = accountIdByFingerprint.get(fingerprint);

    if (accountId === undefined) {
      const name = defaultAccountName(bankNameOf(batch.bankProfile), kind);
      report.accountsCreated.push(`${name} (${fingerprint})`);

      if (options.apply) {
        const created = await prisma.account.create({
          data: { userId: user.id, fingerprint, name, kind },
          select: { id: true },
        });
        accountId = created.id;
      } else {
        accountId = `(chưa tạo) ${fingerprint}`;
      }
      accountIdByFingerprint.set(fingerprint, accountId);
    }

    report.batchesLinked += 1;
    report.transactionsLinked += batch.transactions.length;

    if (options.apply) {
      await prisma.importBatch.update({ where: { id: batch.id }, data: { accountId } });
      await prisma.transaction.updateMany({
        // Giữ `accountId: null`: nếu có đường nào khác đã gán nguồn cho đúng
        // giao dịch này giữa chừng thì lựa chọn đó thắng.
        where: { importBatchId: batch.id, userId: user.id, accountId: null },
        data: { accountId },
      });
    }
  }

  // ─── 2. Đánh dấu khoản nội bộ ───
  //
  // Đọc lại từ DB thay vì dùng `batches` ở trên: bước này phải phủ cả giao dịch
  // của batch đã có accountId từ trước, không chỉ batch vừa gán.
  const candidates = await prisma.transaction.findMany({
    where: { userId: user.id, internalKind: null },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      importBatchId: true,
      account: { select: { kind: true } },
    },
  });

  const idsByKind = new Map<InternalKind, string[]>();

  for (const row of candidates) {
    if (row.type === 'expense') {
      report.expenseBefore += Number(row.amount);
    }

    // Ưu tiên loại vừa suy ra ở bước 1 (có cả ở chế độ xem trước), rồi mới đến
    // nguồn đã có trong DB. Cuối cùng là 'bank' cho giao dịch nhập tay: luật nội
    // bộ vẫn chạy được vì chiều tiền là thứ quyết định, và với 'bank' thì khoản
    // trả nợ thẻ ở chiều CHI vẫn được nhận ra.
    const kind: AccountKind =
      (row.importBatchId === null ? undefined : kindByBatchId.get(row.importBatchId)) ??
      row.account?.kind ??
      'bank';
    const internalKind = classifyInternal(row.description, row.type, kind);

    if (internalKind === null) {
      if (row.type === 'expense') report.expenseAfter += Number(row.amount);
      continue;
    }

    report.flagged[internalKind] += 1;

    const bucket = idsByKind.get(internalKind);
    if (bucket) bucket.push(row.id);
    else idsByKind.set(internalKind, [row.id]);
  }

  for (const [internalKind, ids] of idsByKind) {
    if (options.apply) {
      await prisma.transaction.updateMany({
        where: { id: { in: ids }, userId: user.id, internalKind: null },
        data: { internalKind },
      });
    }
  }

  return report;
}

function formatVnd(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
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
      console.log(
        options.email ? `Không có user nào với email ${options.email}` : 'Chưa có user nào',
      );
      return;
    }

    if (!options.apply) {
      console.log('── XEM TRƯỚC, không ghi gì. Thêm --apply để thực hiện. ──\n');
    }

    let totalAccounts = 0;
    let totalFlagged = 0;

    for (const user of users) {
      const report = await backfillUser(prisma, user, options);

      const flaggedTotal =
        report.flagged.card_payment + report.flagged.wallet_topup + report.flagged.self_transfer;

      totalAccounts += report.accountsCreated.length;
      totalFlagged += flaggedTotal;

      if (report.accountsCreated.length === 0 && flaggedTotal === 0) continue;

      console.log(user.email);

      for (const name of report.accountsCreated) {
        console.log(`  + nguồn tiền  ${name}`);
      }
      if (report.batchesLinked > 0) {
        console.log(
          `  ~ gán nguồn   ${report.batchesLinked} lần import, ${report.transactionsLinked} giao dịch`,
        );
      }
      if (report.flagged.card_payment > 0) {
        console.log(`  ~ nội bộ      ${report.flagged.card_payment} khoản trả nợ thẻ`);
      }
      if (report.flagged.wallet_topup > 0) {
        console.log(`  ~ nội bộ      ${report.flagged.wallet_topup} khoản nạp ví`);
      }
      if (report.flagged.self_transfer > 0) {
        console.log(`  ~ nội bộ      ${report.flagged.self_transfer} khoản chuyển nội bộ`);
      }

      // Con số quyết định: đây là thứ người dùng sẽ thấy đổi trên dashboard.
      if (report.expenseBefore !== report.expenseAfter) {
        console.log(
          `  → tổng chi    ${formatVnd(report.expenseBefore)} còn ${formatVnd(report.expenseAfter)} ` +
            `(giảm ${formatVnd(report.expenseBefore - report.expenseAfter)})`,
        );
      }
      console.log();
    }

    console.log(
      options.apply
        ? `Xong. Thêm ${totalAccounts} nguồn tiền, đánh dấu ${totalFlagged} khoản nội bộ.`
        : `Sẽ thêm ${totalAccounts} nguồn tiền và đánh dấu ${totalFlagged} khoản nội bộ. Chạy lại với --apply.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
