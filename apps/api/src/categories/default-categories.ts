import type { TxType } from '../generated/prisma/enums';

export interface DefaultCategory {
  name: string;
  type: TxType;
  /** Tên icon trong lucide-react. */
  icon: string;
  /**
   * #RRGGBB cho swatch/dot cạnh tên danh mục.
   *
   * ─── Màu danh mục là TRANG TRÍ, không phải kênh identity ───
   *
   * Người dùng tạo được danh mục không giới hạn, nên không bảng màu cố định nào
   * phủ hết được — và ngay ở 11 danh mục thì đã không thể có 11 màu phân biệt
   * được: kiểm bằng validator cho thấy với đủ 28 cặp thì không thứ tự màu nào
   * đạt ngưỡng, kể cả với người thị lực bình thường.
   *
   * Nên identity của danh mục luôn do **tên + icon** mang, ở mọi chỗ nó xuất hiện.
   * Màu chỉ là dấu hiệu phụ. Và chart KHÔNG BAO GIỜ mã hoá theo màu danh mục:
   * bar breakdown dùng một hue duy nhất, tên danh mục nằm trên trục.
   *
   * Các giá trị dưới đây lấy từ bảng màu đã qua validator (không tự chọn theo
   * cảm quan): mỗi màu đạt lightness band và chroma floor nên swatch nào cũng
   * nhìn thấy được. Bộ màu cũ tôi tự chọn có `#3b82f6`↔`#a855f7` cách nhau CVD
   * ΔE 0.9 — người mù màu deutan không phân biệt nổi — và ba màu xám cách nhau
   * ΔE 5.2 nên người thị lực bình thường cũng không phân biệt được.
   *
   * `#898781` (Khác / Thu khác) cố tình là xám trung tính: nó có nghĩa "không
   * thuộc nhóm nào", nên việc nó không có sắc thái riêng là đúng ý.
   *
   * Màu trùng nhau giữa nhóm thu và nhóm chi là chấp nhận được: hai nhóm không
   * bao giờ hiển thị cạnh nhau như hai nghĩa khác nhau, và `type` luôn hiện.
   */
  color: string;
  sortOrder: number;
  /** Keyword sinh CategoryRule để auto-categorize ngay từ lần import đầu. */
  keywords: string[];
}

/**
 * Danh mục tạo sẵn khi đăng ký.
 *
 * Một app chi tiêu mà mở lên trống trơn thì người dùng phải tự nghĩ ra bộ danh
 * mục trước khi làm được gì — đó là rào cản ngay ở bước đầu. Bộ này bám theo
 * cách chi tiêu ở Việt Nam, và mỗi danh mục mang sẵn keyword để lần import đầu
 * tiên đã tự phân loại được phần lớn giao dịch.
 *
 * Keyword lấy từ tên hay xuất hiện thật trong sao kê ngân hàng VN (đã uppercase,
 * so khớp dạng "contains").
 */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // ─── Chi ───────────────────────────────────────────────────────────────────
  {
    name: 'Ăn uống',
    type: 'expense',
    icon: 'UtensilsCrossed',
    color: '#eb6834',
    sortOrder: 10,
    keywords: [
      'HIGHLANDS',
      'STARBUCKS',
      'PHUC LONG',
      'THE COFFEE HOUSE',
      'KATINAT',
      'MIXUE',
      'GONG CHA',
      'CIRCLE K',
      'GS25',
      'BACHA',
      'AN UONG',
      'NHA HANG',
      'QUAN AN',
      'COFFEE',
      'CAFE',
    ],
  },
  {
    name: 'Đi chợ / Siêu thị',
    type: 'expense',
    icon: 'ShoppingCart',
    color: '#008300',
    sortOrder: 20,
    keywords: [
      'WINMART',
      'VINMART',
      'BACH HOA XANH',
      'COOPMART',
      'CO.OPMART',
      'LOTTE MART',
      'AEON',
      'MEGA MARKET',
      'EMART',
      'SIEU THI',
    ],
  },
  {
    name: 'Di chuyển',
    type: 'expense',
    icon: 'Car',
    color: '#2a78d6',
    sortOrder: 30,
    keywords: [
      'GRAB',
      'BE GROUP',
      'BEGROUP',
      'XANH SM',
      'GOJEK',
      'VATO',
      'TAXI',
      'PETROLIMEX',
      'XANG',
      'VETC',
      'EPASS',
      'VE MAY BAY',
      'VIETNAM AIRLINES',
      'VIETJET',
      'BAMBOO AIRWAYS',
    ],
  },
  {
    name: 'Mua sắm',
    type: 'expense',
    icon: 'ShoppingBag',
    color: '#e87ba4',
    sortOrder: 40,
    keywords: [
      'SHOPEE',
      'LAZADA',
      'TIKI',
      'TIKTOK SHOP',
      'SENDO',
      'UNIQLO',
      'ZARA',
      'H&M',
      'THE GIOI DI DONG',
      'DIEN MAY XANH',
      'FPT SHOP',
    ],
  },
  {
    name: 'Hoá đơn & Tiện ích',
    type: 'expense',
    icon: 'Receipt',
    color: '#eda100',
    sortOrder: 50,
    keywords: [
      'EVN',
      'DIEN LUC',
      'TIEN DIEN',
      'TIEN NUOC',
      'SAWACO',
      'VIETTEL',
      'VINAPHONE',
      'MOBIFONE',
      'FPT TELECOM',
      'VNPT',
      'INTERNET',
      'TIEN NHA',
      'THUE NHA',
    ],
  },
  {
    name: 'Sức khoẻ',
    type: 'expense',
    icon: 'HeartPulse',
    color: '#e34948',
    sortOrder: 60,
    keywords: ['BENH VIEN', 'PHONG KHAM', 'NHA THUOC', 'LONG CHAU', 'PHARMACITY', 'AN KHANG', 'VINMEC'],
  },
  {
    name: 'Giải trí',
    type: 'expense',
    icon: 'Clapperboard',
    color: '#4a3aa7',
    sortOrder: 70,
    keywords: ['CGV', 'LOTTE CINEMA', 'GALAXY CINE', 'BHD STAR', 'NETFLIX', 'SPOTIFY', 'YOUTUBE', 'STEAM'],
  },
  {
    name: 'Giáo dục',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#1baf7a',
    sortOrder: 80,
    keywords: ['HOC PHI', 'TRUONG', 'UDEMY', 'COURSERA', 'IELTS', 'TRUNG TAM'],
  },
  {
    name: 'Chuyển tiền',
    type: 'expense',
    icon: 'ArrowLeftRight',
    color: '#0d9488',
    sortOrder: 90,
    keywords: ['CHUYEN TIEN', 'CK DEN', 'MOMO', 'ZALOPAY', 'VNPAY', 'RUT TIEN', 'ATM'],
  },
  {
    name: 'Phí & Lãi',
    type: 'expense',
    icon: 'Landmark',
    color: '#b45309',
    sortOrder: 100,
    keywords: ['PHI DICH VU', 'PHI SMS', 'PHI THUONG NIEN', 'PHI QUAN LY', 'LAI VAY', 'PHI CHUYEN TIEN'],
  },
  {
    name: 'Khác',
    type: 'expense',
    icon: 'Ellipsis',
    color: '#898781',
    sortOrder: 999,
    keywords: [],
  },

  // ─── Thu ───────────────────────────────────────────────────────────────────
  {
    name: 'Lương',
    type: 'income',
    icon: 'Wallet',
    color: '#008300',
    sortOrder: 10,
    keywords: ['LUONG', 'SALARY', 'THANH TOAN LUONG', 'TRA LUONG'],
  },
  {
    name: 'Thưởng',
    type: 'income',
    icon: 'Gift',
    color: '#1baf7a',
    sortOrder: 20,
    keywords: ['THUONG', 'BONUS', 'KHEN THUONG'],
  },
  {
    name: 'Lãi tiết kiệm',
    type: 'income',
    icon: 'PiggyBank',
    color: '#2a78d6',
    sortOrder: 30,
    keywords: ['LAI TIEN GUI', 'LAI SUAT', 'TIET KIEM'],
  },
  {
    name: 'Thu khác',
    type: 'income',
    icon: 'Plus',
    color: '#898781',
    sortOrder: 999,
    keywords: [],
  },
];
