'use client';

import type { AccountKind, ImportPreviewDto } from '@expense/shared';
import { formatVnd } from '@expense/shared';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';

const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Tài khoản ngân hàng',
  credit_card: 'Thẻ tín dụng',
  wallet: 'Ví điện tử',
};

/**
 * Bảng đếm của lần xem trước: trả lời "bấm xác nhận thì thêm bao nhiêu" TRƯỚC
 * khi bấm. Hai nút quyết định (Bỏ / Xác nhận) nằm ngay cạnh các con số đó.
 */
export function PreviewSummary({
  fileName,
  account,
  counts,
  onDiscard,
  onConfirm,
  discarding,
  confirming,
}: {
  fileName: string;
  account: ImportPreviewDto['account'];
  counts: ImportPreviewDto['counts'];
  onDiscard: () => void;
  onConfirm: () => void;
  discarding: boolean;
  confirming: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
          <p className="mt-0.5 text-sm text-ink-muted">Chưa có gì được ghi vào dữ liệu</p>
          {/*
            Nguồn tiền được nhận ra từ nội dung file, không hỏi người dùng —
            nên phải nói ra ở đây. Nhận nhầm sao kê thẻ thành tài khoản ngân
            hàng làm dư nợ và dòng tiền sai, và họ là người duy nhất thấy được.
          */}
          {account && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
              <Badge>
                {ACCOUNT_KIND_LABEL[account.kind]} · {account.name}
              </Badge>
              <Link href="/accounts" className="font-medium text-accent">
                Đổi tên nguồn tiền
              </Link>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onDiscard} loading={discarding}>
            Bỏ
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={confirming}
            disabled={counts.willInsert === 0}
          >
            Xác nhận thêm {counts.willInsert} giao dịch
          </Button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
        <Stat label="Đọc được" value={String(counts.total)} />
        <Stat label="Sẽ thêm" value={String(counts.willInsert)} />
        <Stat
          label="Đã có sẵn"
          value={String(counts.duplicateInDb)}
          hint={counts.duplicateInDb > 0 ? 'bỏ tick sẵn' : undefined}
        />
        <Stat
          label="Chưa phân loại"
          value={String(counts.uncategorized)}
          hint={counts.uncategorized > 0 ? 'gán ở dưới' : undefined}
        />
      </dl>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
        <Stat label="Tổng thu" value={formatVnd(counts.incomeTotal)} tone="income" />
        <Stat label="Tổng chi" value={formatVnd(counts.expenseTotal)} tone="expense" />
      </dl>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'income' | 'expense';
}) {
  return (
    <div>
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd
        className="mt-0.5 text-lg font-semibold"
        style={{
          color:
            tone === 'income'
              ? 'var(--series-income)'
              : tone === 'expense'
                ? 'var(--series-expense)'
                : 'var(--ink)',
        }}
      >
        {value}
      </dd>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
