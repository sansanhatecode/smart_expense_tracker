'use client';

import type { CategoryDto } from '@expense/shared';
import { ConfirmDialog } from '@/components/ui';

/**
 * Hộp xác nhận nói ĐỦ hậu quả, gồm cả thứ `confirm()` cũ bỏ sót: rule tự phân
 * loại bị xoá theo danh mục (FK là onDelete: Cascade) và không dựng lại được,
 * khác với giao dịch chỉ mất phân loại.
 */
export function DeleteCategoryDialog({
  category,
  ruleCount,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  /** `null` = hộp đang đóng. */
  category: CategoryDto | null;
  /** Số rule tự phân loại sẽ bị xoá theo. */
  ruleCount: number;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const txCount = category?.transactionCount ?? 0;

  return (
    <ConfirmDialog
      open={category !== null}
      title={category ? `Xoá danh mục "${category.name}"?` : ''}
      confirmLabel="Xoá danh mục"
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p>
        {txCount > 0
          ? `${txCount} giao dịch sẽ chuyển sang "chưa phân loại". Không giao dịch nào bị xoá.`
          : 'Danh mục này chưa có giao dịch nào.'}
      </p>
      {ruleCount > 0 && (
        <p>
          {ruleCount} rule tự phân loại của danh mục này bị xoá theo và không hoàn lại được — lần
          import sau sẽ không tự gán danh mục này nữa.
        </p>
      )}
    </ConfirmDialog>
  );
}
