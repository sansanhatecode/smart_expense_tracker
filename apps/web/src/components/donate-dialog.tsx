'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Modal } from './ui';

/** Thông tin nhận donate. Sửa ở đây, đừng rải số tài khoản khắp component. */
const BANK = {
  name: 'Shinhan Bank',
  number: '0862727051',
  holder: 'NGUYEN KIEU LINH',
};

/**
 * Lời mời donate — mở từ sidebar, cố tình KHÔNG tự bật.
 *
 * Đây là app cá nhân dùng hằng ngày; một banner xin tiền chen giữa các con số chi
 * tiêu chỉ làm người dùng ngại mở app. Ai muốn thì tự bấm vào.
 */
export function DonateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  // Reset chữ "Đã copy" bằng effect có cleanup, không phải setTimeout rời: bấm
  // hai lần liên tiếp thì timer cũ bị dọn, không tắt chữ sớm hơn dự kiến.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BANK.number);
      setCopied(true);
    } catch {
      // Clipboard API cần secure context và quyền của trình duyệt — thiếu là ném
      // lỗi. Không cần báo gì: số tài khoản vẫn hiện nguyên và chọn tay được.
    }
  };

  return (
    <Modal
      open={open}
      title="Ủng hộ dev"
      description="App miễn phí, không quảng cáo. Nếu nó giúp bạn quản tiền dễ hơn thì mời dev một ly cà phê nhé — hoàn toàn tuỳ tâm."
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-token-sm border bg-surface-raised px-4 py-3">
        <div className="text-sm">
          {/* `tabular` để dãy số không nhảy chiều rộng, giống mọi số tiền khác
              trong app. `select-all` để bấm một lần là chọn trọn số. */}
          <p className="select-all font-medium tabular text-ink">{BANK.number}</p>
          <p className="text-ink-muted">
            {BANK.holder} · {BANK.name}
          </p>
        </div>
        {/* Chiều rộng chốt theo nhãn DÀI NHẤT ("Đã copy"). Để nút tự co theo chữ
            thì lúc bấm nó nở ra, đẩy cả hàng xuống dòng — giao diện nhảy ngay
            dưới ngón tay vừa bấm, trông như bấm hỏng. */}
        <Button
          size="sm"
          className="min-w-28"
          onClick={() => void copy()}
          aria-label="Copy số tài khoản"
        >
          {copied ? (
            <>
              <Check aria-hidden className="size-4" />
              Đã copy
            </>
          ) : (
            <>
              <Copy aria-hidden className="size-4" />
              Copy
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
