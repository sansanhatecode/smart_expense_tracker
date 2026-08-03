import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { updateAccountSchema, type AccountDto, type UpdateAccountInput } from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccountsService } from './accounts.service';

/**
 * Cố tình KHÔNG có POST.
 *
 * Nguồn tiền được tạo tự động lúc import, từ chính nội dung file. Mở đường tạo
 * tay sẽ sinh ra những account không có `fingerprint` khớp với bất kỳ file nào,
 * nên lần import sau vẫn đẻ ra account riêng của nó và người dùng có hai dòng
 * cho cùng một cái thẻ.
 */
@Controller('api/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@CurrentUserId() userId: string): Promise<AccountDto[]> {
    return this.accounts.list(userId);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput,
  ): Promise<AccountDto> {
    return this.accounts.update(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    return this.accounts.remove(userId, id);
  }
}
