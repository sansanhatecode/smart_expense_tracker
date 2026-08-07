'use client';

import type { AccountDto, UpdateAccountInput } from '@expense/shared';
import { formatVnd, parseVndInput } from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

export function AccountForm({
  account,
  onDone,
}: {
  account: AccountDto;
  onDone: () => void;
}) {
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
