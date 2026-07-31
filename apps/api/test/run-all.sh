#!/usr/bin/env bash
# Chạy toàn bộ e2e: khởi động API, reset DB trước mỗi suite, tổng hợp kết quả.
#
# Vì sao cần nâng AUTH_THROTTLE_LIMIT: mỗi suite register vài user, và chạy liên
# tiếp sẽ vượt giới hạn thật (10/phút) rồi nhận 429 ở mọi request sau đó — tức
# suite thất bại vì rate limit chứ không vì bug. Nâng ở đây là đúng chỗ; giới hạn
# thật vẫn được kiểm bởi throttle-flow.sh, chạy sau cùng với giá trị đang cấu hình.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

API=http://localhost:3001
DB_URL_PARTS=(-h localhost -p 5433 -U expense -d expense_tracker)
export PGPASSWORD=expense
export AUTH_THROTTLE_LIMIT=${AUTH_THROTTLE_LIMIT:-500}

SUITES=(auth-flow categories-flow transactions-flow imports-flow throttle-flow)

reset_db() {
  psql "${DB_URL_PARTS[@]}" -q -c 'delete from "User";' >/dev/null 2>&1
}

# ─── Khởi động API với cấu hình test ───
started_here=0
if ! curl -s -o /dev/null "$API/health"; then
  echo "Khởi động API (AUTH_THROTTLE_LIMIT=$AUTH_THROTTLE_LIMIT)…"
  npm run build >/dev/null 2>&1 || { echo "build thất bại"; exit 1; }
  node dist/main.js > /tmp/expense-api-e2e.log 2>&1 &
  API_PID=$!
  started_here=1
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "$API/health" && break
    sleep 0.5
  done
  if ! curl -s -o /dev/null "$API/health"; then
    echo "API không khởi động được. Log:"; tail -20 /tmp/expense-api-e2e.log; exit 1
  fi
else
  echo "Dùng API đang chạy sẵn ở $API"
  echo "  (nếu nó chạy với AUTH_THROTTLE_LIMIT mặc định, các suite sẽ vấp 429)"
fi

cleanup() {
  [ "$started_here" = "1" ] && kill "${API_PID:-0}" 2>/dev/null
}
trap cleanup EXIT

# ─── Chạy từng suite ───
TOTAL_PASS=0; TOTAL_FAIL=0; FAILED_SUITES=()

for suite in "${SUITES[@]}"; do
  echo
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  $suite"
  echo "════════════════════════════════════════════════════════════════════════"
  reset_db
  output=$(bash "test/$suite.sh" 2>&1)
  echo "$output"

  line=$(echo "$output" | grep '══.*passed' | tail -1)
  pass=$(echo "$line" | sed -n 's/.*══ \([0-9]*\) passed.*/\1/p')
  fail=$(echo "$line" | sed -n 's/.*passed, \([0-9]*\) failed.*/\1/p')
  TOTAL_PASS=$((TOTAL_PASS + ${pass:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${fail:-0}))
  [ "${fail:-0}" != "0" ] && FAILED_SUITES+=("$suite")
done

reset_db

echo
echo "════════════════════════════════════════════════════════════════════════"
printf "  TỔNG: %d passed, %d failed\n" "$TOTAL_PASS" "$TOTAL_FAIL"
if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  printf "  Suite lỗi: %s\n" "${FAILED_SUITES[*]}"
fi
echo "════════════════════════════════════════════════════════════════════════"

[ "$TOTAL_FAIL" -eq 0 ]
