'use client';

import type { BankProfileDto, ImportPreviewDto } from '@expense/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, TriangleAlert, Upload } from 'lucide-react';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button, Card, Field, Input, Select } from '@/components/ui';

export function UploadPanel({ onUploaded }: { onUploaded: (batchId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [profile, setProfile] = useState('');
  const [cardName, setCardName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [dragging, setDragging] = useState(false);

  const profiles = useQuery({
    queryKey: ['bank-profiles'],
    queryFn: () => api.get<BankProfileDto[]>('/api/imports/bank-profiles'),
    staleTime: Infinity,
  });

  const upload = useMutation({
    mutationFn: (selected: File) => {
      const form = new FormData();
      form.append('file', selected);
      if (profile) form.append('bankProfile', profile);
      if (cardName.trim()) form.append('cardName', cardName.trim());
      return api.upload<ImportPreviewDto>('/api/imports', form);
    },
    onSuccess: (preview) => onUploaded(preview.batchId),
    onError: (caught) =>
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Không tải được file')),
  });

  function selectFile(next: File | null) {
    setError(null);
    setFile(next);
  }

  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        {/* Vùng kéo-thả: cũng là label của input để bàn phím dùng được */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            selectFile(e.dataTransfer.files[0] ?? null);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-token border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
            dragging
              ? 'border-accent bg-accent-soft'
              : 'hover:border-border-strong hover:bg-surface-hover'
          }`}
        >
          <input
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(e) => selectFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="flex size-11 items-center justify-center rounded-token bg-accent-soft">
                <FileSpreadsheet aria-hidden className="size-5 text-accent" />
              </span>
              <span className="text-sm font-medium text-ink">{file.name}</span>
              <span className="text-sm text-ink-muted">
                {(file.size / 1024).toFixed(0)} KB · bấm để đổi file
              </span>
            </>
          ) : (
            <>
              <span className="flex size-11 items-center justify-center rounded-token bg-surface-hover">
                <Upload aria-hidden className="size-5 text-ink-muted" />
              </span>
              <span className="text-sm font-medium text-ink">
                Kéo file vào đây, hoặc bấm để chọn
              </span>
              <span className="text-sm text-ink-muted">.csv hoặc .xlsx</span>
            </>
          )}
        </label>

        <div className="space-y-4">
          <Field
            label="Ngân hàng / ví"
            hint="Để tự động nếu không chắc — hệ thống sẽ tự dò định dạng"
          >
            <Select value={profile} onChange={(e) => setProfile(e.target.value)}>
              <option value="">Tự động nhận dạng</option>
              {(profiles.data ?? [])
                .filter((item) => item.id !== 'generic')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </Select>
          </Field>

          <Field
            label="Tên thẻ (tuỳ chọn)"
            hint="Điền nếu bạn có nhiều thẻ tín dụng muốn tách riêng — ví dụ 'Visa cá nhân', 'Mastercard công ty'"
          >
            <Input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Visa cá nhân"
            />
          </Field>

          <Button
            variant="primary"
            className="w-full"
            disabled={!file}
            loading={upload.isPending}
            onClick={() => file && upload.mutate(file)}
          >
            Xem trước
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-critical" role="alert">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      )}
    </Card>
  );
}
