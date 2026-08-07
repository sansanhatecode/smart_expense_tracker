'use client';

import type { AccountDto, AccountKind } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import { Card, CardHeader, CategoryIcon } from '@/components/ui';
import { formatDateShort } from '@/lib/utils';
import { AccountForm } from './AccountForm';

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

export function AccountCard({ account, onDone }: { account: AccountDto; onDone: () => void }) {
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
