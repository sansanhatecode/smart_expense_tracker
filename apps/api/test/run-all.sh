#!/usr/bin/env bash
# Chạy toàn bộ e2e: khởi động API, reset DB trước mỗi suite, tổng hợp kết quả.
#
# Dùng HAI instance API, có lý do:
#
#   :3001  AUTH_THROTTLE_LIMIT cao  → các suite chức năng
#   :3002  AUTH_THROTTLE_LIMIT=10   → suite kiểm rate limit
#
# Vì mỗi suite chức năng register vài user, chạy liên tiếp sẽ vượt giới hạn thật
# (10/phút) rồi nhận 429 ở mọi request sau — tức suite thất bại vì rate limit chứ
# không vì bug. Nhưng nới giới hạn trong code thì mất luôn thứ cần kiểm. Hai
# instance giải quyết cả hai: suite chức năng không bị chặn, và rate limit vẫn
# được kiểm ở đúng cấu hình production.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

export PGPASSWORD=expense
DB=(-h localhost -p 5433 -U expense -d expense_tracker)

FUNCTIONAL_API=http://localhost:3001
THROTTLE_API=http://localhost:3002
FUNCTIONAL_LIMIT=${AUTH_THROTTLE_LIMIT:-500}

FUNCTIONAL_SUITES=(auth-flow categories-flow transactions-flow imports-flow accounts-flow stats-budgets-flow)

reset_db() { psql "${DB[@]}" -q -c 'delete from "User";' >/dev/null 2>&1; }

wait_for() { # wait_for <url>
  for _ in $(seq 1 40); do
    curl -s -o /dev/null "$1/health" && return 0
    sleep 0.5
  done
  return 1
}

echo "Build…"
npm run build >/dev/null 2>&1 || { echo "build thất bại"; exit 1; }

# Dọn instance cũ để không dùng nhầm binary/config trước đó
pkill -f 'node dist/main.js' 2>/dev/null
sleep 1

echo "Khởi động API chức năng ở :3001 (AUTH_THROTTLE_LIMIT=$FUNCTIONAL_LIMIT)…"
PORT=3001 AUTH_THROTTLE_LIMIT=$FUNCTIONAL_LIMIT node dist/main.js > /tmp/expense-e2e-func.log 2>&1 &
FUNC_PID=$!

echo "Khởi động API rate-limit ở :3002 (AUTH_THROTTLE_LIMIT=10)…"
PORT=3002 AUTH_THROTTLE_LIMIT=10 node dist/main.js > /tmp/expense-e2e-throttle.log 2>&1 &
THROTTLE_PID=$!

cleanup() { kill "${FUNC_PID:-0}" "${THROTTLE_PID:-0}" 2>/dev/null; }
trap cleanup EXIT

wait_for "$FUNCTIONAL_API" || { echo "API :3001 không lên. Log:"; tail -20 /tmp/expense-e2e-func.log; exit 1; }
wait_for "$THROTTLE_API"   || { echo "API :3002 không lên. Log:"; tail -20 /tmp/expense-e2e-throttle.log; exit 1; }

TOTAL_PASS=0; TOTAL_FAIL=0; FAILED_SUITES=()

run_suite() { # run_suite <name> <api-base> <throttle-limit>
  local suite=$1 api=$2 limit=$3
  echo
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  $suite"
  echo "════════════════════════════════════════════════════════════════════════"
  reset_db
  local output
  output=$(API_BASE="$api" AUTH_THROTTLE_LIMIT="$limit" bash "test/$suite.sh" 2>&1)
  echo "$output"

  local line pass fail
  line=$(echo "$output" | grep '══.*passed' | tail -1)
  pass=$(echo "$line" | sed -n 's/.*══ \([0-9]*\) passed.*/\1/p')
  fail=$(echo "$line" | sed -n 's/.*passed, \([0-9]*\) failed.*/\1/p')
  TOTAL_PASS=$((TOTAL_PASS + ${pass:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${fail:-0}))
  [ "${fail:-0}" != "0" ] && FAILED_SUITES+=("$suite")
}

for suite in "${FUNCTIONAL_SUITES[@]}"; do
  run_suite "$suite" "$FUNCTIONAL_API" "$FUNCTIONAL_LIMIT"
done

# Rate limit kiểm trên instance dùng cấu hình thật
run_suite throttle-flow "$THROTTLE_API" 10

reset_db

echo
echo "════════════════════════════════════════════════════════════════════════"
printf "  TỔNG: %d passed, %d failed\n" "$TOTAL_PASS" "$TOTAL_FAIL"
if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  printf "  Suite lỗi: %s\n" "${FAILED_SUITES[*]}"
fi
echo "════════════════════════════════════════════════════════════════════════"

[ "$TOTAL_FAIL" -eq 0 ]
