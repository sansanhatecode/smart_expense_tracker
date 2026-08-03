import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { buildMccRules, extractMcc, lookupMcc, mccGroups, parseMcc } from './mcc';

describe('bảng MCC', () => {
  it('mọi danh mục được nhắc tới đều CÓ THẬT trong DEFAULT_CATEGORIES', () => {
    // Bảng MCC nối với danh mục bằng tên. Gõ sai một chữ hoặc đổi tên danh mục ở
    // file kia thì cả nhóm mã đó lặng lẽ ngừng hoạt động — không lỗi, không log,
    // chỉ là giao dịch không được phân loại nữa. Test này là thứ duy nhất bắt được.
    const known = new Set(DEFAULT_CATEGORIES.map((category) => `${category.type}:${category.name}`));

    for (const group of mccGroups()) {
      expect(known, `nhóm MCC "${group.category}" (${group.type})`).toContain(
        `${group.type}:${group.category}`,
      );
    }
  });

  it('không ánh xạ mã nào vào "Khác"', () => {
    // Vào "Khác" là đã tính như đã phân loại, nên nó biến mất khỏi số đếm
    // chưa-phân-loại ở preview và người dùng không còn được nhắc để sửa.
    for (const group of mccGroups()) {
      expect(group.category).not.toBe('Khác');
      expect(group.category).not.toBe('Thu khác');
    }
  });

  it('chỉ ánh xạ danh mục CHI — MCC là mã điểm bán, không phải nguồn thu', () => {
    for (const group of mccGroups()) {
      expect(group.type).toBe('expense');
    }
  });

  it('tra được các mã hay gặp trên sao kê thẻ ở VN', () => {
    expect(lookupMcc('5812')?.category).toBe('Ăn uống'); // nhà hàng
    expect(lookupMcc('5814')?.category).toBe('Ăn uống'); // đồ ăn nhanh, giao đồ ăn
    expect(lookupMcc('5411')?.category).toBe('Đi chợ / Siêu thị'); // siêu thị
    expect(lookupMcc('5499')?.category).toBe('Đi chợ / Siêu thị'); // cửa hàng tiện lợi
    expect(lookupMcc('4121')?.category).toBe('Di chuyển'); // Grab, Be, Xanh SM
    expect(lookupMcc('5541')?.category).toBe('Di chuyển'); // cây xăng
    expect(lookupMcc('4511')?.category).toBe('Di chuyển'); // hàng không
    expect(lookupMcc('5691')?.category).toBe('Mua sắm'); // quần áo, trong khoảng 5611–5699
    expect(lookupMcc('5732')?.category).toBe('Mua sắm'); // điện tử
    expect(lookupMcc('4814')?.category).toBe('Hoá đơn & Tiện ích'); // cước viễn thông
    expect(lookupMcc('4900')?.category).toBe('Hoá đơn & Tiện ích'); // điện nước
    expect(lookupMcc('5912')?.category).toBe('Sức khoẻ'); // nhà thuốc
    expect(lookupMcc('8062')?.category).toBe('Sức khoẻ'); // bệnh viện, trong khoảng 8011–8099
    expect(lookupMcc('5815')?.category).toBe('Giải trí'); // nội dung số (Netflix, Spotify)
    expect(lookupMcc('7832')?.category).toBe('Giải trí'); // rạp chiếu phim
    expect(lookupMcc('8220')?.category).toBe('Giáo dục'); // đại học
    expect(lookupMcc('6011')?.category).toBe('Chuyển tiền'); // rút tiền ATM
  });

  it('tra được các mã lấy từ sao kê Mastercard thật', () => {
    // Toàn bộ MCC xuất hiện trong một kỳ sao kê thẻ thật — nếu thiếu mã nào thì
    // đúng những dòng người dùng nhìn thấy nhiều nhất lại không được phân loại.
    expect(lookupMcc('5262')?.category).toBe('Mua sắm'); // sàn TMĐT — mã mới, hay bị bỏ sót
    expect(lookupMcc('5722')?.category).toBe('Mua sắm'); // đồ gia dụng
    expect(lookupMcc('5499')?.category).toBe('Đi chợ / Siêu thị'); // 7-Eleven
    expect(lookupMcc('6012')?.category).toBe('Chuyển tiền'); // thanh toán sao kê
  });

  it('5715 là bia rượu, không bị dải nội thất 5712–5719 nuốt mất', () => {
    expect(lookupMcc('5715')?.category).toBe('Ăn uống');
    expect(lookupMcc('5714')?.category).toBe('Mua sắm');
    expect(lookupMcc('5718')?.category).toBe('Mua sắm');
  });

  it('tra được nhóm phương tiện — khoản chi lớn và phổ biến ở VN', () => {
    expect(lookupMcc('5571')?.category).toBe('Di chuyển'); // đại lý xe máy
    expect(lookupMcc('5532')?.category).toBe('Di chuyển'); // cửa hàng lốp
    expect(lookupMcc('7535')?.category).toBe('Di chuyển'); // sơn xe
  });

  it('mã chưa ánh xạ trả null thay vì đoán bừa', () => {
    // 7011 (khách sạn) cố tình để trống: nó không phải "Di chuyển" mà cũng không
    // thuộc danh mục nào khác đang có. Để trống thì nó hiện ở preview cho người
    // dùng chọn, ánh xạ bừa thì nó vào sai chỗ mà không ai biết.
    expect(lookupMcc('7011')).toBeNull();
    expect(lookupMcc('9999')).toBeNull();
    expect(lookupMcc('')).toBeNull();
    expect(lookupMcc(null)).toBeNull();
    expect(lookupMcc(undefined)).toBeNull();
  });

  it('mã nằm sát ngoài khoảng không bị dính vào khoảng đó', () => {
    // 5611–5699 là Mua sắm; 5610 và 5700 không được ăn theo.
    expect(lookupMcc('5610')).toBeNull();
    expect(lookupMcc('5700')).toBeNull();
    // 5975/5976 (máy trợ thính, dụng cụ chỉnh hình) là lỗ hổng cố ý trong dải
    // 5970–5978 của Mua sắm.
    expect(lookupMcc('5975')?.category).toBe('Sức khoẻ');
    expect(lookupMcc('5974')?.category).toBe('Mua sắm');
    expect(lookupMcc('5977')?.category).toBe('Mua sắm');
  });
});

describe('parseMcc — đọc ô của cột MCC', () => {
  it('đọc chuỗi 4 chữ số', () => {
    expect(parseMcc('5812')).toBe('5812');
    expect(parseMcc(' 5812 ')).toBe('5812');
  });

  it('đọc số của XLSX và bù lại số 0 bị mất ở đầu', () => {
    // Excel đọc ô '0742' thành số 742. Không bù thì tra bảng trượt hoàn toàn.
    expect(parseMcc(5812)).toBe('5812');
    expect(parseMcc(742)).toBe('0742');
  });

  it('đọc được ô ghép cả mô tả ngành nghề', () => {
    expect(parseMcc('5812 - Nhà hàng')).toBe('5812');
    expect(parseMcc('5411/Sieu thi')).toBe('5411');
  });

  it('bỏ dấu nháy Excel dùng để ép ô thành text', () => {
    expect(parseMcc("'5812")).toBe('5812');
  });

  it('trả null khi ô không phải MCC', () => {
    expect(parseMcc(null)).toBeNull();
    expect(parseMcc(undefined)).toBeNull();
    expect(parseMcc('')).toBeNull();
    expect(parseMcc('  ')).toBeNull();
    expect(parseMcc('N/A')).toBeNull();
    expect(parseMcc(true)).toBeNull();
    expect(parseMcc(new Date())).toBeNull();
    // '0000' là ô trống được điền cho đủ, không phải một ngành nghề
    expect(parseMcc('0000')).toBeNull();
    expect(parseMcc(0)).toBeNull();
    // Quá dài thì không phải MCC — nhiều khả năng đọc trúng cột khác
    expect(parseMcc('58120')).toBeNull();
    expect(parseMcc(58_120)).toBeNull();
    expect(parseMcc('58')).toBeNull();
  });
});

describe('extractMcc — rút MCC nằm trong mô tả', () => {
  // Nhận `normalizedDescription`: đã uppercase, mọi ký tự lạ thành khoảng trắng.
  it('nhận các cách viết thường gặp', () => {
    expect(extractMcc('THANH TOAN THE MCC 5812 NHA HANG ABC')).toBe('5812');
    expect(extractMcc('POS 123456 MCC5411 WINMART')).toBe('5411');
    expect(extractMcc('MCC 4121 GRAB')).toBe('4121');
  });

  it('BẮT BUỘC có nhãn MCC — không nhận bừa cụm 4 chữ số', () => {
    // Đây là điểm quan trọng nhất của hàm này. Mô tả giao dịch thẻ đầy số 4 chữ
    // số: 4 số cuối thẻ, mã chuẩn chi, năm. Nhận bừa thì giao dịch bay sang một
    // danh mục ngẫu nhiên mà không có gì báo.
    expect(extractMcc('THANH TOAN THE 1234 TAI ABC')).toBeNull();
    expect(extractMcc('CHUYEN KHOAN 2026 CHO NGUYEN VAN A')).toBeNull();
    expect(extractMcc('MUA HANG SHOPEE DON 5812')).toBeNull();
  });

  it('không nhận cụm số dài hơn 4 chữ số', () => {
    expect(extractMcc('MCC 58120 ABC')).toBeNull();
    expect(extractMcc('MCC 581')).toBeNull();
  });

  it('bỏ qua mã 0000', () => {
    expect(extractMcc('MCC 0000 KHONG XAC DINH')).toBeNull();
  });
});

describe('buildMccRules — nối bảng MCC với danh mục của một user', () => {
  const categories = DEFAULT_CATEGORIES.map((category, index) => ({
    id: `cat-${index}`,
    name: category.name,
    type: category.type,
  }));

  function idOf(name: string): string {
    const index = DEFAULT_CATEGORIES.findIndex((category) => category.name === name);
    return `cat-${index}`;
  }

  it('trỏ mã vào đúng id danh mục của user', () => {
    const rules = buildMccRules(categories);

    expect(rules.get('5812')).toEqual({
      mcc: '5812',
      categoryId: idOf('Ăn uống'),
      categoryType: 'expense',
    });
    expect(rules.get('6011')?.categoryId).toBe(idOf('Chuyển tiền'));
  });

  it('bỏ qua mã trỏ vào danh mục user đã xoá hoặc đổi tên', () => {
    // Đổi tên là chuyện người dùng có quyền làm. Mất tự động phân loại theo MCC
    // cho danh mục đó là hệ quả chấp nhận được; gán vào một danh mục đoán mò thì không.
    const renamed = categories.filter((category) => category.name !== 'Ăn uống');
    const rules = buildMccRules(renamed);

    expect(rules.has('5812')).toBe(false);
    expect(rules.has('5411')).toBe(true);
  });

  it('user chưa có danh mục nào thì ra bảng rỗng, không nổ', () => {
    expect(buildMccRules([]).size).toBe(0);
  });
});
