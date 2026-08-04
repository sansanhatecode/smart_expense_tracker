'use client';

import {
  createFeedbackSchema,
  type CreateFeedbackInput,
  type FeedbackDto,
  type FeedbackKind,
} from '@expense/shared';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

/**
 * Form báo lỗi / góp ý ngay trong app.
 *
 * Người dùng KHÔNG phải có tài khoản GitHub và không rời app: server nhận form
 * rồi tự mở issue (xem apps/api/src/feedback). Bản trước đây là một link mở GitHub
 * kèm body điền sẵn — nghe gọn, nhưng nó đòi người báo phải có account GitHub,
 * nghĩa là gần như không ai báo.
 */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = useMutation({
    mutationFn: (input: CreateFeedbackInput) => api.post<FeedbackDto>('/api/feedback', input),
  });

  const reset = () => {
    setKind('bug');
    setTitle('');
    setDescription('');
    setSteps('');
    setErrors({});
    submit.reset();
  };

  /**
   * Đóng hộp. Chỉ xoá nội dung khi đã gửi được — gửi lỗi thì giữ nguyên, vì
   * người dùng vừa gõ mấy dòng và có thể chỉ đang muốn mở lại để thử lần nữa.
   */
  const close = () => {
    if (submit.isSuccess) reset();
    onClose();
  };

  const send = () => {
    // Bối cảnh đọc từ `window` lúc BẤM, không phải lúc render: `userAgent` khác
    // nhau giữa server và client nên nhét vào lúc render là hydration mismatch.
    // Kèm cả query string — bộ lọc đang bật thường chính là thứ gây ra lỗi.
    const input = {
      kind,
      title,
      description,
      // Chỉ gửi phần các bước khi đang báo lỗi: với góp ý thì field này không hiện.
      ...(kind === 'bug' && steps.trim() ? { steps } : {}),
      page: `${window.location.pathname}${window.location.search}`,
      userAgent: navigator.userAgent,
    };

    // Validate bằng ĐÚNG schema mà API dùng (packages/shared): sai độ dài thì
    // hiện ngay tại field, không tốn một vòng round-trip để nhận cùng thông báo.
    const parsed = createFeedbackSchema.safeParse(input);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors(
        Object.fromEntries(
          Object.entries(fieldErrors)
            .filter(([, messages]) => messages?.length)
            .map(([field, messages]) => [field, messages![0]!]),
        ),
      );
      return;
    }

    setErrors({});
    submit.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      title={submit.isSuccess ? 'Đã gửi' : 'Báo lỗi hoặc góp ý'}
      description={
        submit.isSuccess
          ? undefined
          : 'Trang bạn đang xem và trình duyệt được gửi kèm tự động — không cần mô tả lại.'
      }
      onClose={close}
    >
      {submit.isSuccess ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-ink">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
            Cảm ơn bạn. Báo lỗi đã được ghi lại thành issue #{submit.data.number}, dev sẽ
            xem sớm.
          </p>
          <div className="flex justify-end gap-2">
            <a
              href={submit.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center px-3 text-sm font-medium text-accent"
            >
              Xem issue
            </a>
            <Button size="sm" variant="primary" onClick={close}>
              Xong
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Đây là">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as FeedbackKind)}
            >
              <option value="bug">Một lỗi — app chạy sai hoặc số không đúng</option>
              <option value="idea">Một góp ý — mong app có thêm gì</option>
            </Select>
          </Field>

          <Field label="Tóm tắt" error={errors.title}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              invalid={Boolean(errors.title)}
              placeholder={
                kind === 'bug'
                  ? 'Tổng chi tháng 3 không khớp với danh sách giao dịch'
                  : 'Muốn xuất báo cáo tháng ra Excel'
              }
              maxLength={120}
            />
          </Field>

          <Field
            label={kind === 'bug' ? 'Chuyện gì xảy ra' : 'Bạn mong muốn điều gì'}
            error={errors.description}
            hint={
              kind === 'bug'
                ? 'Bạn thấy gì, và đáng lẽ phải thấy gì. Có số cụ thể thì càng tốt.'
                : undefined
            }
          >
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              invalid={Boolean(errors.description)}
              rows={4}
              maxLength={4000}
            />
          </Field>

          {/* Các bước tái hiện chỉ hỏi khi báo lỗi — với góp ý thì nó vô nghĩa và
              chỉ làm form dài ra, khiến người ta bỏ dở. */}
          {kind === 'bug' && (
            <Field
              label="Trước đó bạn làm gì (không bắt buộc)"
              error={errors.steps}
              hint="Ví dụ: mở Giao dịch → lọc tháng 3 → bấm Tất cả nguồn tiền."
            >
              <Textarea
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                invalid={Boolean(errors.steps)}
                rows={3}
                maxLength={2000}
              />
            </Field>
          )}

          {submit.isError && (
            <p className="flex items-start gap-1.5 text-sm text-critical" role="alert">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {submit.error instanceof Error ? submit.error.message : 'Không gửi được'}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" onClick={close} disabled={submit.isPending}>
              Huỷ
            </Button>
            <Button size="sm" variant="primary" loading={submit.isPending} onClick={send}>
              {!submit.isPending && <Send aria-hidden className="size-4" />}
              Gửi
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
