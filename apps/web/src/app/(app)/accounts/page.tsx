'use client';

import type { AccountDto, AccountKind, UpdateAccountInput } from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDateShort } from '@/lib/utils';
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  CategoryIcon,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui';

/**
 * Nhãn và hình của từng loại nguồn tiền.
 *
 * `icon`/`color` trùng với bảng ở stats.service — nhưng chỉ dùng cho trang này,
 * nơi dữ liệu đến từ /api/accounts và không mang sẵn màu. Breakdown trên
 * dashboard vẫn lấy màu từ API để hai chỗ không thể lệch nhau về sau.
 */
const KIND: Record<AccountKind, { label: string; icon: string; color: string }> = {
  bank: { label: 'Tài khoản ngân hàng', icon: 'Landmark', color: '#0f766e' },
  credit_card: { label: 'Thẻ tín dụng', icon: 'CreditCard', color: '#b45309' },
  wallet: { label: 'Ví điện tử', icon: 'Wallet', color: '#6d28d9' },
};

export default function AccountsPage() {
  const queryClient = useQueryClient();

  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get<AccountDto[]>('/api/accounts'),
  });

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Nguồn tiền"
        subtitle="Được tạo tự động từ sao kê bạn import. Đổi tên để dễ nhận ra."
      />

      {accounts.isPending ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : accounts.isError ? (
        <Card>
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
        </Card>
      ) : accounts.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="Chưa có nguồn tiền nào"
            description="Import một file sao kê — hệ thống tự nhận ra đó là thẻ tín dụng, tài khoản ngân hàng hay ví điện tử."
            action={
              // ButtonLink chứ không phải Button + `location.href`: gán
              // `location.href` là tải lại cả trang, tức mất hết cache của
              // react-query và bắt đầu lại từ màn hình chờ.
              <ButtonLink href="/imports" variant="primary" size="sm">
                <Upload aria-hidden className="size-4" />
                Import sao kê
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.data.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onDone={() => {
                // Đổi số dư đầu kỳ làm dư nợ đổi theo; đổi tên làm nhãn trên
                // dashboard đổi theo. Cả hai đều nằm ngoài key ['accounts'].
                void queryClient.invalidateQueries({ queryKey: ['accounts'] });
                void queryClient.invalidateQueries({ queryKey: ['stats'] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ account, onDone }: { account: AccountDto; onDone: () => void }) {
  const kind = KIND[account.kind];
  const isCard = account.kind === 'credit_card';

  return (
    <Card>
      <CardHeader
        title={account.name}
        subtitle={`${kind.label} · ${account.transactionCount} giao dịch`}
        action={<CategoryIcon icon={kind.icon} color={kind.color} />}
      />

      {isCard && (
        <div className="mt-4 grid gap-4 px-5 sm:grid-cols-3">
          <Figure
            label="Dư nợ hiện tại"
            value={formatVnd(account.outstanding ?? 0)}
            hint={
              account.openingBalance === 0
                ? 'Tính từ giao dịch đã import'
                : `Gồm ${formatVnd(account.openingBalance)} dư nợ đầu kỳ`
            }
          />
          <Figure
            label="Kỳ sao kê"
            value={
              account.currentPeriod
                ? `${formatDateShort(account.currentPeriod.from)} – ${formatDateShort(account.currentPeriod.to)}`
                : '—'
            }
            hint={account.currentPeriod ? undefined : 'Khai ngày chốt ở dưới'}
          />
          <Figure
            label="Đến hạn"
            value={
              account.currentPeriod?.dueDate
                ? formatDateShort(account.currentPeriod.dueDate)
                : '—'
            }
            hint={account.currentPeriod?.dueDate ? undefined : 'Khai ngày đến hạn ở dưới'}
          />
        </div>
      )}

      <AccountForm account={account} onDone={onDone} />
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    // Ba con số của thẻ tín dụng đứng trong ô nền dịu: chúng là tóm tắt đọc-thôi
    // nằm ngay trên một form sửa được, và không có gì tách hai vùng đó ra thì
    // người dùng thử bấm vào số để sửa.
    <div className="rounded-token-sm bg-surface-hover px-3 py-2.5">
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

function AccountForm({ account, onDone }: { account: AccountDto; onDone: () => void }) {
  const isCard = account.kind === 'credit_card';

  const [name, setName] = useState(account.name);
  const [openingText, setOpeningText] = useState(
    account.openingBalance === 0 ? '' : String(account.openingBalance),
  );
  const [statementDay, setStatementDay] = useState(
    account.statementDay === null ? '' : String(account.statementDay),
  );
  const [dueDay, setDueDay] = useState(account.dueDay === null ? '' : String(account.dueDay));
  const [error, setError] = useState<ApiError | null>(null);

  const openingBalance = openingText === '' ? 0 : parseVndInput(openingText);

  const save = useMutation({
    mutationFn: (input: UpdateAccountInput) =>
      api.patch<AccountDto>(`/api/accounts/${account.id}`, input),
    onSuccess: () => {
      setError(null);
      onDone();
    },
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Lỗi không xác định')),
  });

  const dirty =
    name !== account.name ||
    openingBalance !== account.openingBalance ||
    dayValue(statementDay) !== account.statementDay ||
    dayValue(dueDay) !== account.dueDay;

  return (
    <form
      className="mt-4 grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (openingBalance === null) return;
        save.mutate({
          name,
          // Số dư đầu kỳ chỉ có nghĩa với thẻ; gửi lên cho nguồn khác chỉ làm
          // rối dữ liệu mà không hiện ở đâu cả.
          ...(isCard
            ? {
                openingBalance,
                statementDay: dayValue(statementDay),
                dueDay: dayValue(dueDay),
              }
            : {}),
        });
      }}
    >
      <Field label="Tên hiển thị" error={error?.fieldError('name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </Field>

      {isCard && (
        <>
          <Field
            label="Dư nợ đầu kỳ"
            error={error?.fieldError('openingBalance')}
            hint={
              openingText === ''
                ? 'Nợ có từ trước lần import đầu tiên'
                : openingBalance === null
                  ? undefined
                  : formatVnd(openingBalance)
            }
          >
            <Input
              value={openingText}
              onChange={(e) => setOpeningText(e.target.value)}
              placeholder="0"
              invalid={openingText !== '' && openingBalance === null}
            />
          </Field>

          <Field
            label="Ngày chốt sao kê"
            error={error?.fieldError('statementDay')}
            hint="Bỏ trống nếu không rõ"
          >
            <Input
              type="number"
              min={1}
              max={31}
              value={statementDay}
              onChange={(e) => setStatementDay(e.target.value)}
              placeholder="5"
            />
          </Field>

          <Field
            label="Ngày đến hạn"
            error={error?.fieldError('dueDay')}
            hint="Nhỏ hơn ngày chốt = tháng sau"
          >
            <Input
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              placeholder="20"
            />
          </Field>
        </>
      )}

      <div className="flex items-end">
        <Button
          type="submit"
          variant="primary"
          loading={save.isPending}
          disabled={!dirty || name.trim() === '' || openingBalance === null}
        >
          Lưu
        </Button>
      </div>

      {error && !error.fieldErrors && (
        <p className="text-sm text-critical sm:col-span-2 lg:col-span-4" role="alert">
          {error.message}
        </p>
      )}
    </form>
  );
}

/** Ô ngày trống nghĩa là "chưa khai", tức null — không phải 0. */
function dayValue(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}
