'use client';

import type { AccountDto } from '@expense/shared';
import { Upload } from 'lucide-react';
import { ButtonLink, Select } from '@/components/ui';
import { formatMonth, monthKeyOptions } from '@/lib/utils';

/**
 * Ô chọn kỳ, ô lọc nguồn tiền và nút import — phần `actions` của đầu trang.
 *
 * Nằm NGOÀI nhánh "chưa có dữ liệu" của trang: tháng không có giao dịch vẫn phải
 * đổi được kỳ, nếu không người dùng kẹt ở một tháng trống.
 */
export function PeriodControls({
  accounts,
  accountId,
  onAccountChange,
  month,
  onMonthChange,
  monthCount,
}: {
  accounts: AccountDto[];
  /** Rỗng = tất cả nguồn tiền. */
  accountId: string;
  onAccountChange: (accountId: string) => void;
  /** 'YYYY-MM'. */
  month: string;
  onMonthChange: (month: string) => void;
  monthCount: number;
}) {
  // Một nguồn tiền thì không có gì để lọc — dropdown chỉ thêm nhiễu.
  const canFilterByAccount = accounts.length > 1;

  return (
    <>
      {canFilterByAccount && (
        <Select
          aria-label="Lọc theo nguồn tiền"
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
          className="w-48"
        >
          <option value="">Tất cả nguồn tiền</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      )}
      <Select
        aria-label="Chọn kỳ"
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="w-44"
      >
        {monthKeyOptions(monthCount).map((option) => (
          <option key={option} value={option}>
            {formatMonth(option)}
          </option>
        ))}
      </Select>
      <ButtonLink href="/imports" variant="primary" size="sm">
        <Upload aria-hidden className="size-4" />
        Import sao kê
      </ButtonLink>
    </>
  );
}
