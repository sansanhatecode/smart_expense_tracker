'use client';

import type { ImportPreviewDto } from '@expense/shared';
import { Card, CardHeader } from '@/components/ui';

/** Dòng bị bỏ: nói lý do thay vì im lặng bỏ. */
export function SkippedRowsCard({ rows }: { rows: ImportPreviewDto['skippedRows'] }) {
  if (rows.length === 0) return null;

  return (
    <Card className="p-5">
      {/* Không gọi là "không đọc được": có dòng bị bỏ vì đọc ĐƯỢC và hiểu rõ
          là không nên thêm — thanh toán sao kê thẻ, giao dịch thất bại. */}
      <CardHeader
        title={`${rows.length} dòng không được thêm`}
        subtitle="Dòng tổng cộng, ghi chú cuối file, hoặc khoản không phải giao dịch"
      />
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={`${row.rowIndex}-${row.raw}`} className="text-sm">
            <span className="text-critical">{row.reason}</span>
            <span className="ml-2 text-ink-muted">— {row.raw.slice(0, 90)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
