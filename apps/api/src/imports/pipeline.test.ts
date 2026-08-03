import { describe, expect, it } from 'vitest';
import { detectAccount } from './account-detect';
import { AUTO_DETECT_CANDIDATES, findProfile, GENERIC_PROFILE } from './bank-profiles';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { categorize, categorizeAll, type CategorizerRule } from './categorizer';
import { normalizeDescription } from './dedupe';
import { buildMccRules } from './mcc';
import { normalize } from './normalizer';
import { CsvParser } from './parsers/csv.parser';
import type { UploadedFile } from './types';

const parser = new CsvParser();

function csv(content: string, name = 'sao-ke.csv'): UploadedFile {
  const buffer = Buffer.from(content, 'utf8');
  return { originalName: name, buffer, mimeType: 'text/csv', size: buffer.length };
}

async function parse(content: string, profile = GENERIC_PROFILE) {
  return parser.parse(csv(content), profile);
}

describe('CsvParser — nhận dạng cột', () => {
  it('đọc được sao kê kiểu tách cột nợ/có (phổ biến ở VN)', async () => {
    const result = await parse(
      [
        'Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư',
        '15/07/2026,HIGHLANDS COFFEE,50.000,,1.950.000',
        '16/07/2026,LUONG THANG 7,,20.000.000,21.950.000',
      ].join('\n'),
    );

    expect(result.skipped).toEqual([]);
    expect(result.rows).toHaveLength(2);
    // Nợ = tiền ra = âm
    expect(result.rows[0]?.amount).toBe(-50_000n);
    // Có = tiền vào = dương
    expect(result.rows[1]?.amount).toBe(20_000_000n);
    expect(result.rows[0]?.balance).toBe(1_950_000n);
    expect(result.rows[0]?.date).toBe('2026-07-15');
  });

  it('đọc được sao kê kiểu một cột số tiền có dấu', async () => {
    const result = await parse(
      ['Ngày,Mô tả,Số tiền', '15/07/2026,GRAB,-120.000', '20/07/2026,HOAN TIEN,+45.000'].join(
        '\n',
      ),
    );

    expect(result.rows.map((r) => r.amount)).toEqual([-120_000n, 45_000n]);
  });

  it('không phân biệt hoa thường / dấu / dấu câu ở tên cột', async () => {
    const result = await parse(
      ['NGAY_GIAO_DICH;NOI DUNG;SO TIEN', '15/07/2026;GRAB;-120.000'].join('\n'),
    );
    expect(result.rows).toHaveLength(1);
  });

  it('tự dò delimiter — dấu chấm phẩy khi Excel dùng phẩy thập phân', async () => {
    const result = await parse(['Ngày;Nội dung;Số tiền', '15/07/2026;GRAB;-120.000'].join('\n'));
    expect(result.rows[0]?.amount).toBe(-120_000n);
  });

  it('bỏ qua các dòng tiêu đề sao kê trước hàng header thật', async () => {
    // Số dòng tiêu đề khác nhau giữa các kỳ, nên header được nhận diện bằng
    // nội dung thay vì tin vào skipRows.
    const result = await parse(
      [
        'NGAN HANG TMCP ABC',
        'SAO KE TAI KHOAN',
        'So tai khoan: 0123456789',
        'Ky: 01/07/2026 - 31/07/2026',
        '',
        'Ngày giao dịch,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
      ].join('\n'),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.description).toBe('GRAB');
  });

  it('xử lý BOM của Excel trên Windows', async () => {
    const withBom = `﻿Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-120.000`;
    const buffer = Buffer.from(withBom, 'utf8');
    const result = await parser.parse(
      { originalName: 'a.csv', buffer, mimeType: 'text/csv', size: buffer.length },
      GENERIC_PROFILE,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('xử lý file UTF-16LE', async () => {
    const content = 'Ngày,Nội dung,Số tiền\n15/07/2026,GRAB,-120.000';
    const buffer = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(content, 'utf16le'),
    ]);
    const result = await parser.parse(
      { originalName: 'a.csv', buffer, mimeType: 'text/csv', size: buffer.length },
      GENERIC_PROFILE,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.description).toBe('GRAB');
  });
});

describe('CsvParser — dòng lỗi không được làm hỏng cả lần import', () => {
  it('dòng tổng cộng ở cuối file bị bỏ kèm lý do, các dòng khác vẫn vào', async () => {
    const result = await parse(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,SHOPEE,-350.000',
        ',TỔNG CỘNG,-470.000',
      ].join('\n'),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('Thiếu ngày');
    // Dòng gốc được giữ để người dùng đối chiếu
    expect(result.skipped[0]?.raw).toContain('TỔNG CỘNG');
  });

  it('ngày không đọc được thì bỏ dòng đó, nói rõ định dạng đang dùng', async () => {
    const result = await parse(
      ['Ngày,Nội dung,Số tiền', '2026-07-15,GRAB,-120.000'].join('\n'),
      // profile mặc định là DD/MM/YYYY nên chuỗi ISO không khớp
    );

    expect(result.rows).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('DD/MM/YYYY');
  });

  it('cả cột nợ và cột có đều có số → không đoán, bỏ dòng', async () => {
    const result = await parse(
      ['Ngày,Nội dung,Ghi nợ,Ghi có', '15/07/2026,LOI DU LIEU,50.000,50.000'].join('\n'),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it('file không có hàng header nhận được ra thì báo rõ, không nổ', async () => {
    const result = await parse(['a,b,c', '1,2,3'].join('\n'));
    expect(result.rows).toEqual([]);
    expect(result.skipped[0]?.reason).toContain('Không tìm thấy hàng tiêu đề');
  });

  it('file rỗng không làm nổ parser', async () => {
    expect((await parse('')).rows).toEqual([]);
  });

  it('rowIndex đánh theo các dòng ĐỌC ĐƯỢC, liên tục từ 0', async () => {
    const result = await parse(
      [
        'Ngày,Nội dung,Số tiền',
        ',DONG LOI,-1.000',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,SHOPEE,-350.000',
      ].join('\n'),
    );
    expect(result.rows.map((r) => r.rowIndex)).toEqual([0, 1]);
  });
});

describe('MoMo — sao kê ví điện tử', () => {
  const momoProfile = findProfile('momo');

  // Đúng bộ cột MoMo xuất ra. Trong file thật ô 'Số Dư Sau giao dịch' xuống dòng
  // giữa tên cột; normalizeHeader bỏ khoảng trắng nên hai cách viết là một.
  const HEADER =
    'STT,Thời gian,Mã giao dịch,Loại giao dịch,Tài khoản chuyển,' +
    'Tên định danh Tài khoản chuyển,Tài khoản nhận,Tên định danh Tài khoản nhận,' +
    'Số Tiền,Số Dư Sau giao dịch,Trạng Thái GD';

  const ROWS = [
    '1,03/08/2026 02:21:01,21671353864,Tiền lời Túi Thần Tài ngày 02/08/2026,momo_interest,,0862727051,02/08/2026,765,11.106.805,Thành công',
    '2,02/08/2026 21:28:45,140408248267,Nhận từ LUU KHANH LINH,970422_021220033636,LUU KHANH LINH,0862727051,NGUYỄN KIỀU LINH,3.408.000,11.106.040,Thành công',
    '3,02/08/2026 12:48:25,140333513902,Chuyển tiền/Thanh toán đến DO THI NHUNG,0862727051,NGUYỄN KIỀU LINH,w2b_8887809962_970418,DO THI NHUNG,-57.000,7.697.470,Thành công',
    '4,31/07/2026 23:42:42,140103380338,Nạp tiền điện thoại Viettel,0862727051,NGUYỄN KIỀU LINH,vttizota_vt.airtime,Viettel,-100.000,7.947.340,Thành công',
  ];

  it('profile "momo" có trong registry và trong danh sách tự dò', () => {
    expect(momoProfile).not.toBeNull();
    expect(AUTO_DETECT_CANDIDATES).toContain(momoProfile);
  });

  it('đọc được file MoMo: nội dung ở "Loại giao dịch", số tiền mang dấu', async () => {
    const result = await parse([HEADER, ...ROWS].join('\n'), momoProfile ?? GENERIC_PROFILE);

    expect(result.skipped).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([765n, 3_408_000n, -57_000n, -100_000n]);
    expect(result.rows[1]?.description).toBe('Nhận từ LUU KHANH LINH');
    expect(result.rows[0]?.balance).toBe(11_106_805n);
  });

  it('cột "Thời gian" có kèm giờ — chỉ lấy phần ngày', async () => {
    const result = await parse([HEADER, ...ROWS].join('\n'), momoProfile ?? GENERIC_PROFILE);

    expect(result.rows.map((r) => r.date)).toEqual([
      '2026-08-03',
      '2026-08-02',
      '2026-08-02',
      '2026-07-31',
    ]);
  });

  it('giao dịch không thành công bị bỏ, không được tính vào thu/chi', async () => {
    const failed =
      '5,31/07/2026 15:40:56,140041129377,Nạp tiền vào Túi Thần Tài,0862727051,' +
      'Ngân hàng liên kết,fifinsight_root6,Túi Thần Tài,-60.000,217,Thất bại';

    const result = await parse(
      [HEADER, ...ROWS, failed].join('\n'),
      momoProfile ?? GENERIC_PROFILE,
    );

    expect(result.rows).toHaveLength(4);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('không thành công');
    // Dòng gốc được giữ để người dùng đối chiếu ở preview
    expect(result.skipped[0]?.raw).toContain('Nạp tiền vào Túi Thần Tài');
  });

  it('profile generic cũng đọc được file MoMo — người dùng không cần chọn ví', async () => {
    // "Loại giao dịch" là alias mô tả xếp cuối của generic, nên nó vẫn được dùng
    // khi file không có cột nội dung nào khác.
    const result = await parse([HEADER, ...ROWS].join('\n'));
    expect(result.rows).toHaveLength(4);
    expect(result.rows[3]?.description).toBe('Nạp tiền điện thoại Viettel');
  });

  it('có thêm cột "Ghi chú" để trống thì generic vấp, momo vẫn đọc được', async () => {
    // Đây là lý do MOMO_PROFILE tồn tại: generic ưu tiên 'ghichu' hơn
    // 'loaigiaodich', nên nó chọn đúng cột trống rồi bỏ sạch mọi dòng.
    const header = `${HEADER},Ghi chú`;
    const rows = ROWS.map((row) => `${row},`);

    const generic = await parse([header, ...rows].join('\n'));
    expect(generic.rows).toHaveLength(0);

    const momo = await parse([header, ...rows].join('\n'), momoProfile ?? GENERIC_PROFILE);
    expect(momo.rows).toHaveLength(4);
  });
});

describe('normalize', () => {
  it('bỏ dấu của amount và chuyển chiều sang `type`', async () => {
    const parsed = await parse(
      [
        'Ngày,Nội dung,Số tiền',
        '15/07/2026,GRAB,-120.000',
        '16/07/2026,LUONG,20.000.000',
      ].join('\n'),
    );

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');

    expect(rows[0]?.amount).toBe(120_000n);
    expect(rows[0]?.type).toBe('expense');
    expect(rows[1]?.amount).toBe(20_000_000n);
    expect(rows[1]?.type).toBe('income');
  });

  it('mọi amount trả ra đều dương — bất biến mà CHECK constraint dựa vào', async () => {
    const parsed = await parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,A,-1', '16/07/2026,B,1'].join('\n'),
    );
    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows.every((r) => r.amount > 0n)).toBe(true);
  });

  it('số tiền vượt trần bị bỏ, nghi là đọc sai cột', async () => {
    const parsed = await parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,A,9.999.999.999.999.999'].join('\n'),
    );
    const { rows, skipped } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows).toHaveLength(0);
    expect(skipped[0]?.reason).toContain('đọc sai cột');
  });

  it('gắn sẵn normalizedDescription cho dedupe và categorize dùng', async () => {
    const parsed = await parse(['Ngày,Nội dung,Số tiền', '15/07/2026,Cà phê Highlands,-50.000'].join('\n'));
    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows[0]?.normalizedDescription).toBe('CA PHE HIGHLANDS');
    // Mô tả gốc được giữ nguyên để hiển thị
    expect(rows[0]?.description).toBe('Cà phê Highlands');
  });

  it('stripPattern của profile được áp vào normalizedDescription', async () => {
    const profile = { ...GENERIC_PROFILE, stripPattern: /REF\d+/g };
    const parsed = await parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,THANH TOAN REF998877 SHOPEE,-50.000'].join('\n'),
      profile,
    );
    const { rows } = normalize(parsed.rows, profile);
    expect(rows[0]?.normalizedDescription).toBe('THANH TOAN SHOPEE');
  });
});

describe('categorize', () => {
  const rules: CategorizerRule[] = [
    { keyword: 'GRAB', categoryId: 'di-chuyen', categoryType: 'expense', priority: 0 },
    { keyword: 'COFFEE', categoryId: 'an-uong', categoryType: 'expense', priority: 0 },
    { keyword: 'THE COFFEE HOUSE', categoryId: 'ca-phe', categoryType: 'expense', priority: 0 },
    { keyword: 'LUONG', categoryId: 'luong', categoryType: 'income', priority: 0 },
  ];

  it('khớp keyword đơn giản', async () => {
    expect(categorize({ normalizedDescription: 'GRAB RIDE', type: 'expense' }, rules)).toBe(
      'di-chuyen',
    );
  });

  it('không khớp thì trả null để người dùng tự gán ở preview', async () => {
    expect(categorize({ normalizedDescription: 'QUAN OC CO BA', type: 'expense' }, rules)).toBeNull();
  });

  it('keyword DÀI hơn thắng — nếu không thì kết quả phụ thuộc thứ tự đọc từ DB', async () => {
    expect(
      categorize({ normalizedDescription: 'THE COFFEE HOUSE THAO DIEN', type: 'expense' }, rules),
    ).toBe('ca-phe');
    // Đảo thứ tự mảng cũng phải ra cùng kết quả
    expect(
      categorize(
        { normalizedDescription: 'THE COFFEE HOUSE THAO DIEN', type: 'expense' },
        [...rules].reverse(),
      ),
    ).toBe('ca-phe');
  });

  it('priority đè lên độ dài — rule người dùng thắng rule mặc định', async () => {
    const withOverride: CategorizerRule[] = [
      ...rules,
      { keyword: 'COFFEE', categoryId: 'giai-tri', categoryType: 'expense', priority: 10 },
    ];
    expect(
      categorize({ normalizedDescription: 'THE COFFEE HOUSE', type: 'expense' }, withOverride),
    ).toBe('giai-tri');
  });

  it('rule chỉ áp cho giao dịch cùng chiều thu/chi', async () => {
    // "LUONG" thuộc danh mục thu, nên không được gán cho một khoản chi
    expect(
      categorize({ normalizedDescription: 'TRA LUONG NHAN VIEN', type: 'expense' }, rules),
    ).toBeNull();
    expect(categorize({ normalizedDescription: 'LUONG THANG 7', type: 'income' }, rules)).toBe(
      'luong',
    );
  });

  it('categorizeAll giữ nguyên field cũ và thêm categoryId', async () => {
    const rows = [
      { normalizedDescription: 'GRAB RIDE', type: 'expense' as const, rowIndex: 0 },
      { normalizedDescription: 'KHONG BIET', type: 'expense' as const, rowIndex: 1 },
    ];
    const result = categorizeAll(rows, rules);
    expect(result[0]).toMatchObject({ rowIndex: 0, categoryId: 'di-chuyen' });
    expect(result[1]).toMatchObject({ rowIndex: 1, categoryId: null });
  });
});

describe('categorize với bộ rule mặc định', () => {
  // Dựng rule đúng cách auth.service dựng lúc đăng ký, để test nói về thứ người
  // dùng thật sự nhận được chứ không phải một bộ rule bịa riêng cho test.
  const defaultRules: CategorizerRule[] = DEFAULT_CATEGORIES.flatMap((category) =>
    category.keywords.map((keyword) => ({
      keyword: keyword.toUpperCase(),
      categoryId: `${category.type}:${category.name}`,
      categoryType: category.type,
      priority: 0,
    })),
  );

  const LAI = 'income:Lãi tiết kiệm';
  const HOAN = 'income:Tiền hoàn';

  function categoryOf(description: string, type: 'income' | 'expense'): string | null {
    return categorize({ normalizedDescription: normalizeDescription(description), type }, defaultRules);
  }

  it('tiền lời của ví điện tử vào danh mục lãi', () => {
    expect(categoryOf('Tiền lời Túi Thần Tài ngày 02/08/2026', 'income')).toBe(LAI);
    expect(categoryOf('Tiền lãi tháng 7', 'income')).toBe(LAI);
    expect(categoryOf('Lãi suất tiền gửi', 'income')).toBe(LAI);
  });

  it('tiền hoàn đi vào danh mục riêng, không lẫn vào lãi', () => {
    expect(categoryOf('Hoàn tiền giao dịch không thành công', 'income')).toBe(HOAN);
    expect(categoryOf('Nhận tiền hoàn từ Shopee', 'income')).toBe(HOAN);
    expect(categoryOf('Hoàn trả đơn hàng', 'income')).toBe(HOAN);
    expect(categoryOf('Refund order #12345', 'income')).toBe(HOAN);
    expect(categoryOf('Cashback 5% VNPAY', 'income')).toBe(HOAN);
  });

  it('rút gốc khỏi Túi Thần Tài KHÔNG phải lãi', () => {
    // Lý do 'TUI THAN TAI' không nằm trong keyword: dòng này cũng là một khoản
    // thu, và gọi tiền gốc rút ra là "lãi" thì thổi phồng thu nhập.
    expect(categoryOf('Rút tiền từ Túi Thần Tài', 'income')).toBeNull();
  });

  it('app giao đồ ăn vào Ăn uống, không vào Mua sắm hay Di chuyển', () => {
    const AN_UONG = 'expense:Ăn uống';

    expect(categoryOf('Mua Hàng / Foody', 'expense')).toBe(AN_UONG);
    // Thắng được 'SHOPEE' và 'GRAB' nhờ luật keyword dài hơn thắng
    expect(categoryOf('Thanh toan ShopeeFood', 'expense')).toBe(AN_UONG);
    expect(categoryOf('SHOPEE FOOD HCM', 'expense')).toBe(AN_UONG);
    expect(categoryOf('GrabFood đơn 123', 'expense')).toBe(AN_UONG);
    expect(categoryOf('GRAB FOOD', 'expense')).toBe(AN_UONG);
    expect(categoryOf('Baemin', 'expense')).toBe(AN_UONG);

    // Còn đơn Shopee/Grab thường thì vẫn về đúng chỗ cũ
    expect(categoryOf('Thanh toan Shopee', 'expense')).toBe('expense:Mua sắm');
    expect(categoryOf('Grab chuyến đi', 'expense')).toBe('expense:Di chuyển');
  });

  it('không đụng tới chiều chi', () => {
    // Cùng một chuỗi, chiều chi thì rule thu không được chạm vào
    expect(categoryOf('Nạp tiền vào Túi Thần Tài', 'expense')).toBeNull();
    expect(categoryOf('Hoàn trả khoản vay', 'expense')).toBeNull();
    expect(categoryOf('Hoàn tiền giao dịch không thành công', 'expense')).toBeNull();
  });
});

describe('categorize theo MCC — sao kê thẻ tín dụng', () => {
  // Dựng đúng bộ mà một user thật có sau khi đăng ký: danh mục mặc định + rule
  // keyword mặc định + bảng MCC nối vào chính các danh mục đó.
  const categories = DEFAULT_CATEGORIES.map((category) => ({
    id: `${category.type}:${category.name}`,
    name: category.name,
    type: category.type,
  }));

  const defaultRules: CategorizerRule[] = DEFAULT_CATEGORIES.flatMap((category) =>
    category.keywords.map((keyword) => ({
      keyword: keyword.toUpperCase(),
      categoryId: `${category.type}:${category.name}`,
      categoryType: category.type,
      priority: 0,
    })),
  );

  const mccRules = buildMccRules(categories);

  const AN_UONG = 'expense:Ăn uống';
  const DI_CHUYEN = 'expense:Di chuyển';
  const GIAI_TRI = 'expense:Giải trí';
  const HOAN = 'income:Tiền hoàn';

  function categoryOf(
    description: string,
    type: 'income' | 'expense',
    mcc: string | null = null,
  ): string | null {
    return categorize(
      { normalizedDescription: normalizeDescription(description), type, mcc },
      defaultRules,
      mccRules,
    );
  }

  it('phân loại được descriptor mà không keyword nào bắt được', () => {
    // Đây là lý do tồn tại của cả tính năng: tên trên sao kê thẻ bị cắt cụt, dính
    // tiền tố cổng thanh toán, hoặc là tên hộ kinh doanh cá thể.
    expect(categoryOf('MPOS*88213 CH SO 5', 'expense')).toBeNull();
    expect(categoryOf('MPOS*88213 CH SO 5', 'expense', '5814')).toBe(AN_UONG);

    expect(categoryOf('PAYOO*CTY TNHH ABC', 'expense', '5411')).toBe('expense:Đi chợ / Siêu thị');
    expect(categoryOf('NGUYEN VAN A 0908123456', 'expense', '5812')).toBe(AN_UONG);
    expect(categoryOf('APPLE.COM/BILL', 'expense', '5817')).toBe(GIAI_TRI);
  });

  it('MCC đè lên rule keyword MẶC ĐỊNH', () => {
    // 'GRAB' → Di chuyển là phỏng đoán từ chuỗi; MCC 5814 nói điểm bán này là
    // hàng ăn. Mã do tổ chức thẻ gán thắng phỏng đoán của hệ thống.
    expect(categoryOf('GRAB* A-12345', 'expense')).toBe(DI_CHUYEN);
    expect(categoryOf('GRAB* A-12345', 'expense', '5814')).toBe(AN_UONG);
  });

  it('rule người dùng tự đặt priority thì THẮNG MCC', () => {
    const withUserRule: CategorizerRule[] = [
      ...defaultRules,
      { keyword: 'CANTEEN CTY', categoryId: GIAI_TRI, categoryType: 'expense', priority: 10 },
    ];

    expect(
      categorize(
        { normalizedDescription: 'CANTEEN CTY ABC', type: 'expense', mcc: '5812' },
        withUserRule,
        mccRules,
      ),
    ).toBe(GIAI_TRI);
  });

  it('MCC không được kéo dòng HOÀN TIỀN sang danh mục chi', () => {
    // Hoàn tiền trên thẻ vẫn mang MCC của điểm bán (5812 — nhà hàng) nhưng nó là
    // một khoản THU. Gán vào "Ăn uống" thì chi tiêu tháng đó bị trừ khống.
    expect(categoryOf('HOAN TIEN GIAO DICH NHA HANG', 'income', '5812')).toBe(HOAN);
    // Và không có keyword nào khớp thì để trống, chứ không mượn tạm danh mục chi
    expect(categoryOf('MPOS*88213 CH SO 5', 'income', '5812')).toBeNull();
  });

  it('mã chưa ánh xạ hoặc không có MCC thì mọi thứ như cũ', () => {
    expect(categoryOf('KHACH SAN ABC', 'expense', '7011')).toBeNull();
    expect(categoryOf('HIGHLANDS COFFEE', 'expense', '7011')).toBe(AN_UONG);
    expect(categoryOf('HIGHLANDS COFFEE', 'expense')).toBe(AN_UONG);
  });

  it('danh mục user đã đổi tên thì mã của nó im lặng, không gán bừa', () => {
    const renamed = buildMccRules(categories.filter((category) => category.name !== 'Ăn uống'));

    expect(
      categorize(
        { normalizedDescription: 'MPOS 88213 CH SO 5', type: 'expense', mcc: '5812' },
        defaultRules,
        renamed,
      ),
    ).toBeNull();
  });
});

describe('MCC đi qua cả đường parse → normalize', () => {
  it('đọc được cột MCC của sao kê thẻ', async () => {
    const parsed = await parse(
      [
        'Ngày giao dịch,Diễn giải,MCC,Số tiền ghi nợ,Số tiền ghi có',
        '15/07/2026,TCH*THE COFFEE HO,5814,85.000,',
        '16/07/2026,GRABCAR HCM,4121,120.000,',
        '17/07/2026,CHUYEN KHOAN NOI BO,,500.000,',
      ].join('\n'),
    );

    expect(parsed.skipped).toEqual([]);
    expect(parsed.rows.map((row) => row.mcc)).toEqual(['5814', '4121', null]);

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows.map((row) => row.mcc)).toEqual(['5814', '4121', null]);
  });

  it('rút MCC từ mô tả khi sao kê không tách thành cột', async () => {
    const parsed = await parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,POS 998877 MCC 5812 QUAN AN NGON,-250.000'].join('\n'),
    );

    // Parser chỉ lo cột; mô tả là việc của normalizer, nơi đã có bản chuẩn hoá.
    expect(parsed.rows[0]?.mcc).toBeNull();

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows[0]?.mcc).toBe('5812');
  });

  it('cột MCC thắng chuỗi nằm trong mô tả', async () => {
    const parsed = await parse(
      ['Ngày,Nội dung,MCC,Số tiền', '15/07/2026,MUA HANG MCC 9999,5411,-250.000'].join('\n'),
    );

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows[0]?.mcc).toBe('5411');
  });

  it('sao kê không có cột MCC vẫn nhận bảng bình thường', async () => {
    const parsed = await parse(
      ['Ngày,Nội dung,Số tiền', '15/07/2026,HIGHLANDS,-50.000'].join('\n'),
    );

    expect(parsed.skipped).toEqual([]);
    expect(parsed.rows[0]?.mcc).toBeNull();
  });
});

/**
 * Dựng theo một sao kê Mastercard THẬT, giữ nguyên bốn đặc điểm của nó:
 *
 *   1. Header song ngữ, hai dòng trong cùng một ô — cột MCC thành 'mccmcc'
 *   2. Ô MCC ghép cả tên ngành: '5812-Eating Places'
 *   3. Dòng phân cách "Số thẻ / Card number" xen giữa các giao dịch
 *   4. Cột "Ghi có" mang số ÂM cho hoàn tiền và thanh toán sao kê
 *
 * Cả bốn đều là thứ chỉ lộ ra khi có file thật; không cái nào đoán được từ spec.
 */
describe('sao kê thẻ tín dụng Mastercard — file thật', () => {
  const HEADER = [
    '"Ngày giao dịch\nTransaction date"',
    '"Ngày hạch toán\nPost date"',
    '"Diễn giải\nDetails"',
    '"MCC\nMCC"',
    '"Ghi nợ/Debit\n(VND)"',
    '"Ghi có/Credit\n(VND)"',
  ].join(';');

  const STATEMENT = [
    'Phát sinh có trong kỳ (VND) (Total Credit Transaction);2.795.479,00',
    'Dư nợ cuối kỳ (VND) (End Balance);4.151.211,00',
    'Thanh toán tối thiểu (VND) (Minimum Payment Due);207.561,00',
    HEADER,
    '"Số thẻ/ Số tài khoản\nCard number / Account number";;513892******4705;;;',
    '13/04/2026;15/04/2026;Mua Hàng / 7ELEVEN_3002;5499-Food Stores;48.000,00;0,00',
    '13/04/2026;15/04/2026;Mua Hàng / FPT*TIKTOKSHOP;5722-Household Stores;76.999,00;0,00',
    '13/04/2026;16/04/2026;Mua Hàng / WCM_WINMART 6101 LE DU;5411-Grocery Stores;184.983,00;0,00',
    '14/04/2026;16/04/2026;Mua Hàng / Shopee;5411-Grocery Stores;165.600,00;0,00',
    '15/04/2026;17/04/2026;Mua Hàng / TLJ Duy Tan;5814-Fast Food;204.000,00;0,00',
    '19/04/2026;21/04/2026;Mua Hàng / PAYOO*KOI HNC;5814-Fast Food;138.000,00;0,00',
    '06/05/2026;08/05/2026;Mua Hàng / Shopee;5262-Marketplaces;450.200,00;0,00',
    '"Số thẻ/ Số tài khoản\nCard number / Account number";;700006792802;;;',
    '11/04/2026;11/04/2026;[700006792802] - Hoan tien giao dich Card on File ky thang 04/2026;;0,00;-100.000,00',
    '29/04/2026;29/04/2026;513892xxxxxx4705-700006792802 - Thanh toan sao ke the Master Card 04/2026;6012-Member Financial;0,00;-2.695.479,00',
    'Phát sinh nợ trong kỳ (VND) (Total Debit Transaction);;;;;4.151.211,00',
  ].join('\n');

  const categories = DEFAULT_CATEGORIES.map((category) => ({
    id: `${category.type}:${category.name}`,
    name: category.name,
    type: category.type,
  }));

  const defaultRules: CategorizerRule[] = DEFAULT_CATEGORIES.flatMap((category) =>
    category.keywords.map((keyword) => ({
      keyword: keyword.toUpperCase(),
      categoryId: `${category.type}:${category.name}`,
      categoryType: category.type,
      priority: 0,
    })),
  );

  const mccRules = buildMccRules(categories);

  async function run() {
    const parsed = await parse(STATEMENT);
    // Đi qua detectAccount thật thay vì đóng cứng 'credit_card': việc file này
    // được nhận ra là sao kê thẻ cũng là một phần cần kiểm.
    const detected = detectAccount(GENERIC_PROFILE, parsed.rows);
    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, detected.kind);
    return {
      parsed,
      detected,
      rows: rows.map((row) => ({ ...row, categoryId: categorize(row, defaultRules, mccRules) })),
    };
  }

  it('nhận ra đây là sao kê thẻ tín dụng, không phải tài khoản ngân hàng', async () => {
    const { detected } = await run();

    expect(detected.kind).toBe('credit_card');
    expect(detected.fingerprint).toBe('generic:credit_card');
  });

  it('nhận đúng cột dù header song ngữ hai dòng', async () => {
    const { parsed } = await run();

    // 9 giao dịch: 7 dòng mua hàng + 1 hoàn tiền + 1 thanh toán sao kê. Chỉ dòng
    // "Số thẻ" và các dòng tổng cộng bị bỏ.
    expect(parsed.rows).toHaveLength(9);
    // Ngày lấy ở cột GIAO DỊCH, không phải cột hạch toán
    expect(parsed.rows[0]?.date).toBe('2026-04-13');
  });

  it('đọc được ô MCC ghép cả tên ngành tiếng Anh', async () => {
    const { parsed } = await run();

    expect(parsed.rows.map((row) => row.mcc)).toEqual([
      '5499',
      '5722',
      '5411',
      '5411',
      '5814',
      '5814',
      '5262',
      null, // dòng hoàn tiền không có MCC
      '6012', // thanh toán sao kê — MCC nhóm tài chính
    ]);
  });

  it('dòng phân cách "Số thẻ" và dòng tổng cộng bị bỏ kèm lý do', async () => {
    const { parsed } = await run();

    const byDate = parsed.skipped.filter((skipped) => /ngày/i.test(skipped.reason));
    expect(byDate).toHaveLength(3);
  });

  it('ghi nợ thành chi, ghi có ÂM thành thu', async () => {
    const { rows } = await run();

    expect(rows[0]).toMatchObject({ type: 'expense', amount: 48_000n });
    // Sao kê ghi -100.000 ở cột Ghi có: tiền trả lại, làm giảm dư nợ
    expect(rows[7]).toMatchObject({ type: 'income', amount: 100_000n });
  });

  it('phân loại được cả những dòng keyword bó tay', async () => {
    const { rows } = await run();
    const category = (index: number) => rows[index]?.categoryId;

    // '7ELEVEN_3002' và 'TLJ Duy Tan' không có trong bộ keyword nào
    expect(category(0)).toBe('expense:Đi chợ / Siêu thị');
    expect(category(4)).toBe('expense:Ăn uống');
    // 'FPT*TIKTOKSHOP' — keyword 'TIKTOK SHOP' có khoảng trắng nên trượt
    expect(category(1)).toBe('expense:Mua sắm');
    // 'PAYOO*KOI HNC' — tên cổng thanh toán che mất tên quán
    expect(category(5)).toBe('expense:Ăn uống');
    // WINMART: MCC và keyword nói cùng một điều
    expect(category(2)).toBe('expense:Đi chợ / Siêu thị');
  });

  it('cùng là Shopee nhưng MCC khác nhau thì vào danh mục khác nhau', async () => {
    const { rows } = await run();

    // Đây là hệ quả trực tiếp của việc MCC đè lên keyword mặc định, và nó CÓ THẬT
    // trên sao kê: Shopee đăng ký nhiều điểm bán với ngành nghề khác nhau.
    expect(rows[3]?.categoryId).toBe('expense:Đi chợ / Siêu thị'); // 5411
    expect(rows[6]?.categoryId).toBe('expense:Mua sắm'); // 5262 — sàn TMĐT
  });

  it('hoàn tiền vào "Tiền hoàn", không bị MCC kéo sang danh mục chi', async () => {
    const { rows } = await run();

    expect(rows[7]).toMatchObject({ type: 'income', categoryId: 'income:Tiền hoàn' });
  });

  it('THANH TOÁN SAO KÊ được giữ nhưng đánh dấu nội bộ, không vào tổng thu', async () => {
    const { parsed, rows } = await run();

    // 2,7 triệu trả nợ thẻ là tiền đổi chỗ giữa hai túi của cùng một người. Nó
    // được GIỮ — dư nợ thẻ cần dòng ghi có này mới giảm được — nhưng mang
    // internalKind nên mọi query thống kê lọc nó ra.
    const payment = rows.find((row) => row.amount === 2_695_479n);
    expect(payment).toMatchObject({ type: 'income', internalKind: 'card_payment' });

    // Không bị bỏ, nên không xuất hiện trong danh sách dòng bị skip
    expect(parsed.skipped.some((row) => /thanh toán sao kê/i.test(row.reason))).toBe(false);

    // Thu nhập THẬT chỉ còn dòng hoàn tiền
    const realIncome = rows.filter((row) => row.type === 'income' && row.internalKind === null);
    expect(realIncome).toHaveLength(1);
    expect(realIncome[0]?.amount).toBe(100_000n);
  });

  it('hoàn tiền KHÔNG bị coi là nội bộ — đó là tiền thật được trả lại', async () => {
    const { rows } = await run();

    expect(rows[7]).toMatchObject({ amount: 100_000n, internalKind: null });
  });

  it('mặt kia của cùng giao dịch, trên sao kê ngân hàng, cũng là nội bộ', async () => {
    // Đây là ca sinh ra việc đếm hai lần: khoản mua bằng thẻ nằm ở file thẻ, còn
    // file ngân hàng có khoản trả nợ. Cả hai vế cùng mang internalKind nên không
    // vế nào cộng vào chi tiêu, và các dòng mua hàng chỉ được đếm một lần.
    const parsed = await parse(
      [
        'Ngày,Nội dung,Số tiền',
        '29/04/2026,Thanh toan sao ke the tin dung thang 04,-2.695.479',
      ].join('\n'),
    );

    expect(detectAccount(GENERIC_PROFILE, parsed.rows).kind).toBe('bank');

    const { rows } = normalize(parsed.rows, GENERIC_PROFILE, 'bank');
    expect(rows[0]).toMatchObject({
      type: 'expense',
      amount: 2_695_479n,
      internalKind: 'card_payment',
    });
  });
});
