import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập email')
  .max(254)
  .toLowerCase()
  .pipe(z.email('Email không hợp lệ'));

/**
 * Chỉ đặt sàn độ dài, không bắt "phải có 1 chữ hoa 1 ký tự đặc biệt".
 * Quy tắc phức tạp đẩy người dùng sang mật khẩu dễ đoán hơn mà lại khó nhớ.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu cần ít nhất 8 ký tự')
  .max(200, 'Mật khẩu quá dài');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Refresh token KHÔNG nằm trong body — nó ở httpOnly cookie do API set, nên JS
 * của FE không đọc được. Access token thì giữ trong memory (không localStorage)
 * để giảm thiệt hại nếu có XSS.
 */
export interface AuthResponse {
  accessToken: string;
  /** Số giây access token còn hiệu lực, để FE hẹn giờ silent refresh. */
  expiresIn: number;
  user: UserDto;
}
