/**
 * Class dùng chung cho mọi ô nhập (Input, Textarea, Select).
 *
 * Viền đậm lên khi hover và chuyển sang màu nhấn khi focus — hai tín hiệu khác
 * nhau cho hai việc khác nhau ("bấm được đây" và "đang gõ ở đây"). Vòng focus
 * của trình duyệt vẫn giữ nguyên bên ngoài (xem globals.css): màu viền một mình
 * không đủ cho người không phân biệt được nó.
 */
export const CONTROL_BASE =
  'w-full rounded-token-sm border bg-surface text-sm text-ink transition-colors duration-150 placeholder:text-ink-muted hover:border-border-strong focus:border-accent disabled:cursor-not-allowed disabled:opacity-60';
