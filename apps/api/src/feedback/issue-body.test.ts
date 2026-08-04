import type { CreateFeedbackInput } from '@expense/shared';
import { describe, expect, it } from 'vitest';
import { composeIssueBody, ISSUE_LABELS } from './issue-body';

const REPORTER = { id: 'usr_123', email: 'bnhlinh2003@gmail.com' };

/** 4/8/2026 15:30 ICT. Truyền vào tường minh nên test không phụ thuộc đồng hồ. */
const NOW = new Date('2026-08-04T08:30:00.000Z');

const BUG: CreateFeedbackInput = {
  kind: 'bug',
  title: 'Tổng chi tháng 3 không khớp',
  description: 'Dashboard hiện 12.000.000 nhưng cộng tay danh sách chỉ ra 9.500.000.',
  steps: 'Mở Giao dịch → lọc tháng 3',
  page: '/transactions?from=2026-03-01',
  userAgent: 'Mozilla/5.0 (Macintosh)',
};

describe('composeIssueBody', () => {
  it('KHÔNG ghi email đầy đủ vào issue — issue có thể public', () => {
    const body = composeIssueBody(BUG, REPORTER, NOW);

    expect(body).not.toContain('bnhlinh2003@gmail.com');
    expect(body).toContain('bn***@gmail.com');
    // userId đi kèm để còn tra lại được đúng người trong DB.
    expect(body).toContain('usr_123');
  });

  it('mang theo trang và trình duyệt — hai thứ cần nhất để lần lại lỗi', () => {
    const body = composeIssueBody(BUG, REPORTER, NOW);

    expect(body).toContain('/transactions?from=2026-03-01');
    expect(body).toContain('Mozilla/5.0 (Macintosh)');
    expect(body).toContain('4/8/2026');
  });

  it('nói rõ "không rõ" khi client không gửi bối cảnh, thay vì để trống', () => {
    const body = composeIssueBody(
      { kind: 'idea', title: 'Xuất Excel', description: 'x'.repeat(20) },
      REPORTER,
      NOW,
    );

    expect(body).toContain('- Trang: `không rõ`');
    expect(body).toContain('- Trình duyệt: `không rõ`');
    // Góp ý thì không có mục các bước tái hiện.
    expect(body).not.toContain('Các bước tái hiện');
  });

  it('map loại phản hồi sang label có thật trên repo', () => {
    expect(ISSUE_LABELS.bug).toBe('bug');
    expect(ISSUE_LABELS.idea).toBe('enhancement');
  });
});
