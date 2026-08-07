/**
 * Primitive UI viết tay thay vì kéo cả một thư viện component.
 *
 * App này cần khoảng chục primitive, và mỗi cái là vài dòng — kéo về một thư
 * viện đầy đủ nghĩa là thêm dependency và một lớp API phải học, để dùng 10% của nó.
 * Tất cả style qua design token trong globals.css nên light/dark đổi ở một chỗ.
 *
 * Bo góc đi qua `rounded-token` / `rounded-token-sm` (Tailwind đọc từ @theme
 * inline), không phải `style={{ borderRadius }}` viết tay: cùng một giá trị,
 * nhưng nằm chung chỗ với các class còn lại nên đọc một lượt là thấy hết.
 *
 * File này chỉ gom cửa ra: mỗi primitive nằm ở file riêng cùng thư mục, nên
 * `@/components/ui` vẫn là một điểm import duy nhất cho cả app.
 */

export { PageHeader } from './PageHeader';
export { Card, CardHeader } from './Card';
export { Button, ButtonLink, type ButtonVariant } from './Button';
export { Field } from './Field';
export { Input } from './Input';
export { Textarea } from './Textarea';
export { Select } from './Select';
export { MultiSelect, type MultiSelectOption } from './MultiSelect';
export { Modal } from './Modal';
export { ConfirmDialog } from './ConfirmDialog';
export { StatusBadge } from './StatusBadge';
export { Badge } from './Badge';
export { CategoryIcon } from './CategoryIcon';
export { EmptyState } from './EmptyState';
export { Skeleton } from './Skeleton';
export { LoadingScreen } from './LoadingScreen';
export { ErrorState } from './ErrorState';
