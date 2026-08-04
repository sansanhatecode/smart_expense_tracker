import { z } from 'zod';

/**
 * Loại phản hồi. Quyết định label của issue trên GitHub và câu hỏi hiện trong
 * form — báo lỗi thì cần "các bước tái hiện", góp ý thì không.
 */
export const feedbackKindSchema = z.enum(['bug', 'idea']);

export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const createFeedbackSchema = z.object({
  kind: feedbackKindSchema,
  title: z
    .string()
    .trim()
    .min(5, 'Tiêu đề cần ít nhất 5 ký tự')
    // 120 là chỗ tiêu đề issue trên GitHub bắt đầu bị cắt trong danh sách.
    .max(120, 'Tiêu đề tối đa 120 ký tự'),
  description: z
    .string()
    .trim()
    // Chặn "app lỗi" — một dòng như thế không lần lại được, và người báo sẽ phải
    // trả lời thêm ba câu nữa mới thành thông tin dùng được.
    .min(20, 'Mô tả cần ít nhất 20 ký tự để lần lại được lỗi')
    .max(4000, 'Mô tả tối đa 4000 ký tự'),
  /** Các bước tái hiện. Chỉ hỏi khi `kind === 'bug'`, và vẫn không bắt buộc. */
  steps: z.string().trim().max(2000, 'Phần các bước tối đa 2000 ký tự').optional(),

  /**
   * Bối cảnh do FE tự điền, không phải người dùng gõ — trang đang xem và trình
   * duyệt là hai thứ cần nhất để lần lại lỗi mà người báo ít nghĩ tới nhất.
   *
   * Cả hai đều là chuỗi từ client nên KHÔNG tin được: giới hạn độ dài ở đây để
   * không ai nhồi 1MB vào body issue.
   */
  page: z.string().max(300).optional(),
  userAgent: z.string().max(500).optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

/** Issue vừa tạo. Trả về để người báo theo dõi được thứ mình vừa gửi. */
export interface FeedbackDto {
  /** Số issue trên GitHub, ví dụ 42 → hiện thành "#42". */
  number: number;
  url: string;
}
