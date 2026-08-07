'use client';

import type { CategoryDto, TxType } from '@expense/shared';
import { CircleAlert, Trash2 } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NONE } from './filters';

/**
 * Hàng chọn cả trang, và khi đã tick thì là thanh hành động cho lô đó.
 *
 * Nằm trong cùng một Card với danh sách và ngay trên nó, vì "cả trang" nghĩa là
 * đúng những dòng nhìn thấy bên dưới.
 */
export function SelectionBar({
  count,
  allSelected,
  someSelected,
  onToggleAll,
  categories,
  selectedType,
  busy,
  error,
  onCategorize,
  onDelete,
  onClear,
}: {
  count: number;
  allSelected: boolean;
  /** Tick một phần — ô hiện dấu gạch. */
  someSelected: boolean;
  onToggleAll: () => void;
  categories: CategoryDto[];
  /** null = lô trộn cả thu lẫn chi. */
  selectedType: TxType | null;
  busy: boolean;
  /** Lỗi của lần gán vừa rồi, hiện ngay trong thanh này. */
  error?: string;
  onCategorize: (categoryId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    // Thanh này đổi nền khi đã tick: lúc đó nó không còn là một dòng hướng dẫn
    // mà là chỗ chứa hành động sẽ chạy trên các dòng đang chọn — và nó phải khác
    // hẳn phần danh sách bên dưới.
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-b px-4 py-3 transition-colors duration-150 sm:px-5',
        count > 0 && 'bg-surface-hover',
      )}
    >
      <input
        type="checkbox"
        className="size-4 shrink-0"
        style={{ accentColor: 'var(--accent)' }}
        aria-label="Chọn tất cả giao dịch trong trang"
        checked={allSelected}
        // Tick một phần thì ô hiện dấu gạch, không phải ô trống: ô trống nói sai
        // rằng chưa chọn gì.
        ref={(node) => {
          if (node) node.indeterminate = someSelected;
        }}
        onChange={onToggleAll}
      />

      {count === 0 ? (
        <span className="text-sm text-ink-muted">
          Tick để gán danh mục hoặc xoá nhiều giao dịch một lượt
        </span>
      ) : (
        <BulkActions
          count={count}
          categories={categories}
          selectedType={selectedType}
          busy={busy}
          error={error}
          onCategorize={onCategorize}
          onDelete={onDelete}
          onClear={onClear}
        />
      )}
    </div>
  );
}

/**
 * Thao tác trên lô đang chọn.
 *
 * Chỉ hiện những danh mục gán ĐƯỢC: API từ chối gán giao dịch chi vào danh mục
 * thu, nên đưa chúng vào select rồi báo lỗi sau khi bấm là cách tệ hơn để nói
 * cùng một điều. Lô trộn cả thu lẫn chi thì không danh mục nào hợp cả hai — lúc
 * đó chỉ còn "Chưa phân loại" (bỏ danh mục), kèm câu giải thích.
 */
function BulkActions({
  count,
  categories,
  selectedType,
  busy,
  error,
  onCategorize,
  onDelete,
  onClear,
}: {
  count: number;
  categories: CategoryDto[];
  selectedType: TxType | null;
  busy: boolean;
  error?: string;
  onCategorize: (categoryId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const usable = selectedType ? categories.filter((item) => item.type === selectedType) : [];

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink">Đã chọn {count}</span>

      <Select
        aria-label="Gán danh mục cho các giao dịch đã chọn"
        // Luôn quay về placeholder: đây là một hành động, không phải trạng thái
        // của lô — lô có thể đang gồm nhiều danh mục khác nhau.
        value=""
        disabled={busy}
        onChange={(e) => {
          if (e.target.value === '') return;
          onCategorize(e.target.value === NONE ? null : e.target.value);
        }}
        className="h-8 w-full text-sm sm:w-52"
      >
        <option value="">Gán danh mục…</option>
        <option value={NONE}>Chưa phân loại</option>
        {usable.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      {selectedType === null && (
        <span className="text-sm text-ink-muted">
          Lô có cả giao dịch thu và chi nên không danh mục nào dùng chung được
        </span>
      )}

      <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
        <Trash2 aria-hidden className="size-4" />
        Xoá {count} giao dịch
      </Button>

      <Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
        Bỏ chọn
      </Button>

      {/*
        Lỗi ở ngay cạnh select vừa bấm, không phải trong một hộp alert phải tắt
        đi mới đọc tiếp được: lô vẫn đang chọn, nên việc cần làm sau khi đọc lỗi
        là bấm lại select — và nó phải còn nhìn thấy được lúc đó.
      */}
      {error && (
        <p className="flex w-full items-start gap-1.5 text-sm text-critical" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
