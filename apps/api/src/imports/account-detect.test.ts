import { describe, expect, it } from 'vitest';
import { detectAccount } from './account-detect';
import { AUTO_DETECT_CANDIDATES, findProfile, GENERIC_PROFILE } from './bank-profiles';
import { beatsBest } from './detect-profile';
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

/**
 * Dò profile như imports.service làm khi người dùng không chọn ngân hàng.
 *
 * Lặp lại vòng lặp thay vì gọi service, nhưng dùng CHUNG hàm `beatsBest` — luật
 * chọn profile là thứ đang được kiểm, và nó phải chỉ có một bản.
 */
async function parseAuto(content: string) {
  let best: { result: Awaited<ReturnType<typeof parse>>; profile: BankProfile } | null = null;

  for (const profile of AUTO_DETECT_CANDIDATES) {
    const result = await parse(content, profile);
    if (!best || beatsBest(result, best.result)) best = { result, profile };
  }

  if (!best) throw new Error('không dò được profile');
  return best;
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

  it('file MoMo tự dò ra profile MoMo, không rơi vào generic', async () => {
    // Hồi quy: generic đọc trọn file MoMo y hệt profile MoMo và được thử trước,
    // nên nó thắng thế hoà. Hậu quả không dừng ở cái tên — file ví bị xếp thành
    // tài khoản ngân hàng, gộp fingerprint với ngân hàng thật, và khoản nạp ví
    // (tiền VÀO ví) thành thu nhập vì luật nội bộ đòi kind phải là 'wallet'.
    const content = [
      'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD,Số Dư Sau Giao Dịch',
      '18/07/2026 09:12:00,Nạp tiền từ ngân hàng liên kết,1.000.000,Thành công,1.000.000',
      '20/07/2026 12:30:00,Thanh toán Highlands Coffee,-95.000,Thành công,905.000',
    ].join('\n');

    const parsed = await parseAuto(content);
    expect(parsed.profile.id).toBe('momo');

    const detected = detectAccount(parsed.profile, parsed.result.rows);
    expect(detected).toMatchObject({ kind: 'wallet', fingerprint: 'MoMo:wallet' });

    const { rows } = normalize(parsed.result.rows, parsed.profile, detected.kind);
    expect(rows[0]).toMatchObject({ type: 'income', internalKind: 'wallet_topup' });
    // Chi tiêu qua ví vẫn là chi tiêu thật
    expect(rows[1]).toMatchObject({ type: 'expense', internalKind: null });
  });

  it('sao kê ngân hàng KHÔNG bị chữ ký MoMo kéo sang ví', async () => {
    // Chữ ký chỉ phá thế hoà. File ngân hàng không có đủ cả hai cột chữ ký nên
    // generic vẫn thắng, kể cả khi nó có cột trạng thái.
    const parsed = await parseAuto(
      [
        'Ngày giao dịch,Nội dung,Số tiền,Trạng thái',
        '15/07/2026,GRAB,-120.000,Thành công',
      ].join('\n'),
    );

    expect(parsed.profile.id).toBe('generic');
    expect(detectAccount(parsed.profile, parsed.result.rows).kind).toBe('bank');
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

  it('cất tiền vào Túi Thần Tài: CẢ HAI vế đều là nội bộ', async () => {
    // Dựng theo sao kê MoMo thật. Điểm mấu chốt: hai vế mang ĐÚNG một mô tả, chỉ
    // khác dấu, vì file phủ cả ví lẫn túi. Luật nạp ví đòi tiền phải VÀO ví nên
    // nó chỉ bắt được vế +1tr, còn vế −1tr thành một khoản chi thật không có —
    // tổng chi phồng lên đúng bằng số tiền vừa cất đi.
    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');

    const { rows } = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '06/01/2026 09:00:00,Nạp tiền vào Túi Thần Tài,-1.000.000,Thành công',
        '06/01/2026 09:00:01,Nạp tiền vào Túi Thần Tài,1.000.000,Thành công',
      ].join('\n'),
      momo,
    );

    expect(rows[0]).toMatchObject({ type: 'expense', internalKind: 'self_transfer' });
    expect(rows[1]).toMatchObject({ type: 'income', internalKind: 'self_transfer' });
    // Cất tiền vào túi không làm chi tiêu tăng lên đồng nào
    expect(realExpense(rows)).toBe(0n);
  });

  it('LÃI Túi Thần Tài là thu nhập thật, không bị loại', async () => {
    // Đây là khoản duy nhất liên quan tới cái túi mà tiền thật sự sinh ra. Loại
    // nó đi là ăn bớt thu nhập của người dùng.
    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');

    const { rows } = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '06/01/2026 09:00:00,Nhận lãi Túi Thần Tài ngày 06/01/2026,4.521,Thành công',
        '07/01/2026 09:00:00,Nhận tiền lãi Túi Thần Tài,3.180,Thành công',
      ].join('\n'),
      momo,
    );

    expect(rows[0]).toMatchObject({ type: 'income', internalKind: null });
    // Cách viết thứ hai có cả tên túi lẫn 'nhận tiền' — điều kiện tên túi + động
    // từ chuyển tiền không đủ để chặn nó, phải có luật loại trừ tiền lãi.
    expect(rows[1]).toMatchObject({ type: 'income', internalKind: null });
  });

  it('nạp tiền điện thoại KHÔNG bị luật túi tiết kiệm nuốt theo', async () => {
    // Cũng là tiền RA khỏi ví và cũng có chữ 'nạp tiền', nhưng không có tên túi.
    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');

    const { rows } = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '06/01/2026 09:00:00,Nạp tiền điện thoại Viettel,-100.000,Thành công',
      ].join('\n'),
      momo,
    );

    expect(rows[0]).toMatchObject({ type: 'expense', internalKind: null });
  });

  it('rút tiền khỏi Túi Thần Tài cũng là nội bộ, cả hai vế', async () => {
    const momo = findProfile('momo');
    if (!momo) throw new Error('thiếu profile momo');

    const { rows } = await run(
      [
        'Thời gian,Loại Giao Dịch,Số Tiền,Trạng Thái GD',
        '10/01/2026 09:00:00,Rút tiền từ Túi Thần Tài,-1.000.000,Thành công',
        '10/01/2026 09:00:01,Nhận tiền từ ví vào Túi Thần Tài,1.000.000,Thành công',
      ].join('\n'),
      momo,
    );

    expect(rows.every((row) => row.internalKind === 'self_transfer')).toBe(true);
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
