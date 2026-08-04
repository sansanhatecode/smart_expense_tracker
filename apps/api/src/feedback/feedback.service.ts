import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { CreateFeedbackInput, FeedbackDto } from '@expense/shared';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { env } from '../config/env';
import { composeIssueBody, ISSUE_LABELS } from './issue-body';

/**
 * Nhận báo lỗi từ trong app và mở issue trên GitHub.
 *
 * Vì sao không để người dùng tự vào GitHub điền: phần lớn người dùng của app này
 * không có tài khoản GitHub, và bắt họ tạo một cái để báo "số chi tiêu tháng 3
 * sai" nghĩa là sẽ không có ai báo cả. Token nằm ở server nên form trong app là
 * cách duy nhất — client KHÔNG bao giờ được thấy token.
 *
 * Module này không có repository vì không chạm DB: báo lỗi đi thẳng sang GitHub.
 * Đánh đổi có ý thức — GitHub chết thì báo lỗi đó mất, nên phần catch ghi trọn
 * nội dung ra log để còn vớt lại được bằng tay.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  /**
   * 10 giây: đủ cho một request tới api.github.com kể cả lúc mạng tệ, và ngắn hơn
   * mức người dùng chịu ngồi nhìn spinner. Không có timeout thì fetch treo theo
   * mặc định của OS — hàng phút.
   */
  private static readonly TIMEOUT_MS = 10_000;

  async create(user: AuthenticatedUser, input: CreateFeedbackInput): Promise<FeedbackDto> {
    const { GITHUB_ISSUE_REPO: repo, GITHUB_ISSUE_TOKEN: token } = env;

    // Ghép body TRƯỚC khi kiểm cấu hình: thiếu token cũng phải giữ lại được nội
    // dung người dùng vừa gõ (xem `logReport`), không chỉ ghi "chưa cấu hình" rồi
    // để nó bay mất.
    const body = composeIssueBody(input, user, new Date());

    if (!repo || !token) {
      // Nói rõ THIẾU BIẾN NÀO và nhắc phải restart: `env` chỉ được đọc lúc boot,
      // nên sửa .env mà không restart thì log vẫn báo thiếu y như cũ và rất dễ
      // tưởng là mình điền sai.
      const missing = [!repo && 'GITHUB_ISSUE_REPO', !token && 'GITHUB_ISSUE_TOKEN']
        .filter(Boolean)
        .join(' và ');

      this.logReport(
        input,
        body,
        `Thiếu ${missing} trong apps/api/.env. Điền xong phải restart API — env chỉ đọc lúc boot.`,
      );

      // Nói rõ là phía server chưa cấu hình, đừng để người dùng tưởng nội dung họ
      // vừa gõ có vấn đề rồi sửa đi sửa lại.
      throw new ServiceUnavailableException(
        'Chức năng báo lỗi chưa được cấu hình trên máy chủ. Vui lòng thử lại sau.',
      );
    }

    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          // Ghim version: GitHub đổi hành vi theo header này, không theo ngày.
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: input.title,
          body,
          labels: [ISSUE_LABELS[input.kind]],
        }),
        signal: AbortSignal.timeout(FeedbackService.TIMEOUT_MS),
      });
    } catch (error) {
      throw this.lost(input, body, error);
    }

    if (!response.ok) {
      // Body của lỗi GitHub nói rõ nguyên nhân (token hết hạn, label không tồn
      // tại, repo sai) — ghi lại, vì đó là thứ duy nhất để sửa cấu hình.
      const detail = await response.text().catch(() => '');
      throw this.lost(input, body, `GitHub trả ${response.status}: ${detail.slice(0, 500)}`);
    }

    const issue = (await response.json()) as { number: number; html_url: string };

    this.logger.log(`Đã tạo issue #${issue.number} (${input.kind}) cho user ${user.id}`);

    return { number: issue.number, url: issue.html_url };
  }

  /**
   * Ghi TRỌN nội dung báo lỗi ra log kèm nguyên nhân không gửi được.
   *
   * Log là bản sao DUY NHẤT còn lại: không có bảng DB nào giữ nó. Mất một báo lỗi
   * còn tệ hơn mất một request bình thường — người dùng đã bỏ công gõ, và sẽ
   * không gõ lại lần thứ hai. Dùng cho cả trường hợp chưa cấu hình token, vì
   * "server chưa sẵn sàng" không phải lý do để bỏ nội dung của họ.
   */
  private logReport(input: CreateFeedbackInput, body: string, cause: unknown): void {
    this.logger.error(
      `Không tạo được issue GitHub. Nội dung báo lỗi:\n[${input.kind}] ${input.title}\n${body}`,
      cause instanceof Error ? cause.stack : String(cause),
    );
  }

  /** Ghi log rồi trả về lỗi cho người dùng — dùng khi GitHub từ chối hoặc chết. */
  private lost(input: CreateFeedbackInput, body: string, cause: unknown): Error {
    this.logReport(input, body, cause);

    return new ServiceUnavailableException(
      'Không gửi được báo lỗi lúc này. Bạn thử lại sau ít phút nhé — nội dung vừa gõ vẫn còn trong form.',
    );
  }
}
