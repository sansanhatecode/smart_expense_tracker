/**
 * Class chung của Modal và ConfirmDialog.
 *
 * Nền mờ phía sau (`backdrop-blur`) không phải để đẹp: hộp thoại trong app này
 * mở đè lên bảng số liệu dày đặc, và một lớp mờ đơn thuần vẫn để chữ bên dưới
 * đọc được lờ mờ, tranh mất chỗ với đúng câu hỏi đang cần trả lời.
 */
export const DIALOG_BASE =
  'm-auto w-[calc(100%-2rem)] rounded-token border bg-surface p-5 shadow-overlay backdrop:bg-ink/50 backdrop:backdrop-blur-sm';
