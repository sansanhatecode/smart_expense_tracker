#!/usr/bin/env bash
# Kiểm tra rate limit trên route auth thật sự chặn.
#
# Đọc AUTH_THROTTLE_LIMIT từ env để chạy đúng ở cả hai cấu hình: mặc định (10)
# và cấu hình nâng cao dùng khi chạy cả bộ e2e.
set -uo pipefail

API=http://localhost:3001
LIMIT=${AUTH_THROTTLE_LIMIT:-10}
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}

echo "── Rate limit trên /auth/login (giới hạn hiện tại: $LIMIT/phút) ───────────"

# Gọi vượt giới hạn. Dùng login với mật khẩu sai — đúng hình dạng của brute-force,
# và không tạo user rác.
got429=0
codes=""
for i in $(seq 1 $((LIMIT + 5))); do
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"khong-ton-tai@example.com","password":"sai-mat-khau"}')
  codes="$codes $c"
  [ "$c" = "429" ] && got429=1
done

check "vượt giới hạn thì bị chặn bằng 429" "$got429" "1"
check "trước khi bị chặn vẫn trả 401 (không phải 429 ngay từ đầu)" \
  "$(echo "$codes" | tr ' ' '\n' | grep -c '^401$' | awk '{print ($1>0)?1:0}')" "1"

echo "── /health không bị rate limit chặt như auth ──────────────────────────────"
health_ok=1
for i in $(seq 1 20); do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$API/health")
  [ "$c" != "200" ] && health_ok=0
done
check "20 lần gọi /health liên tiếp vẫn 200" "$health_ok" "1"

echo
echo "══ $PASSED passed, $FAILED failed ══"
[ "$FAILED" -eq 0 ]
