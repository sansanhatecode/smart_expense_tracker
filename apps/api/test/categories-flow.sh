#!/usr/bin/env bash
# Kiểm thử Category + CategoryRule. Trọng tâm: cô lập dữ liệu giữa hai user
# (IDOR) và các invariant không thể diễn đạt bằng schema.
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
PASS="matkhau12345"
A_EMAIL="cat-a-$RANDOM@example.com"
B_EMAIL="cat-b-$RANDOM@example.com"
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-56s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-56s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }
jq_() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(eval('j$1')??'')}catch{console.log('')}})"; }

register() { # register <email> → access token
  curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | jq_ '.accessToken'
}
req() { # req <method> <path> <token> [json]
  local m=$1 p=$2 t=$3 data=${4:-}
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t" \
      -H 'Content-Type: application/json' -d "$data"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t"
  fi
}

A=$(register "$A_EMAIL"); B=$(register "$B_EMAIL")

echo "── 1. Danh mục mặc định ───────────────────────────────────────────────────"
R=$(req GET /api/categories "$A")
check "GET /api/categories → 200" "$(code "$R")" "200"
check "user mới có 16 danh mục seed" "$(body "$R" | jq_ '.length')" "16"
check "mỗi danh mục có transactionCount" "$(body "$R" | jq_ '[0].transactionCount')" "0"
check "cần đăng nhập" "$(code "$(curl -s -w '\n%{http_code}' "$API/api/categories")")" "401"

echo "── 2. CRUD ────────────────────────────────────────────────────────────────"
R=$(req POST /api/categories "$A" '{"name":"Cà phê","type":"expense","icon":"Coffee","color":"#a16207"}')
check "tạo danh mục → 201" "$(code "$R")" "201"
CAT=$(body "$R" | jq_ '.id')
R=$(req POST /api/categories "$A" '{"name":"Cà phê","type":"expense"}')
check "trùng tên+type → 409" "$(code "$R")" "409"
R=$(req POST /api/categories "$A" '{"name":"Cà phê","type":"income"}')
check "cùng tên khác type → OK" "$(code "$R")" "201"
R=$(req POST /api/categories "$A" '{"name":"X","type":"expense","color":"red"}')
check "màu không phải hex → 400" "$(code "$R")" "400"
R=$(req POST /api/categories "$A" '{"name":"","type":"expense"}')
check "tên rỗng → 400" "$(code "$R")" "400"
R=$(req PATCH "/api/categories/$CAT" "$A" '{"name":"Cà phê sáng"}')
check "sửa tên → 200" "$(code "$R")" "200"
check "tên đã đổi" "$(body "$R" | jq_ '.name')" "Cà phê sáng"

echo "── 3. Cô lập dữ liệu giữa user (IDOR) ─────────────────────────────────────"
R=$(req PATCH "/api/categories/$CAT" "$B" '{"name":"Cướp"}')
check "user B sửa danh mục của A → 404" "$(code "$R")" "404"
R=$(req DELETE "/api/categories/$CAT" "$B")
check "user B xoá danh mục của A → 404" "$(code "$R")" "404"
R=$(req POST /api/category-rules "$B" "{\"keyword\":\"TEST\",\"categoryId\":\"$CAT\"}")
check "user B tạo rule trỏ vào danh mục A → 404" "$(code "$R")" "404"
check "danh mục của A vẫn còn" "$(code "$(req GET /api/categories "$A")")" "200"

echo "── 4. Rule auto-categorize ────────────────────────────────────────────────"
R=$(req GET /api/category-rules "$A")
check "user mới có 122 rule seed" "$(body "$R" | jq_ '.length')" "122"
R=$(req POST /api/category-rules "$A" "{\"keyword\":\"quan oc co ba\",\"categoryId\":\"$CAT\",\"priority\":10}")
check "tạo rule → 201" "$(code "$R")" "201"
check "keyword được uppercase" "$(body "$R" | jq_ '.keyword')" "QUAN OC CO BA"
RULE=$(body "$R" | jq_ '.id')
# THE COFFEE HOUSE đã nằm trong bộ rule seed → tạo lại phải bị chặn
R=$(req POST /api/category-rules "$A" "{\"keyword\":\"the coffee house\",\"categoryId\":\"$CAT\"}")
check "keyword đã có rule → 409" "$(code "$R")" "409"
check "message không lộ tên field nội bộ" \
  "$(body "$R" | grep -cE 'userId|keyword\"?\)')" "0"
R=$(req POST /api/category-rules "$A" "{\"keyword\":\"K\",\"categoryId\":\"$CAT\"}")
check "keyword 1 ký tự → 400" "$(code "$R")" "400"
R=$(req DELETE "/api/category-rules/$RULE" "$A")
check "xoá rule → 204" "$(code "$R")" "204"
R=$(req DELETE "/api/category-rules/$RULE" "$A")
check "xoá lại → 404" "$(code "$R")" "404"

echo "── 5. Xoá danh mục không được làm mất giao dịch ───────────────────────────"
R=$(req POST /api/transactions "$A" \
  "{\"amount\":50000,\"type\":\"expense\",\"date\":\"2026-07-15\",\"description\":\"Test\",\"categoryId\":\"$CAT\"}")
TX_SUPPORTED=$(code "$R")
if [ "$TX_SUPPORTED" = "201" ]; then
  R=$(req PATCH "/api/categories/$CAT" "$A" '{"type":"income"}')
  check "đổi type khi đã có giao dịch → 400" "$(code "$R")" "400"
  R=$(req DELETE "/api/categories/$CAT" "$A")
  check "xoá danh mục → 200" "$(code "$R")" "200"
  check "báo số giao dịch bị bỏ phân loại" "$(body "$R" | jq_ '.untaggedTransactions')" "1"
else
  echo "  … bỏ qua (chưa có /api/transactions, code=$TX_SUPPORTED)"
fi

echo
echo "══ $PASSED passed, $FAILED failed ══"
[ "$FAILED" -eq 0 ]
