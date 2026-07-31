#!/usr/bin/env bash
# Kiểm thử luồng import đầu-cuối. Trọng tâm:
#   - import lại file chồng kỳ KHÔNG sinh bản trùng
#   - hai giao dịch giống hệt nhau trong file đều được giữ
#   - Transaction không bao giờ chứa dòng chưa confirm (ADR 9.6)
#   - rollback trả DB về đúng trạng thái trước đó
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
PASS="matkhau12345"
EMAIL="imp-$RANDOM@example.com"
OTHER="imp-other-$RANDOM@example.com"
TMP=$(mktemp -d)
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
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
upload() { # upload <token> <file> [bankProfile]
  local t=$1 f=$2 prof=${3:-}
  if [ -n "$prof" ]; then
    curl -s -w '\n%{http_code}' -X POST "$API/api/imports" -H "Authorization: Bearer $t" \
      -F "file=@$f" -F "bankProfile=$prof"
  else
    curl -s -w '\n%{http_code}' -X POST "$API/api/imports" -H "Authorization: Bearer $t" -F "file=@$f"
  fi
}
txTotal() { req GET /api/transactions "$1" | sed '$d' | jq_ '.total'; }

TOKEN=$(register "$EMAIL"); OTHER_TOKEN=$(register "$OTHER")

# ─── Fixture: kỳ 1 (01-20/07), có HAI ly cà phê giống hệt nhau ───
cat > "$TMP/ky1.csv" <<'CSV'
Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư
15/07/2026,HIGHLANDS COFFEE THAO DIEN,50.000,,1.950.000
15/07/2026,HIGHLANDS COFFEE THAO DIEN,50.000,,1.900.000
16/07/2026,GRAB*RIDE,120.000,,1.780.000
18/07/2026,LUONG THANG 7,,20.000.000,21.780.000
20/07/2026,TIEN DIEN EVN,850.000,,20.930.000
,TỔNG CỘNG,1.070.000,20.000.000,
CSV

# ─── Fixture: kỳ 2 (01-31/07) — CHỒNG LÊN kỳ 1, thêm 2 dòng mới ───
cat > "$TMP/ky2.csv" <<'CSV'
Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư
15/07/2026,HIGHLANDS COFFEE THAO DIEN,50.000,,1.950.000
15/07/2026,HIGHLANDS COFFEE THAO DIEN,50.000,,1.900.000
16/07/2026,GRAB*RIDE,120.000,,1.780.000
18/07/2026,LUONG THANG 7,,20.000.000,21.780.000
20/07/2026,TIEN DIEN EVN,850.000,,20.930.000
25/07/2026,SHOPEE,350.000,,20.580.000
28/07/2026,GRAB*RIDE,95.000,,20.485.000
CSV

echo "── 1. Upload → preview (chưa ghi vào Transaction) ─────────────────────────"
R=$(upload "$TOKEN" "$TMP/ky1.csv")
check "POST /api/imports → 201" "$(code "$R")" "201"
B1=$(body "$R" | jq_ '.batchId')
check "status = pending" "$(body "$R" | jq_ '.status')" "pending"
check "parse được 5 dòng" "$(body "$R" | jq_ '.counts.total')" "5"
check "sẽ thêm 5 dòng" "$(body "$R" | jq_ '.counts.willInsert')" "5"
check "0 dòng trùng (DB đang rỗng)" "$(body "$R" | jq_ '.counts.duplicateInDb')" "0"
check "dòng TỔNG CỘNG bị bỏ, có báo lý do" "$(body "$R" | jq_ '.counts.skipped')" "1"
check "  lý do được trả về" "$(body "$R" | jq_ '.skippedRows[0].reason' | grep -c 'Thiếu ngày')" "1"
check "ADR 9.6: Transaction vẫn RỖNG khi chưa confirm" "$(txTotal "$TOKEN")" "0"

echo "── 2. Auto-categorize từ rule seed ────────────────────────────────────────"
check "GRAB → có danh mục" \
  "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.rows.find(x=>x.description.includes('GRAB'));console.log(r.category?r.category.name:'null')})")" \
  "Di chuyển"
check "LUONG → danh mục thu" \
  "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.rows.find(x=>x.description.includes('LUONG'));console.log(r.category?r.category.name:'null')})")" \
  "Lương"
check "EVN → Hoá đơn & Tiện ích" \
  "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const r=j.rows.find(x=>x.description.includes('EVN'));console.log(r.category?r.category.name:'null')})")" \
  "Hoá đơn & Tiện ích"

echo "── 3. Sửa danh mục ở preview rồi confirm ──────────────────────────────────"
ROW=$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.rows.find(x=>!x.category)?.id ?? j.rows[0].id)})")
CAT=$(req GET /api/categories "$TOKEN" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.type==='expense').id)})")
R2=$(req PATCH "/api/imports/$B1/rows/$ROW" "$TOKEN" "{\"categoryId\":\"$CAT\"}")
check "gán danh mục cho 1 dòng → 200" "$(code "$R2")" "200"
check "preview đọc lại vẫn còn thay đổi (state bền)" \
  "$(req GET "/api/imports/$B1" "$TOKEN" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.rows.filter(x=>x.category).length)})")" \
  "5"
R2=$(req POST "/api/imports/$B1/confirm" "$TOKEN")
check "confirm → 201" "$(code "$R2")" "201"
check "thêm đúng 5 giao dịch" "$(body "$R2" | jq_ '.inserted')" "5"
check "Transaction giờ có 5 dòng" "$(txTotal "$TOKEN")" "5"

echo "── 4. HAI ly cà phê giống hệt nhau đều được giữ (ADR 9.8) ─────────────────"
check "cả hai dòng HIGHLANDS đều vào DB" \
  "$(req GET "/api/transactions?q=HIGHLANDS" "$TOKEN" | sed '$d' | jq_ '.total')" "2"

echo "── 5. Import LẠI file chồng kỳ — không được sinh bản trùng ────────────────"
R=$(upload "$TOKEN" "$TMP/ky2.csv")
check "upload kỳ 2 → 201" "$(code "$R")" "201"
B2=$(body "$R" | jq_ '.batchId')
check "parse được 7 dòng" "$(body "$R" | jq_ '.counts.total')" "7"
check "nhận ra 5 dòng đã có trong DB" "$(body "$R" | jq_ '.counts.duplicateInDb')" "5"
check "chỉ còn 2 dòng sẽ thêm" "$(body "$R" | jq_ '.counts.willInsert')" "2"
check "dòng trùng mặc định BỎ TICK" \
  "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.rows.filter(x=>x.duplicate==='in_db'&&x.selected===false).length)})")" \
  "5"
R2=$(req POST "/api/imports/$B2/confirm" "$TOKEN")
check "confirm kỳ 2 → chỉ thêm 2" "$(body "$R2" | jq_ '.inserted')" "2"
check "tổng vẫn là 7, KHÔNG phải 12" "$(txTotal "$TOKEN")" "7"

echo "── 6. Batch đã confirm thì không sửa được nữa ─────────────────────────────"
check "sửa dòng của batch đã confirm → 409" \
  "$(code "$(req PATCH "/api/imports/$B2/rows/$ROW" "$TOKEN" '{"selected":false}')")" "409"
check "confirm lại → 409" "$(code "$(req POST "/api/imports/$B2/confirm" "$TOKEN")")" "409"

echo "── 7. Rollback ────────────────────────────────────────────────────────────"
R2=$(req DELETE "/api/imports/$B2" "$TOKEN")
check "rollback batch đã confirm → 200" "$(code "$R2")" "200"
check "xoá đúng 2 giao dịch của batch đó" "$(body "$R2" | jq_ '.removed')" "2"
check "5 giao dịch của batch 1 KHÔNG bị ảnh hưởng" "$(txTotal "$TOKEN")" "5"
check "rollback lần hai → 409" "$(code "$(req DELETE "/api/imports/$B2" "$TOKEN")")" "409"
check "batch được đánh dấu rolled_back, vẫn còn trong lịch sử" \
  "$(req GET /api/imports "$TOKEN" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(b=>b.status==='rolled_back')?'yes':'no')})")" \
  "yes"

echo "── 8. Rollback batch pending thì xoá luôn ─────────────────────────────────"
R=$(upload "$TOKEN" "$TMP/ky1.csv")
B3=$(body "$R" | jq_ '.batchId')
check "rollback batch pending → 200" "$(code "$(req DELETE "/api/imports/$B3" "$TOKEN")")" "200"
check "batch pending bị xoá khỏi lịch sử" \
  "$(code "$(req GET "/api/imports/$B3" "$TOKEN")")" "404"
check "Transaction không đổi" "$(txTotal "$TOKEN")" "5"

echo "── 9. Validate file & cô lập user ─────────────────────────────────────────"
echo "khong phai csv" > "$TMP/rac.txt"
check "file .txt → 415" "$(code "$(upload "$TOKEN" "$TMP/rac.txt")")" "415"
printf 'a,b,c\n1,2,3\n' > "$TMP/khong-header.csv"
check "csv không có header nhận ra được → 400" "$(code "$(upload "$TOKEN" "$TMP/khong-header.csv")")" "400"
: > "$TMP/rong.csv"
check "file rỗng → 400" "$(code "$(upload "$TOKEN" "$TMP/rong.csv")")" "400"
check "user khác xem preview của mình → 404" "$(code "$(req GET "/api/imports/$B1" "$OTHER_TOKEN")")" "404"
check "user khác rollback batch của mình → 404" "$(code "$(req DELETE "/api/imports/$B1" "$OTHER_TOKEN")")" "404"
check "user khác không thấy giao dịch nào" "$(txTotal "$OTHER_TOKEN")" "0"

echo "── 10. Import file .xlsx thật ─────────────────────────────────────────────"
XLSX="$(dirname "$0")/../src/imports/__fixtures__/sao-ke-mau.xlsx"
if [ -f "$XLSX" ]; then
  R=$(upload "$OTHER_TOKEN" "$XLSX")
  check "upload .xlsx → 201" "$(code "$R")" "201"
  check "parse được 5 dòng từ .xlsx" "$(body "$R" | jq_ '.counts.total')" "5"
  B4=$(body "$R" | jq_ '.batchId')
  check "confirm .xlsx → thêm 5" "$(body "$(req POST "/api/imports/$B4/confirm" "$OTHER_TOKEN")" | jq_ '.inserted')" "5"
  echo "── 11. Dedupe xuyên giữa nhập tay và import (ADR 9.8) ────────────────────"
  # Chiều QUAN TRỌNG: nhập tay trước, rồi import file chứa đúng giao dịch đó.
  # Đây là chiều gây trùng ngoài ý muốn, vì import là đường tự động/hàng loạt.
  R=$(req POST /api/transactions "$OTHER_TOKEN" \
    '{"amount":77000,"type":"expense","date":"2026-08-05","description":"BUN BO CO BA","categoryId":null}')
  check "nhập tay một giao dịch mới → 201" "$(code "$R")" "201"

  cat > "$TMP/thang8.csv" <<'CSV'
Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư
05/08/2026,BUN BO CO BA,77.000,,1.000.000
06/08/2026,CA PHE MOI,30.000,,970.000
CSV
  R=$(upload "$OTHER_TOKEN" "$TMP/thang8.csv")
  check "import file chứa giao dịch đã nhập tay → nhận ra trùng" \
    "$(body "$R" | jq_ '.counts.duplicateInDb')" "1"
  check "  chỉ thêm dòng còn lại" "$(body "$R" | jq_ '.counts.willInsert')" "1"

  # Chiều ngược lại KHÔNG chặn, và đó là hành vi đúng: chỉ người dùng biết mình
  # uống một hay hai ly cà phê. Nhập tay là ý định tường minh nên không được chặn.
  R=$(req POST /api/transactions "$OTHER_TOKEN" \
    '{"amount":77000,"type":"expense","date":"2026-08-05","description":"BUN BO CO BA","categoryId":null}')
  check "nhập tay bản thứ hai giống hệt → 201 (không chặn ý định tường minh)" \
    "$(code "$R")" "201"
  check "  DB có đúng 2 bản, không phải 1" \
    "$(req GET "/api/transactions?q=BUN%20BO" "$OTHER_TOKEN" | sed '$d' | jq_ '.total')" "2"
else
  echo "  … bỏ qua, không tìm thấy fixture .xlsx"
fi

echo
echo "══ $PASSED passed, $FAILED failed ══"
rm -rf "$TMP"
[ "$FAILED" -eq 0 ]
