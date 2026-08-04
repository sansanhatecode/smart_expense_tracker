import type { CreateFeedbackInput } from '@expense/shared';
import { maskEmail } from '../common/mask-email';

/** Label trên GitHub, đặt theo bộ label mặc định của repo. */
export const ISSUE_LABELS: Record<CreateFeedbackInput['kind'], string> = {
  bug: 'bug',
  idea: 'enhancement',
};

/**
 * Ghép body của issue từ nội dung người dùng gõ + bối cảnh kỹ thuật.
 *
 * Tách ra khỏi service (và không đọc `env`) để test được bằng unit test: thứ
 * đáng khoá lại ở đây là email PHẢI bị che, và điều đó không cần DB hay network
 * để kiểm.
 *
 * Email của người báo đi qua `maskEmail` vì issue có thể là public, mà email đầy
 * đủ ở đó là PII không cần thiết: để liên hệ lại thì đã có `userId`, còn hai ký
 * tự đầu + domain là đủ để nhận ra đúng người khi đối chiếu.
 */
export function composeIssueBody(
  input: CreateFeedbackInput,
  reporter: { id: string; email: string },
  /** Thời điểm nhận báo lỗi. Truyền vào để test không phụ thuộc đồng hồ. */
  now: Date,
): string {
  const when = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const lines = [input.description, ''];

  if (input.steps) {
    lines.push('### Các bước tái hiện', '', input.steps, '');
  }

  lines.push(
    '---',
    '',
    `- Loại: ${input.kind === 'bug' ? 'lỗi' : 'góp ý'}`,
    `- Trang: \`${input.page ?? 'không rõ'}\``,
    `- Người báo: ${maskEmail(reporter.email)} (userId \`${reporter.id}\`)`,
    `- Trình duyệt: \`${input.userAgent ?? 'không rõ'}\``,
    `- Lúc: ${when} (giờ VN)`,
    '',
    '_Gửi tự động từ nút "Báo lỗi" trong app._',
  );

  return lines.join('\n');
}
