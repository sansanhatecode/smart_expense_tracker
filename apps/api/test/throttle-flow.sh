#!/usr/bin/env bash
# Kiểm tra rate limit trên route auth thật sự chặn.
#
# Chạy với cấu hình THẬT (mặc định 10/phút), không phải cấu hình nâng cao mà các
# suite chức năng dùng — nếu không thì phải gửi hàng trăm request, mỗi request một
# phép argon2 19MiB, và bài test mất vài phút mà chẳng kiểm được gì thêm.
#
# run-all.sh khởi động riêng một instance ở port 3002 với giới hạn thật cho suite
# này. Chạy tay thì trỏ API_BASE vào instance đang dùng cấu hình mặc định.
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
LIMIT=${AUTH_THROTTLE_LIMIT:-10}
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}

if [ "$LIMIT" -gt 40 ]; then
  echo "  ⨯ Bỏ qua: AUTH_THROTTLE_LIMIT=$LIMIT quá cao để kiểm bằng cách gửi vượt."
  echo "    Suite này cần cấu hình mặc định. run-all.sh lo việc đó tự động."
  echo
  echo "══ 0 passed, 0 failed ══"
  exit 0
fi

echo "── Rate limit /auth/login (giới hạn: $LIMIT/phút, API: $API) ──────────────"

# Gửi vượt giới hạn bằng login sai mật khẩu — đúng hình dạng brute-force, và
# không tạo user rác.
saw401=0; saw429=0
for _ in $(seq 1 $((LIMIT + 3))); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"khong-ton-tai@example.com","password":"sai-mat-khau"}')
  [ "$c" = "401" ] && saw401=1
  [ "$c" = "429" ] && saw429=1
done

check "vài request đầu trả 401 (chưa bị chặn ngay)" "$saw401" "1"
check "vượt giới hạn thì bị chặn bằng 429" "$saw429" "1"

echo "── /health không bị siết như route auth ───────────────────────────────────"
health_ok=1
for _ in $(seq 1 25); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")" != "200" ] && health_ok=0
done
check "25 lần gọi /health liên tiếp vẫn 200" "$health_ok" "1"

echo
echo "══ $PASSED passed, $FAILED failed ══"
[ "$FAILED" -eq 0 ]
