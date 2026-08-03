import { describe, expect, it } from 'vitest';
import { detectAccount } from './account-detect';
import { findProfile, GENERIC_PROFILE } from './bank-profiles';
import { normalize } from './normalizer';
import { CsvParser } from './parsers/csv.parser';
import type { BankProfile, UploadedFile } from './types';

const parser = new CsvParser();

function csv(content: string): UploadedFile {
  const buffer = Buffer.from(content, 'utf8');
  return { originalName: 'sao-ke.csv', buffer, mimeType: 'text/csv', size: buffer.length };
}

async function parse(content: string, profile: BankProfile = GENERIC_PROFILE) {
  return parser.parse(csv(content), profile);
}

/** parse → detect → normalize, đúng thứ tự mà imports.service chạy. */
async function run(content: string, profile: BankProfile = GENERIC_PROFILE) {
  const parsed = await parse(content, profile);
  const detected = detectAccount(profile, parsed.rows);
  const { rows } = normalize(parsed.rows, profile, detected.kind);
  return { detected, rows };
}

/** Tổng chi tiêu THẬT — đúng công thức mà stats dùng. */
function realExpense(rows: { type: string; amount: bigint; internalKind: string | null }[]) {
  return rows
    .filter((row) => row.type === 'expense' && row.internalKind === null)
    .reduce((sum, row) => sum + row.amount, 0n);
}

describe('detectAccount', () => {
  it('có cột MCC → sao kê thẻ tín dụng', async () => {
    const { detected } = await run(
      [
        'Ngày,Diễn giải,MCC,Số tiền',
        '15/07/2026,TCH*THE COFFEE HO,5814,-85.000',
      ].join('\n'),
    );

    expect(detected.kind).toBe('credit_card');
    expect(detected.name).toBe('Thẻ tín dụng');
  });

  it('không MCC nhưng có khoản trả nợ thẻ ở chiều VÀO → vẫn là thẻ', async () => {
    const { detected } = await run(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,Mua Hang / Shopee,-450.200',
        '29/07/2026,Thanh toan sao ke thang 07,2.695.479',
      ].join('\n'),
    );

    expect(detected.kind).toBe('credit_card');
  });

  it('cùng nội dung đó ở chiều RA → tài khoản ngân hàng, không phải thẻ', async () => {
    // Chiều tiền là thứ duy nhất phân biệt hai file ở đây. Nhận nhầm sẽ làm
    // khoản trả nợ trên sao kê ngân hàng không được đánh dấu nội bộ.
    const { detected } = await run(
      ['Ngày,Nội dung,Số tiền', '29/07/2026,Thanh toan sao ke thang 07,-2.695.479'].join('\n'),
    );

    expect(detected.kind).toBe('bank');
    expect(detected.name).toBe('Tài khoản ngân hàng');
  });

  it('profile MoMo → ví điện tử', async () => {
    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');

    const { detected } = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '15/07/2026 09:12:00,Thanh toán Highlands Coffee,-85.000,Thành công',
      ].join('\n'),
      momo,
    );

    expect(detected.kind).toBe('wallet');
    expect(detected.name).toBe('MoMo');
  });

  it('fingerprint ổn định qua các lần import, và tách theo loại nguồn', async () => {
    // Cùng ngân hàng, hai tháng khác nhau → cùng một account. Đây là thứ giữ cho
    // chế độ tạo tự động không đẻ ra một account mới cho mỗi file.
    const july = await run(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,GRAB,-120.000'].join('\n'),
    );
    const august = await run(
      ['Ngày,Nội dung,Số tiền', '15/08/2026,HIGHLANDS,-50.000'].join('\n'),
    );
    expect(august.detected.fingerprint).toBe(july.detected.fingerprint);

    // Nhưng sao kê thẻ của cùng ngân hàng là một nguồn tiền KHÁC
    const card = await run(
      ['Ngày,Diễn giải,MCC,Số tiền', '15/07/2026,SHOPEE,5262,-450.200'].join('\n'),
    );
    expect(card.detected.fingerprint).not.toBe(july.detected.fingerprint);
  });

  it('preset ngân hàng cho tên cụ thể hơn generic', async () => {
    const vcb = findProfile('vcb');
    if (!vcb) throw new Error('thiếu profile vcb');

    const bank = await run(['Ngày,Nội dung,Số tiền', '15/07/2026,GRAB,-120.000'].join('\n'), vcb);
    expect(bank.detected).toMatchObject({ name: 'VCB', fingerprint: 'VCB:bank' });

    const card = await run(
      ['Ngày,Diễn giải,MCC,Số tiền', '15/07/2026,SHOPEE,5262,-450.200'].join('\n'),
      vcb,
    );
    expect(card.detected.name).toBe('Thẻ tín dụng VCB');
  });
});

describe('phân loại khoản nội bộ', () => {
  it('nạp ví: tiền ra khỏi ngân hàng và tiền vào ví, cả hai đều nội bộ', async () => {
    const fromBank = await run(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,NAP TIEN VI MOMO,-500.000'].join('\n'),
    );
    expect(fromBank.rows[0]).toMatchObject({ type: 'expense', internalKind: 'wallet_topup' });

    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');
    const intoWallet = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '15/07/2026 09:12:00,Nạp tiền từ ngân hàng liên kết,500.000,Thành công',
      ].join('\n'),
      momo,
    );
    expect(intoWallet.rows[0]).toMatchObject({ type: 'income', internalKind: 'wallet_topup' });
  });

  it('chi tiêu QUA ví không phải nạp ví', async () => {
    // Tên ví xuất hiện trong mô tả của mọi khoản thanh toán qua ví; khớp trên
    // chữ 'momo' trần sẽ nuốt sạch chi tiêu thật của người dùng.
    const { rows } = await run(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,MOMO Highlands Coffee,-85.000'].join('\n'),
    );

    expect(rows[0]).toMatchObject({ type: 'expense', internalKind: null });
  });

  it('nạp ví ở chiều không hợp lý với loại nguồn thì không đoán', async () => {
    // Tiền VÀO tài khoản ngân hàng kèm chữ "nạp tiền" là ai đó nạp cho mình,
    // tức thu nhập thật — không phải mình chuyển tiền của mình.
    const { rows } = await run(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,NAP TIEN VAO TAI KHOAN,500.000'].join('\n'),
    );

    expect(rows[0]).toMatchObject({ type: 'income', internalKind: null });
  });

  it('chuyển khoản nội bộ được nhận, chuyển tiền thường thì không', async () => {
    const { rows } = await run(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,CHUYEN KHOAN NOI BO,-2.000.000',
        '16/07/2026,CHUYEN TIEN CHO NGUYEN VAN A,-500.000',
      ].join('\n'),
    );

    expect(rows[0]?.internalKind).toBe('self_transfer');
    // Phần lớn khoản chuyển tiền là trả cho người khác — chi tiêu thật.
    expect(rows[1]?.internalKind).toBeNull();
  });

  it('rút tiền ATM vẫn là chi tiêu thật', async () => {
    // Không có tài khoản tiền mặt để tiền chảy vào, nên đánh dấu nội bộ sẽ làm
    // khoản này biến mất khỏi mọi thống kê.
    const { rows } = await run(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,RUT TIEN ATM 970436,-2.000.000'].join('\n'),
    );

    expect(rows[0]).toMatchObject({ type: 'expense', internalKind: null });
  });
});

describe('import cả sao kê thẻ lẫn sao kê ngân hàng', () => {
  const CARD = [
    'Ngày,Diễn giải,MCC,Ghi nợ,Ghi có',
    '13/07/2026,Mua Hàng / WINMART,5411,184.983,0',
    '15/07/2026,Mua Hàng / Shopee,5262,450.200,0',
    '29/07/2026,Thanh toan sao ke the tin dung 07/2026,6012,0,-635.183',
  ].join('\n');

  const BANK = [
    'Ngày,Nội dung,Số tiền',
    '10/07/2026,LUONG THANG 07,20.000.000',
    '20/07/2026,HIGHLANDS COFFEE,-85.000',
    '29/07/2026,Thanh toan sao ke the tin dung thang 07,-635.183',
  ].join('\n');

  it('khoản tiêu bằng thẻ chỉ được đếm MỘT lần', async () => {
    // Đây là lỗi mà cả tính năng này sinh ra để sửa. Trước đây dòng trả nợ trên
    // sao kê ngân hàng được giữ như một khoản chi bình thường, nên 635.183đ đã
    // tiêu bằng thẻ bị cộng thêm lần nữa vào tổng chi.
    const card = await run(CARD);
    const bank = await run(BANK);

    expect(card.detected.kind).toBe('credit_card');
    expect(bank.detected.kind).toBe('bank');

    const cardSpend = realExpense(card.rows);
    const bankSpend = realExpense(bank.rows);

    expect(cardSpend).toBe(635_183n); // 184.983 + 450.200
    expect(bankSpend).toBe(85_000n); // chỉ Highlands; khoản trả nợ đã là nội bộ
    expect(cardSpend + bankSpend).toBe(720_183n);
  });

  it('cả hai vế của khoản trả nợ đều mang card_payment', async () => {
    const card = await run(CARD);
    const bank = await run(BANK);

    const onCard = card.rows.find((row) => row.internalKind !== null);
    const onBank = bank.rows.find((row) => row.internalKind !== null);

    expect(onCard).toMatchObject({ type: 'income', internalKind: 'card_payment' });
    expect(onBank).toMatchObject({ type: 'expense', internalKind: 'card_payment' });
    // Cùng số tiền, hai chiều ngược nhau — nhưng không có bước ghép đôi nào cả.
    expect(onCard?.amount).toBe(onBank?.amount);
  });

  it('thu nhập thật không bị khoản ghi có trên thẻ làm phồng lên', async () => {
    const card = await run(CARD);
    const bank = await run(BANK);

    const realIncome = [...card.rows, ...bank.rows]
      .filter((row) => row.type === 'income' && row.internalKind === null)
      .reduce((sum, row) => sum + row.amount, 0n);

    expect(realIncome).toBe(20_000_000n); // chỉ tiền lương
  });

  it('dòng ghi có trên thẻ được giữ lại để dư nợ giảm được', async () => {
    // Dư nợ = openingBalance + tổng chi trên thẻ − tổng thu trên thẻ. Bỏ dòng
    // ghi có đi thì dư nợ chỉ tăng, không bao giờ giảm.
    const { rows } = await run(CARD);

    const outstanding = rows.reduce(
      (balance, row) => (row.type === 'expense' ? balance + row.amount : balance - row.amount),
      0n,
    );

    expect(outstanding).toBe(0n); // đã trả hết đúng bằng số đã tiêu
  });
});
