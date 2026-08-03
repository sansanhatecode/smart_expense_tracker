import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpLogger } from './http-logger.middleware';
import { currentRequestContext, requestTag } from './request-context';

interface FakeResponse extends EventEmitter {
  statusCode: number;
  writableFinished: boolean;
  headers: Record<string, unknown>;
  setHeader(name: string, value: unknown): void;
}

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/transactions?page=1',
    path: '/transactions',
    ip: '::1',
    headers: {},
    ...overrides,
  } as Request;
}

function fakeResponse(): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = 200;
  response.writableFinished = false;
  response.headers = {};
  response.setHeader = (name, value) => {
    response.headers[name] = value;
  };
  return response;
}

/** Kết thúc response bình thường: 'finish' rồi 'close', đúng thứ tự Node phát ra. */
function finish(response: FakeResponse, statusCode: number): void {
  response.statusCode = statusCode;
  response.writableFinished = true;
  response.emit('finish');
  response.emit('close');
}

function run(request: Request, response: FakeResponse, next: NextFunction = vi.fn()): void {
  httpLogger(request, response as unknown as Response, next);
}

function spyOnLogger() {
  return {
    log: vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    warn: vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    error: vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
    debug: vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('httpLogger', () => {
  it('log một dòng khi response kết thúc, kèm method, url, status và request id', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest(), response);
    expect(logger.log).not.toHaveBeenCalled(); // chưa xong thì chưa log

    finish(response, 200);

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0]?.[0]).toMatch(
      /^GET \/transactions\?page=1 → 200 \d+ms req=[\w-]{8} ip=::1$/,
    );
  });

  it('trả X-Request-Id về client để người báo lỗi có mã tra log', () => {
    spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest(), response);

    expect(response.headers['X-Request-Id']).toMatch(/^[\w-]{8}$/);
  });

  it('dùng lại x-request-id của client để nối được log xuyên service', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest({ headers: { 'x-request-id': 'trace-abc-123' } }), response);
    finish(response, 200);

    expect(response.headers['X-Request-Id']).toBe('trace-abc-123');
    expect(logger.log.mock.calls[0]?.[0]).toContain('req=trace-abc-123');
  });

  it('bỏ x-request-id có ký tự lạ — nếu không, client bịa được dòng log giả', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest({ headers: { 'x-request-id': 'abc\nERROR Đã xoá sạch database' } }), response);
    finish(response, 200);

    const line = String(logger.log.mock.calls[0]?.[0]);
    expect(line).not.toContain('Đã xoá sạch database');
    expect(response.headers['X-Request-Id']).toMatch(/^[\w-]{8}$/);
  });

  it('chọn level theo status: 2xx→log, 4xx→warn, 5xx→error', () => {
    const logger = spyOnLogger();

    for (const [status, level] of [
      [200, 'log'],
      [401, 'warn'],
      [429, 'warn'],
      [500, 'error'],
    ] as const) {
      const response = fakeResponse();
      run(fakeRequest(), response);
      finish(response, status);
      expect(logger[level], `status ${status}`).toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it('hạ /health xuống debug — uptime check gọi liên tục sẽ nhấn chìm log thật', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest({ originalUrl: '/health', path: '/health' }), response);
    finish(response, 200);

    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('ghi userId mà guard gắn vào request SAU khi middleware đã chạy', () => {
    const logger = spyOnLogger();
    const request = fakeRequest();
    const response = fakeResponse();

    run(request, response, () => {
      // Đúng thời điểm JwtAuthGuard gắn user: sau middleware, trước response.
      Object.assign(request, { user: { id: 'cms8r9do20000n6msaril6bqv', email: 'a@b.com' } });
    });
    finish(response, 200);

    expect(logger.log.mock.calls[0]?.[0]).toContain('user=cms8r9do20000n6msaril6bqv');
  });

  it('vẫn log khi client ngắt kết nối giữa đường', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest({ method: 'POST', originalUrl: '/imports', path: '/imports' }), response);
    // Client huỷ upload: 'close' bắn ra mà response chưa từng gửi xong.
    response.emit('close');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0]).toContain('→ ABORT');
  });

  it('chỉ log một lần dù cả finish và close đều bắn', () => {
    const logger = spyOnLogger();
    const response = fakeResponse();

    run(fakeRequest(), response);
    finish(response, 200);

    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('đưa request context xuống các tầng sau, để service log được request id', () => {
    spyOnLogger();
    const response = fakeResponse();
    let tagInHandler = '';
    let idInHandler: string | undefined;

    run(fakeRequest(), response, () => {
      tagInHandler = requestTag();
      idInHandler = currentRequestContext()?.requestId;
    });

    expect(idInHandler).toMatch(/^[\w-]{8}$/);
    expect(tagInHandler).toBe(` req=${idInHandler}`);
  });

  it('requestTag() rỗng khi gọi ngoài request — boot và cron không có gì để tương quan', () => {
    expect(requestTag()).toBe('');
    expect(currentRequestContext()).toBeUndefined();
  });
});
