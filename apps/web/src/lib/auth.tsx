'use client';

import type { AuthResponse, LoginInput, RegisterInput, UserDto } from '@expense/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, restoreSession, setAccessToken, setUnauthenticatedHandler } from './api';

interface AuthState {
  user: UserDto | null;
  /** true trong lúc đang thử dựng lại phiên — chưa biết đã đăng nhập hay chưa. */
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Refresh sớm hơn hạn một chút để không có khoảng thời gian token đã chết. */
const REFRESH_MARGIN_SECONDS = 60;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  /**
   * Hẹn giờ refresh trước khi access token hết hạn.
   *
   * Chủ động refresh thay vì chờ 401: nếu chờ, mỗi lần token hết hạn sẽ có một
   * loạt request thất bại rồi retry — người dùng thấy màn hình nhấp nháy. API
   * client vẫn xử lý 401 như lưới an toàn cho trường hợp máy vừa thức khỏi sleep.
   *
   * `setInterval` chứ không phải `setTimeout` tự hẹn lại: mỗi lần refresh đều
   * hẹn lại theo ĐÚNG khoảng cũ (đường này không biết hạn mới), nên nó vốn là
   * một interval. Viết bằng đệ quy thì hàm phải tự tham chiếu chính mình bên
   * trong `useCallback` của nó — thứ mà `react-hooks/immutability` chặn, và
   * chặn có lý: closure bắt lấy binding của lần render tạo ra nó.
   */
  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      clearTimer();
      const delayMs = Math.max(5, expiresIn - REFRESH_MARGIN_SECONDS) * 1000;

      refreshTimer.current = setInterval(() => {
        void (async () => {
          const ok = await restoreSession();
          if (!ok) {
            clearTimer();
            setUser(null);
            router.replace('/login');
          }
        })();
      }, delayMs);
    },
    [clearTimer, router],
  );

  const applyAuth = useCallback(
    (response: AuthResponse) => {
      setAccessToken(response.accessToken);
      setUser(response.user);
      scheduleRefresh(response.expiresIn);
    },
    [scheduleRefresh],
  );

  // Dựng lại phiên khi mở trang: access token nằm trong memory nên reload là mất.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await restoreSession();
      if (cancelled) return;

      if (restored) {
        try {
          const me = await api.get<UserDto>('/auth/me');
          if (!cancelled) {
            setUser(me);
            // Không biết expiresIn từ đường này; 15 phút là mặc định của API
            scheduleRefresh(15 * 60);
          }
        } catch {
          if (!cancelled) setUser(null);
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [scheduleRefresh]);

  // Khi API client phát hiện phiên đã chết hẳn thì đẩy về login.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setUser(null);
      clearTimer();
      queryClient.clear();
      router.replace('/login');
    });
    return () => setUnauthenticatedHandler(null);
  }, [clearTimer, queryClient, router]);

  useEffect(() => clearTimer, [clearTimer]);

  const login = useCallback(
    async (input: LoginInput) => {
      applyAuth(await api.post<AuthResponse>('/auth/login', input));
    },
    [applyAuth],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      applyAuth(await api.post<AuthResponse>('/auth/register', input));
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      // Dọn phía client dù API có lỗi: người dùng đã nói muốn đăng xuất.
      setAccessToken(null);
      setUser(null);
      clearTimer();
      queryClient.clear();
      router.replace('/login');
    }
  }, [clearTimer, queryClient, router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được dùng bên trong <AuthProvider>');
  }
  return context;
}
