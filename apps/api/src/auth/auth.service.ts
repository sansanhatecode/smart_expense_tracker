import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { LoginInput, RegisterInput, UserDto } from '@expense/shared';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { maskEmail } from '../common/mask-email';
import { requestTag } from '../common/request-context';
import { AuthRepository, type CreatedCategory, type RuleSeed } from './auth.repository';
import { TokenService, type IssuedTokens, type TokenContext } from './token.service';

export interface AuthResult extends IssuedTokens {
  user: UserDto;
}

/**
 * Tham số argon2id. OWASP khuyến nghị tối thiểu m=19MiB, t=2, p=1; ở đây dùng
 * 19MiB/t=2 — đủ chậm để chống brute-force offline mà vẫn không làm request
 * login chậm thấy được.
 */
const ARGON_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  /**
   * Hash của một chuỗi ngẫu nhiên không ai biết, tính một lần lúc khởi tạo.
   *
   * Dùng để `argonVerify` vẫn chạy đủ lâu khi email không tồn tại, nên đường
   * "email sai" và "mật khẩu sai" mất thời gian như nhau — không để kẻ thăm dò
   * dò ra email nào đã đăng ký chỉ bằng cách đo thời gian phản hồi.
   *
   * Phải là hash THẬT: một chuỗi bịa sẽ làm argonVerify throw ngay vì sai
   * format, tức fail nhanh — đúng thứ mà biện pháp này muốn tránh.
   */
  private readonly dummyHash: Promise<string>;

  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: AuthRepository,
    private readonly tokens: TokenService,
  ) {
    this.dummyHash = argonHash(randomBytes(32).toString('hex'), ARGON_OPTIONS);
  }

  async register(input: RegisterInput, context: TokenContext): Promise<AuthResult> {
    const existing = await this.users.findIdByEmail(input.email);

    if (existing) {
      this.logger.warn(`Đăng ký trùng email: ${maskEmail(input.email)}${requestTag()}`);
      throw new ConflictException('Email này đã được đăng ký');
    }

    const passwordHash = await argonHash(input.password, ARGON_OPTIONS);

    const user = await this.users.createUserWithDefaults(
      { email: input.email, passwordHash, name: input.name ?? null },
      DEFAULT_CATEGORIES.map((category) => ({
        name: category.name,
        type: category.type,
        icon: category.icon,
        color: category.color,
        sortOrder: category.sortOrder,
      })),
      defaultRulesFor,
    );

    this.logger.log(`Tài khoản mới: ${maskEmail(user.email)} id=${user.id}${requestTag()}`);

    const issued = await this.tokens.issueNewFamily(user.id, user.email, context);
    return { ...issued, user };
  }

  async login(input: LoginInput, context: TokenContext): Promise<AuthResult> {
    const user = await this.users.findCredentialsByEmail(input.email);

    // Vẫn verify kể cả khi không có user — xem chú thích ở `dummyHash`.
    const passwordHash = user?.passwordHash ?? (await this.dummyHash);
    const passwordValid = await argonVerify(passwordHash, input.password).catch(() => false);

    if (!user || !passwordValid) {
      // Log PHÂN BIỆT hai nguyên nhân, dù response thì không (xem `dummyHash`).
      //
      // Không mâu thuẫn: cái cần giấu là thông tin trả cho người gọi. Log nằm
      // phía server, kẻ tấn công không đọc được, nên giấu ở đây chỉ có tác dụng
      // duy nhất là làm chính mình mù khi debug — đã từng mất công xuống tận DB
      // mới biết một tài khoản không tồn tại chứ không phải sai mật khẩu.
      this.logger.warn(
        `Login thất bại (${user ? 'sai mật khẩu' : 'email chưa đăng ký'}): ` +
          `${maskEmail(input.email)}${requestTag()}`,
      );
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Access log không nói được ai vừa login: /auth/login là route @Public nên
    // guard không gắn `user` vào request. Dòng này là chỗ duy nhất nối một
    // request tới một userId.
    this.logger.log(`Login thành công: ${maskEmail(user.email)} id=${user.id}${requestTag()}`);

    // Dọn token cũ nhân lúc có dịp — không cần cron riêng cho việc này.
    void this.tokens.cleanupExpired().catch(() => undefined);

    const issued = await this.tokens.issueNewFamily(user.id, user.email, context);
    return {
      ...issued,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    return user;
  }
}

/**
 * Rule auto-categorize mặc định, ghép keyword của `DEFAULT_CATEGORIES` vào id
 * của danh mục vừa được tạo.
 *
 * Khoá là `type:name` chứ không chỉ `name`: một cái tên có thể xuất hiện ở cả
 * chiều thu và chi.
 */
function defaultRulesFor(created: CreatedCategory[]): RuleSeed[] {
  const idByKey = new Map(created.map((c) => [`${c.type}:${c.name}`, c.id]));

  return DEFAULT_CATEGORIES.flatMap((category) => {
    const categoryId = idByKey.get(`${category.type}:${category.name}`);
    if (!categoryId) return [];
    return category.keywords.map((keyword) => ({
      keyword: keyword.toUpperCase(),
      categoryId,
      priority: 0,
    }));
  });
}
