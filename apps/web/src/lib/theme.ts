'use client';

import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

/** Khoá trong localStorage. Trùng với khoá mà THEME_INIT_SCRIPT đọc. */
const STORAGE_KEY = 'theme';

/**
 * Script chạy TRƯỚC khi trang vẽ lần đầu, nhúng thẳng vào <head>.
 *
 * Không có nó thì trang luôn vẽ theo prefers-color-scheme trước, rồi React
 * mount xong mới sửa lại — người chọn dark trên máy đang để light sẽ thấy một
 * cú loé trắng mỗi lần tải trang. Đây là lý do duy nhất để dùng script chèn
 * tay: mọi cách làm bằng React đều chạy sau lần vẽ đầu.
 *
 * `system` cố ý KHÔNG ghi thuộc tính nào: lúc đó CSS rơi về @media
 * prefers-color-scheme, và đổi theme ở cấp hệ điều hành sẽ đi theo ngay mà
 * không cần JS chạy lại.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * localStorage là một external store, nên nó được đọc qua
 * `useSyncExternalStore` chứ không phải useEffect + setState.
 *
 * Lý do không dùng effect: nó chạy SAU lần vẽ đầu, tức thêm một vòng render chỉ
 * để sửa lại thứ vừa vẽ. `useSyncExternalStore` có sẵn đường cho đúng tình
 * huống này — một snapshot cho server (chưa biết gì) và một cho client.
 */
let cached: ThemePref | null = null;
const listeners = new Set<() => void>();

function readStorage(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Safari ở chế độ riêng tư ném lỗi khi đọc localStorage. Không đọc được thì
    // theo hệ thống — đó cũng là mặc định.
    return 'system';
  }
}

function apply(pref: ThemePref) {
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

function notify() {
  for (const listener of listeners) listener();
}

/** Tab khác đổi theme thì tab này đi theo, không đợi tải lại. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  cached = readStorage();
  apply(cached);
  notify();
}

function subscribe(onChange: () => void) {
  // Có thể có hai ThemeToggle cùng sống một lúc (sidebar desktop vẫn nằm trong
  // DOM khi drawer mobile mở), nên listener của window chỉ gắn một lần.
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): ThemePref {
  cached ??= readStorage();
  return cached;
}

/**
 * Server không đọc được localStorage. Trả `null` để lần vẽ đầu ở client khớp
 * với HTML từ server — chỗ dùng phải xử lý được `null` thay vì đoán 'system',
 * vì đoán sai thì nút sáng nhầm ô trong một khoảnh khắc, đúng kiểu nhấp nháy mà
 * THEME_INIT_SCRIPT vừa dẹp xong.
 */
function getServerSnapshot(): ThemePref | null {
  return null;
}

export function useTheme(): { pref: ThemePref | null; setPref: (next: ThemePref) => void } {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPref = (next: ThemePref) => {
    cached = next;
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Không ghi được thì lựa chọn chỉ sống trong phiên này — vẫn tốt hơn là
      // để cả nút không bấm được.
    }
    notify();
  };

  return { pref, setPref };
}
