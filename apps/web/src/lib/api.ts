import type { ApiErrorBody } from '@expense/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Access token giữ trong MEMORY, không localStorage.
 *
 * Đánh đổi có ý thức: reload trang là mất token, nên phải gọi /auth/refresh để
 * dựng lại phiên (xem `restoreSession`). Đổi lại, XSS không đọc được token — mà
 * localStorage thì đọc được. Refresh token thì nằm trong httpOnly cookie nên JS
 * không thấy nó ở cả hai trường hợp.
 */
let accessToken: string | null = null;

/** Cho AuthProvider biết token vừa bị thu hồi để đẩy về trang login. */
let onUnauthenticated: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Lỗi của field cụ thể, để gắn vào input trong form. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors?.[field]?.[0];
  }
}

/**
 * Một refresh đang bay. Cần single-flight: khi trang mở nhiều query cùng lúc và
 * access token vừa hết hạn, tất cả sẽ nhận 401 gần như đồng thời. Nếu mỗi cái tự
 * gọi refresh thì token bị rotate nhiều lần liên tiếp, và refresh token của
 * request đến sau đã bị revoke bởi request đến trước — reuse detection sẽ coi đó
 * là token bị đánh cắp và revoke cả family, đăng xuất người dùng vô cớ.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        accessToken = null;
        return false;
      }

      const body = (await response.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** FormData cho upload — không set Content-Type để browser tự thêm boundary. */
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Nội bộ: chặn refresh vòng lặp khi chính /auth/refresh trả 401. */
  skipRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.formData ? { body: options.formData } : {}),
  };

  let response = await fetch(url, init);

  // 401 → thử refresh một lần rồi gọi lại. Chỉ một lần: nếu refresh xong vẫn 401
  // thì vấn đề không phải token hết hạn.
  if (response.status === 401 && !options.skipRefresh) {
    const refreshed = await refreshAccessToken();

    if (!refreshed) {
      onUnauthenticated?.();
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn');
    }

    const retryHeaders = { ...headers };
    if (accessToken) retryHeaders['Authorization'] = `Bearer ${accessToken}`;
    response = await fetch(url, { ...init, headers: retryHeaders });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(
      response.status,
      body.message ?? `Lỗi ${response.status}`,
      body.fieldErrors,
    );
  } catch {
    // Server trả về thứ không phải JSON (proxy lỗi, API chết) — nói rõ điều đó
    // thay vì hiện "undefined".
    return new ApiError(
      response.status,
      response.status >= 500
        ? 'Máy chủ đang gặp sự cố'
        : `Không đọc được phản hồi từ máy chủ (${response.status})`,
    );
  }
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', ...(query ? { query } : {}) }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', ...(body !== undefined ? { body } : {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', ...(body !== undefined ? { body } : {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', formData }),
};

/**
 * Dựng lại phiên sau khi reload trang.
 *
 * Trả `false` khi chưa đăng nhập — đó là trường hợp bình thường, không phải lỗi,
 * nên không gọi `onUnauthenticated` (sẽ gây redirect vòng khi đang ở trang login).
 */
export async function restoreSession(): Promise<boolean> {
  return refreshAccessToken();
}

export { API_URL };
