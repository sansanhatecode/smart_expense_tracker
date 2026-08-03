import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
}

/**
 * Request id đi theo async context, không phải tham số truyền tay.
 *
 * Lý do dùng AsyncLocalStorage: các service ở sâu (AuthService, ImportsService)
 * cũng cần gắn request id vào log của mình, mà thêm một tham số `requestId` vào
 * mọi hàm chỉ để phục vụ log là cái giá quá đắt — nó bẩn cả signature của domain
 * layer. ALS là API sẵn có của Node, không thêm dependency nào.
 */
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * 8 ký tự đầu của một UUID v4.
 *
 * Đủ để ghép các dòng log của cùng một request trong cùng một cửa sổ thời gian —
 * mục đích duy nhất của id này. Không dùng nó làm khoá dữ liệu, nên trùng lặp
 * sau vài triệu request không phải vấn đề, còn id ngắn thì log dễ đọc hơn hẳn.
 */
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Hậu tố ` req=xxxxxxxx` để mọi dòng log của cùng một request ghép được với nhau.
 *
 * Trả về chuỗi rỗng khi gọi ngoài request (lúc boot, trong cron nội bộ) — chỗ đó
 * không có gì để tương quan, thêm `req=unknown` chỉ làm rác log.
 */
export function requestTag(): string {
  const context = storage.getStore();
  return context ? ` req=${context.requestId}` : '';
}
