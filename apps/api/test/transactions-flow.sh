#!/usr/bin/env bash
# Kiểm thử Transaction CRUD + filter. Trọng tâm:
#   - ranh giới ngày/tháng không lệch (hồi quy ADR 9.5: cột DATE, không timestamptz)
#   - nhập tay hai giao dịch giống hệt nhau đều được giữ (hồi quy ADR 9.8)
#   - sửa giao dịch KHÔNG tính lại dedupeHash
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
PASS="matkhau12345"
A_EMAIL="tx-a-$RANDOM@example.com"
B_EMAIL="tx-b-$RANDOM@example.com"
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-56s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-56s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }
jq_() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(eval('j$1')??'')}catch{console.log('')}})"; }

register() {
  curl -s -X POST "$API/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" | jq_ '.accessToken'
}
req() {
  local m=$1 p=$2 t=$3 data=${4:-}
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t" \
      -H 'Content-Type: application/json' -d "$data"
  else
    curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $t"
  fi
}
mktx() { # mktx <token> <amount> <date> <desc> [categoryId] [type]
  local t=$1 amt=$2 d=$3 desc=$4 cat=${5:-null} ty=${6:-expense}
  local catJson='null'; [ "$cat" != "null" ] && catJson="\"$cat\""
  req POST /api/transactions "$t" \
    "{\"amount\":$amt,\"type\":\"$ty\",\"date\":\"$d\",\"description\":\"$desc\",\"categoryId\":$catJson}"
}

A=$(register "$A_EMAIL"); B=$(register "$B_EMAIL")
EXP_CAT=$(body "$(req GET /api/categories "$A")" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.type==='expense').id)})")
INC_CAT=$(body "$(req GET /api/categories "$A")" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.type==='income').id)})")

echo "── 1. Tạo & validate ──────────────────────────────────────────────────────"
R=$(mktx "$A" 50000 2026-07-15 "Ca phe" "$EXP_CAT")
check "tạo giao dịch → 201" "$(code "$R")" "201"
TX=$(body "$R" | jq_ '.id')
check "amount trả về đúng" "$(body "$R" | jq_ '.amount')" "50000"
check "date trả về YYYY-MM-DD" "$(body "$R" | jq_ '.date')" "2026-07-15"
check "category được nhúng vào response" "$(body "$R" | jq_ '.category.id')" "$EXP_CAT"
check "amount = 0 → 400" "$(code "$(mktx "$A" 0 2026-07-15 'X')")" "400"
check "amount âm → 400" "$(code "$(mktx "$A" -5000 2026-07-15 'X')")" "400"
check "amount không nguyên → 400" "$(code "$(mktx "$A" 1500.5 2026-07-15 'X')")" "400"
check "ngày không tồn tại → 400" "$(code "$(mktx "$A" 1000 2026-02-30 'X')")" "400"
check "ngày sai định dạng → 400" "$(code "$(mktx "$A" 1000 15/07/2026 'X')")" "400"
check "mô tả rỗng → 400" "$(code "$(mktx "$A" 1000 2026-07-15 '')")" "400"
check "giao dịch chi vào danh mục thu → 404" "$(code "$(mktx "$A" 1000 2026-07-15 'X' "$INC_CAT")")" "404"

echo "── 2. Tiền lớn đi qua BigInt không mất chính xác ───────────────────────────"
R=$(mktx "$A" 999999999999999 2026-07-10 "Mua nha")
check "999.999.999.999.999đ → 201" "$(code "$R")" "201"
check "đọc lại vẫn đúng số" "$(body "$R" | jq_ '.amount')" "999999999999999"
check "vượt trần 10^15 → 400" "$(code "$(mktx "$A" 1000000000000001 2026-07-10 'X')")" "400"

echo "── 3. Nhập tay hai giao dịch giống hệt nhau (hồi quy ADR 9.8) ─────────────"
R1=$(mktx "$A" 25000 2026-07-20 "Highlands Coffee" "$EXP_CAT")
R2=$(mktx "$A" 25000 2026-07-20 "Highlands Coffee" "$EXP_CAT")
check "ly cà phê thứ nhất → 201" "$(code "$R1")" "201"
check "ly cà phê thứ hai CŨNG → 201 (không bị coi là trùng)" "$(code "$R2")" "201"
R=$(req GET "/api/transactions?q=Highlands" "$A")
check "cả hai đều có trong DB" "$(body "$R" | jq_ '.total')" "2"

echo "── 4. Ranh giới ngày/tháng (hồi quy ADR 9.5) ──────────────────────────────"
mktx "$A" 11000 2026-08-01 "Ngay dau thang 8" >/dev/null
mktx "$A" 12000 2026-07-31 "Ngay cuoi thang 7" >/dev/null
R=$(req GET "/api/transactions?from=2026-07-01&to=2026-07-31" "$A")
T7=$(body "$R" | jq_ '.total')
R=$(req GET "/api/transactions?from=2026-08-01&to=2026-08-31" "$A")
T8=$(body "$R" | jq_ '.total')
check "ngày 31/7 nằm trong tháng 7" \
  "$(req GET "/api/transactions?from=2026-07-31&to=2026-07-31" "$A" | sed '$d' | jq_ '.items[0].description')" \
  "Ngay cuoi thang 7"
check "ngày 1/8 nằm trong tháng 8, không rơi về tháng 7" "$T8" "1"
check "'to' là bao gồm (inclusive)" \
  "$(req GET "/api/transactions?from=2026-08-01&to=2026-08-01" "$A" | sed '$d' | jq_ '.total')" "1"
check "from > to → 400" "$(code "$(req GET "/api/transactions?from=2026-08-01&to=2026-07-01" "$A")")" "400"

echo "── 5. Filter & sort & phân trang ──────────────────────────────────────────"
check "filter theo type=expense" \
  "$(req GET "/api/transactions?type=income" "$A" | sed '$d' | jq_ '.total')" "0"
# 6 giao dịch: 3 có danh mục (Ca phe + 2 ly Highlands), 3 chưa (Mua nha, 1/8, 31/7)
check "tổng cộng 6 giao dịch" \
  "$(req GET /api/transactions "$A" | sed '$d' | jq_ '.total')" "6"
check "filter uncategorized" \
  "$(req GET "/api/transactions?uncategorized=true" "$A" | sed '$d' | jq_ '.total')" "3"
check "filter theo categoryId" \
  "$(req GET "/api/transactions?categoryId=$EXP_CAT" "$A" | sed '$d' | jq_ '.total')" "3"
check "sort amount_desc lấy giao dịch lớn nhất trước" \
  "$(req GET "/api/transactions?sort=amount_desc&limit=1" "$A" | sed '$d' | jq_ '.items[0].amount')" "999999999999999"
check "phân trang: 6 dòng / limit 2 → 3 trang" \
  "$(req GET "/api/transactions?limit=2" "$A" | sed '$d' | jq_ '.totalPages')" "3"
check "limit vượt 200 → 400" "$(code "$(req GET "/api/transactions?limit=500" "$A")")" "400"

echo "── 6. Sửa không được tính lại dedupeHash ──────────────────────────────────"
R=$(req PATCH "/api/transactions/$TX" "$A" '{"description":"Ca phe sang","amount":60000}')
check "sửa → 200" "$(code "$R")" "200"
check "mô tả đã đổi" "$(body "$R" | jq_ '.description')" "Ca phe sang"
check "số tiền đã đổi" "$(body "$R" | jq_ '.amount')" "60000"
# Hồi quy: PATCH không gửi categoryId thì KHÔNG được xoá danh mục.
# .partial() trên schema có .default() từng làm chính xác điều đó.
check "PATCH không gửi categoryId → danh mục còn nguyên" "$(body "$R" | jq_ '.category.id')" "$EXP_CAT"
check "vẫn còn 3 giao dịch chưa phân loại (không phải 4)" \
  "$(req GET "/api/transactions?uncategorized=true" "$A" | sed '$d' | jq_ '.total')" "3"
# Gửi null tường minh thì phải xoá thật — khác với không gửi
R2=$(req PATCH "/api/transactions/$TX" "$A" '{"categoryId":null}')
check "PATCH categoryId:null → xoá danh mục thật" "$(body "$R2" | jq_ '.category')" ""
R2=$(req PATCH "/api/transactions/$TX" "$A" "{\"categoryId\":\"$EXP_CAT\"}")
check "gán lại danh mục → OK" "$(body "$R2" | jq_ '.category.id')" "$EXP_CAT"
# Nếu sửa mà hash được tính lại, tạo bản gốc lại sẽ ra 201; đúng thì phải 409
R=$(mktx "$A" 50000 2026-07-15 "Ca phe" "$EXP_CAT")
check "tạo lại bản GỐC → 409 (hash vẫn giữ dữ liệu gốc)" "$(code "$R")" "409"

echo "── 7. Bulk categorize ─────────────────────────────────────────────────────"
IDS=$(req GET "/api/transactions?uncategorized=true" "$A" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(JSON.stringify(j.items.map(i=>i.id)))})")
R=$(req PATCH /api/transactions/bulk-categorize "$A" "{\"transactionIds\":$IDS,\"categoryId\":\"$EXP_CAT\"}")
check "gán danh mục hàng loạt → 200" "$(code "$R")" "200"
check "báo đúng số dòng đã sửa" "$(body "$R" | jq_ '.updated')" "3"
check "không còn giao dịch chưa phân loại" \
  "$(req GET "/api/transactions?uncategorized=true" "$A" | sed '$d' | jq_ '.total')" "0"

echo "── 8. Cô lập dữ liệu giữa user ────────────────────────────────────────────"
check "user B đọc list → chỉ thấy của mình (0)" \
  "$(req GET /api/transactions "$B" | sed '$d' | jq_ '.total')" "0"
check "user B sửa giao dịch của A → 404" "$(code "$(req PATCH "/api/transactions/$TX" "$B" '{"amount":1}')")" "404"
check "user B xoá giao dịch của A → 404" "$(code "$(req DELETE "/api/transactions/$TX" "$B")")" "404"
R=$(req PATCH /api/transactions/bulk-categorize "$B" "{\"transactionIds\":$IDS,\"categoryId\":null}")
check "user B bulk-categorize id của A → sửa 0 dòng" "$(body "$R" | jq_ '.updated')" "0"

echo "── 9. Xoá ─────────────────────────────────────────────────────────────────"
check "xoá → 204" "$(code "$(req DELETE "/api/transactions/$TX" "$A")")" "204"
check "xoá lại → 404" "$(code "$(req DELETE "/api/transactions/$TX" "$A")")" "404"

echo
echo "══ $PASSED passed, $FAILED failed ══"
[ "$FAILED" -eq 0 ]
