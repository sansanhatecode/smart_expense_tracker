'use client';

import type { AccountDto } from '@expense/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { AccountCard } from '@/components/accounts/AccountCard';
import {
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from '@/components/ui';

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
