import type { TxType } from '../generated/prisma/enums';

export interface DefaultCategory {
  name: string;
  type: TxType;
  /** Tên icon trong lucide-react. */
  icon: string;
  /** #RRGGBB — đi thẳng vào màu series của chart. */
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
    color: '#f97316',
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
    color: '#84cc16',
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
    color: '#06b6d4',
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
    color: '#ec4899',
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
    color: '#eab308',
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
    color: '#ef4444',
    sortOrder: 60,
    keywords: ['BENH VIEN', 'PHONG KHAM', 'NHA THUOC', 'LONG CHAU', 'PHARMACITY', 'AN KHANG', 'VINMEC'],
  },
  {
    name: 'Giải trí',
    type: 'expense',
    icon: 'Clapperboard',
    color: '#a855f7',
    sortOrder: 70,
    keywords: ['CGV', 'LOTTE CINEMA', 'GALAXY CINE', 'BHD STAR', 'NETFLIX', 'SPOTIFY', 'YOUTUBE', 'STEAM'],
  },
  {
    name: 'Giáo dục',
    type: 'expense',
    icon: 'GraduationCap',
    color: '#3b82f6',
    sortOrder: 80,
    keywords: ['HOC PHI', 'TRUONG', 'UDEMY', 'COURSERA', 'IELTS', 'TRUNG TAM'],
  },
  {
    name: 'Chuyển tiền',
    type: 'expense',
    icon: 'ArrowLeftRight',
    color: '#64748b',
    sortOrder: 90,
    keywords: ['CHUYEN TIEN', 'CK DEN', 'MOMO', 'ZALOPAY', 'VNPAY', 'RUT TIEN', 'ATM'],
  },
  {
    name: 'Phí & Lãi',
    type: 'expense',
    icon: 'Landmark',
    color: '#78716c',
    sortOrder: 100,
    keywords: ['PHI DICH VU', 'PHI SMS', 'PHI THUONG NIEN', 'PHI QUAN LY', 'LAI VAY', 'PHI CHUYEN TIEN'],
  },
  {
    name: 'Khác',
    type: 'expense',
    icon: 'Ellipsis',
    color: '#94a3b8',
    sortOrder: 999,
    keywords: [],
  },

  // ─── Thu ───────────────────────────────────────────────────────────────────
  {
    name: 'Lương',
    type: 'income',
    icon: 'Wallet',
    color: '#10b981',
    sortOrder: 10,
    keywords: ['LUONG', 'SALARY', 'THANH TOAN LUONG', 'TRA LUONG'],
  },
  {
    name: 'Thưởng',
    type: 'income',
    icon: 'Gift',
    color: '#14b8a6',
    sortOrder: 20,
    keywords: ['THUONG', 'BONUS', 'KHEN THUONG'],
  },
  {
    name: 'Lãi tiết kiệm',
    type: 'income',
    icon: 'PiggyBank',
    color: '#0ea5e9',
    sortOrder: 30,
    keywords: ['LAI TIEN GUI', 'LAI SUAT', 'TIET KIEM'],
  },
  {
    name: 'Thu khác',
    type: 'income',
    icon: 'Plus',
    color: '#22c55e',
    sortOrder: 999,
    keywords: [],
  },
];
