'use client';

import { useState } from 'react';
import { BatchHistory } from '@/components/imports/BatchHistory';
import { PreviewPanel } from '@/components/imports/PreviewPanel';
import { UploadPanel } from '@/components/imports/UploadPanel';
import { PageHeader } from '@/components/ui';

export default function ImportsPage() {
  /** Lô đang xem trước. `null` = đang ở màn hình upload + lịch sử. */
  const [batchId, setBatchId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Import sao kê"
        subtitle="Tải file CSV hoặc Excel từ ngân hàng. Xem trước rồi mới ghi vào dữ liệu."
      />

      {batchId ? (
        <PreviewPanel batchId={batchId} onClose={() => setBatchId(null)} />
      ) : (
        <>
          <UploadPanel onUploaded={setBatchId} />
          <BatchHistory onOpen={setBatchId} />
        </>
      )}
    </div>
  );
}
