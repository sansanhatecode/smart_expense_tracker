'use client';

import * as Icons from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

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
 */

// ─── Tiêu đề trang ───────────────────────────────────────────────────────────

/**
 * Đầu trang: tên trang, một dòng ngữ cảnh, và các nút của trang đó.
 *
 * Gom lại một chỗ vì sáu trang đang chép lại cùng một khối markup, và mỗi lần
 * chép là một cơ hội để lệch nhau một bậc chữ hoặc một nấc khoảng cách. Ở đây
 * chúng nhất định giống nhau.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  /** Một dòng nói kỳ đang xem hoặc số lượng — không phải chỗ giải thích dài. */
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

/**
 * Nền của app (`--page`) và nền của card (`--surface`) chỉ cách nhau vài phần
 * trăm độ sáng, nên riêng viền không đủ tách card ra khỏi trang. Bóng đổ gánh
 * phần đó ở light mode; ở dark mode nó gần như vô hình và bậc bề mặt gánh thay
 * — cả hai đã khai sẵn theo mode trong globals.css.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-token border bg-surface shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * Hover đổi MÀU chứ không đổi độ mờ.
 *
 * `opacity` từng là cách làm ở đây, và nó sai theo hai đường: nút mờ đi để lộ
 * nền phía sau nên ra màu khác nhau tuỳ chỗ đặt, và trên nền sáng thì nút nhạt
 * đi trông y hệt nút đang disabled — đúng tín hiệu ngược với thứ vừa hover.
 * `--accent-hover`/`--accent-active` là bậc màu thật, khai riêng cho từng mode.
 */
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink shadow-card hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border bg-surface text-ink hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-ink-secondary hover:bg-surface-hover hover:text-ink',
  danger: 'text-critical hover:bg-critical/10 active:bg-critical/15',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-token-sm font-medium transition-colors duration-150';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        BUTTON_BASE,
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Icons.Loader2 aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * Link mang hình dạng button.
 *
 * Tồn tại vì lồng `<Link>` trong `<Button>` sinh ra `<button><a>` — HTML không
 * hợp lệ, và screen reader lẫn bàn phím xử lý không đoán được. Điều hướng thì
 * phải là thẻ `<a>`; `<button>` để dành cho hành động.
 */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        BUTTON_BASE,
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function Field({
  label,
  error,
  hint,
  children,
  /**
   * `div` cho control KHÔNG phải input/select — ví dụ MultiSelect, vốn là một
   * `<button>`. `<label>` chỉ gắn được với control "labelable"; bọc button trong
   * label thì bấm vào chữ không làm gì cả, và nhãn không gắn được vào control
   * bằng cách máy đọc hiểu. Control đó tự mang `aria-label`.
   */
  as = 'label',
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  as?: 'label' | 'div';
}) {
  const Wrapper = as;

  return (
    <Wrapper className="block space-y-1.5">
      <span className="block text-sm font-medium text-ink">{label}</span>
      {children}
      {/* Lỗi không bao giờ chỉ dựa vào màu viền: luôn có chữ mô tả cụ thể */}
      {error ? (
        <span className="flex items-start gap-1.5 text-sm text-critical">
          <Icons.CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="block text-sm text-ink-muted">{hint}</span>
      )}
    </Wrapper>
  );
}

/**
 * Class dùng chung cho mọi ô nhập.
 *
 * Viền đậm lên khi hover và chuyển sang màu nhấn khi focus — hai tín hiệu khác
 * nhau cho hai việc khác nhau ("bấm được đây" và "đang gõ ở đây"). Vòng focus
 * của trình duyệt vẫn giữ nguyên bên ngoài (xem globals.css): màu viền một mình
 * không đủ cho người không phân biệt được nó.
 */
const CONTROL_BASE =
  'w-full rounded-token-sm border bg-surface text-sm text-ink transition-colors duration-150 placeholder:text-ink-muted hover:border-border-strong focus:border-accent disabled:cursor-not-allowed disabled:opacity-60';

export function Input({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL_BASE, 'h-10 px-3', invalid && 'border-critical', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  rows = 4,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      className={cn(CONTROL_BASE, 'px-3 py-2', invalid && 'border-critical', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL_BASE, 'h-10 appearance-none px-3 pr-8', className)}
      style={{
        // Mũi tên vẽ bằng SVG inline chứ không phải một icon React: `<select>`
        // không nhận con nào ngoài `<option>`, nên nó phải là ảnh nền.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23898781' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1rem',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Chọn nhiều giá trị: một nút mở panel checkbox.
 *
 * Cố tình KHÔNG dùng `<select multiple>`: trên desktop nó đòi giữ Ctrl/Cmd để
 * chọn thêm — thao tác mà không có gì trên giao diện nói ra — và bấm thường vào
 * một dòng sẽ XOÁ hết lựa chọn cũ. Đó là cách nhanh nhất để người dùng mất bộ
 * lọc vừa dựng mà không hiểu vì sao.
 *
 * Bên trong panel là `<input type="checkbox">` thật, không phải div có
 * `role="checkbox"`: bàn phím, screen reader và trạng thái đã tick đều có sẵn
 * đúng, không phải dựng lại bằng tay.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  /** Chữ hiện trên nút khi chưa tick gì. */
  allLabel = 'Tất cả',
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // `pointerdown` chứ không phải `click`: bấm vào một control khác phải đóng
    // panel NGAY, trước khi control đó xử lý cú bấm — nếu không thì panel còn mở
    // và che mất đúng thứ vừa bấm.
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const chosen = options.filter((option) => selected.includes(option.value));

  // Một lựa chọn thì hiện tên nó; nhiều thì hiện số đếm. Ghép 5 tên danh mục vào
  // một nút rộng 12rem chỉ ra một chuỗi bị cắt, không đọc được gì.
  const summary =
    chosen.length === 0
      ? allLabel
      : chosen.length === 1
        ? chosen[0]!.label
        : `${chosen.length} lựa chọn`;

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-token-sm border bg-surface px-3 text-left text-sm transition-colors duration-150 hover:border-border-strong',
          // Panel đang mở thì nút giữ viền nhấn: nó và panel là một khối, và khi
          // panel che mất thứ bên dưới thì phải thấy được nó mọc ra từ đâu.
          open && 'border-accent',
          chosen.length === 0 ? 'text-ink-muted' : 'text-ink',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <Icons.ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-ink-muted transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="group"
          aria-label={label}
          className="scroll-slim absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-token-sm border bg-surface-raised p-1 shadow-overlay"
        >
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-token-sm px-2 py-1.5 text-sm text-ink transition-colors hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0"
                style={{ accentColor: 'var(--accent)' }}
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </label>
          ))}

          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t px-2 py-1.5 text-left text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              Bỏ chọn hết
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hộp thoại ───────────────────────────────────────────────────────────────

/**
 * Class chung của hai hộp thoại bên dưới.
 *
 * Nền mờ phía sau (`backdrop-blur`) không phải để đẹp: hộp thoại trong app này
 * mở đè lên bảng số liệu dày đặc, và một lớp mờ đơn thuần vẫn để chữ bên dưới
 * đọc được lờ mờ, tranh mất chỗ với đúng câu hỏi đang cần trả lời.
 */
const DIALOG_BASE =
  'm-auto w-[calc(100%-2rem)] rounded-token border bg-surface p-5 shadow-overlay backdrop:bg-ink/50 backdrop:backdrop-blur-sm';

/**
 * Hộp thoại rỗng để nhét nội dung bất kỳ — form, thông tin, hướng dẫn.
 *
 * Tách khỏi `ConfirmDialog` chứ không gộp: hộp xác nhận khoá cứng hai nút và một
 * luồng "làm hay không", còn hộp này không biết bên trong có gì. Gộp lại thành
 * một component nhận chục prop tuỳ chọn thì cả hai chỗ dùng đều khó đọc hơn.
 *
 * Giống `ConfirmDialog`, dựng trên `<dialog>` gốc để có sẵn bắt focus, Escape,
 * chặn tương tác với phần dưới. KHÔNG đóng khi bấm ra ngoài: bên trong thường là
 * form đang gõ dở, và mất nó vì một cú bấm lệch là kiểu mất dữ liệu khó tha nhất.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape: chặn hành vi mặc định rồi báo lên state, nếu để `<dialog>` tự đóng
      // thì `open` vẫn true và lần sau không mở lại được.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(DIALOG_BASE, 'max-w-lg')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-ink-secondary">{description}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Đóng">
          <Icons.X aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="mt-4">{children}</div>
    </dialog>
  );
}

// ─── Hộp xác nhận ────────────────────────────────────────────────────────────

/**
 * Xác nhận một hành động không hoàn lại được.
 *
 * Dựng trên `<dialog>` gốc chứ không phải div phủ lên: `showModal()` cho sẵn bắt
 * focus trong hộp, Escape để đóng, chặn tương tác với phần dưới, và cả `inert`
 * cho phần còn lại của trang. Tự làm bằng div nghĩa là tự viết lại đúng những
 * thứ đó — và thường là viết thiếu.
 *
 * Vì sao không dùng `confirm()` nữa: nó chỉ nhận được một chuỗi, nên không nói
 * được số tiền và ngày của dòng sắp xoá — mà đó chính là thứ người dùng cần để
 * biết mình có đang xoá đúng dòng không. Nó cũng khoá cứng cả tab trong lúc chờ
 * và không có chỗ nào để hiện lỗi nếu request thất bại.
 *
 * Hộp KHÔNG đóng khi đang chạy (`busy`) và không đóng khi bấm ra ngoài: hành
 * động phá huỷ thì đòi một lựa chọn rõ ràng, không đóng nhầm được.
 */
export function ConfirmDialog({
  open,
  title,
  /** Nội dung mô tả — đưa cả số tiền, ngày, số dòng vào đây. */
  children,
  confirmLabel,
  cancelLabel = 'Huỷ',
  busy = false,
  /** Lỗi của request vừa rồi. Hộp vẫn mở để người dùng thử lại. */
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // `open` là nguồn sự thật duy nhất; DOM chỉ đi theo. Có kiểm `dialog.open` vì
    // gọi `showModal()` khi đang mở sẽ ném lỗi.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape đi qua đây. Chặn hành vi mặc định rồi báo lên cho state đóng hộp:
      // để `<dialog>` tự đóng thì `open` vẫn là true và lần sau không mở lại được.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className={cn(DIALOG_BASE, 'max-w-md')}
    >
      <div className="flex items-start gap-3">
        {/*
          Icon cảnh báo đứng cạnh tiêu đề: hộp này chỉ mở cho hành động phá huỷ,
          và tín hiệu đó phải đọc được trước cả khi đọc chữ. Màu một mình không
          làm được việc đó — nên là icon, và nó nằm trên nền dịu để không hét.
        */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-token-sm bg-critical/10">
          <Icons.TriangleAlert aria-hidden className="size-4.5 text-critical" />
        </span>
        <h2 id={titleId} className="mt-1.5 text-base font-semibold text-ink">
          {title}
        </h2>
      </div>

      {children && <div className="mt-3 space-y-1 text-sm text-ink-secondary">{children}</div>}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-critical" role="alert">
          <Icons.CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        {/* Nút an toàn nhận focus đầu tiên: `showModal()` focus phần tử đầu có
            autofocus, và với hành động phá huỷ thì Enter theo phản xạ phải là Huỷ. */}
        <Button autoFocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

// ─── Badge & status ──────────────────────────────────────────────────────────

/**
 * Trạng thái LUÔN có icon + chữ, không chỉ có màu.
 *
 * Ba màu status (warning, serious, critical) không đủ contrast trên nền sáng để
 * tự mang nghĩa, và người mù màu thì màu không nói gì cả. Icon + chữ là kênh
 * đáng tin, màu chỉ để nhận ra nhanh.
 */
export function StatusBadge({
  status,
  children,
}: {
  status: 'good' | 'warning' | 'critical' | 'neutral';
  children: React.ReactNode;
}) {
  const config = {
    good: { color: 'var(--status-good)', Icon: Icons.Check },
    warning: { color: 'var(--status-warning)', Icon: Icons.TriangleAlert },
    critical: { color: 'var(--status-critical)', Icon: Icons.CircleAlert },
    neutral: { color: 'var(--ink-muted)', Icon: Icons.Minus },
  }[status];

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium"
      style={{ color: config.color }}
    >
      <config.Icon aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

/**
 * Nhãn phụ trên một dòng danh sách ("từ import", "chưa phân loại").
 *
 * `size="sm"` là cỡ dùng khi badge đứng chung hàng với chữ meta của dòng: bằng
 * cỡ chữ đó thì nó tranh chỗ với mô tả giao dịch, mà mô tả mới là thứ cần đọc.
 */
export function Badge({
  size = 'md',
  className,
  children,
}: {
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-ink-secondary',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Icon danh mục ───────────────────────────────────────────────────────────

/**
 * Icon của danh mục, tra theo tên lucide lưu trong DB.
 *
 * Đây là kênh identity chính của danh mục, cùng với tên — màu chỉ là phụ, vì
 * không thể có nhiều màu categorical phân biệt được (xem default-categories.ts).
 */
export function CategoryIcon({
  icon,
  color,
  className,
}: {
  icon: string;
  color: string;
  className?: string;
}) {
  const Lookup = Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Icon = Lookup[icon] ?? Icons.Tag;

  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-token-sm',
        className,
      )}
      // Nền là chính màu danh mục ở 12% — không phải một màu xám cố định: ở 12%
      // nó vẫn đủ nhạt để icon đọc được ở cả hai mode, mà vẫn nhắc lại được màu.
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <Icon className="size-4" />
    </span>
  );
}

// ─── Trạng thái rỗng / đang tải ──────────────────────────────────────────────

export function EmptyState({
  icon: Icon = Icons.Inbox,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {/* Icon trong một ô nền dịu chứ không thả trôi: khối rỗng cần một điểm
          neo, nếu không cả vùng trông như trang chưa tải xong. */}
      <span className="flex size-11 items-center justify-center rounded-token bg-surface-hover">
        <Icon className="size-5 text-ink-muted" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-ink-secondary">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Khối chờ. Hình dạng và chuyển động nằm ở class `.skeleton` trong globals.css. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-token-sm', className)} />;
}

/**
 * Màn hình chờ chiếm cả khung nhìn — dùng cho lúc chưa biết đã đăng nhập hay chưa.
 *
 * Không dùng Skeleton ở đây: skeleton hứa hẹn nội dung sắp hiện ra đúng hình
 * dạng đó, mà lúc này còn chưa biết sẽ đi tới dashboard hay trang đăng nhập.
 */
export function LoadingScreen({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 text-ink-muted"
    >
      <Icons.Loader2 aria-hidden className="size-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Đã có lỗi xảy ra';

  return (
    <EmptyState
      icon={Icons.CircleAlert}
      title="Không tải được dữ liệu"
      description={message}
      action={
        onRetry && (
          <Button size="sm" onClick={onRetry}>
            <Icons.RotateCw aria-hidden className="size-4" />
            Thử lại
          </Button>
        )
      }
    />
  );
}
