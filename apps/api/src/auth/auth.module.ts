import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      // Cast an toàn: env.ts đã validate đúng dạng '15m' | '1h' | '7d' bằng regex.
      signOptions: { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  // JwtModule được export để JwtAuthGuard (đăng ký toàn cục ở AppModule) dùng
  // được JwtService với cùng secret.
  exports: [JwtModule, TokenService],
})
export class AuthModule {}
