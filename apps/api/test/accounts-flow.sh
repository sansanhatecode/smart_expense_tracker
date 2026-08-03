#!/usr/bin/env bash
# Kiểm thử nguồn tiền. Trọng tâm:
#   - import tự tạo account đúng loại, không hỏi người dùng
#   - import lại cùng ngân hàng KHÔNG đẻ ra account thứ hai, và không ghi đè
#     tên người dùng đã đặt
#   - sao kê thẻ và sao kê ngân hàng là hai nguồn tiền khác nhau
#   - khoản tiêu bằng thẻ chỉ được đếm MỘT lần dù import cả hai file
#   - dư nợ thẻ = số dư đầu kỳ + đã tiêu − đã trả
#   - xoá nguồn đang có giao dịch bị chặn, không SetNull âm thầm
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
PASS="matkhau12345"
EMAIL="acc-$RANDOM@example.com"
OTHER="acc-other-$RANDOM@example.com"
TMP=$(mktemp -d)
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }
jq_() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(eval('j$1')??'')}catch{console.log('')}})"; }

# CẢNH BÁO khi thêm node -e vào file này: KHÔNG để dấu phẩy bên trong { }.
# Bash coi `{a,b}` là brace expansion và tách đoạn script thành nhiều từ, kể cả
# khi nó nằm trong nháy kép — hậu quả là `check` nhận sai vị trí tham số và BÁO
# PASS GIẢ, không phải báo lỗi. Đây là cách né: một hàm nhận field làm tham số.
sumField() { # sumField <response> <mảng> <field> → tổng field đó trong mảng
  body "$1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['$2'].reduce((a,x)=>a+x['$3'],0)))"
}

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
# import <token> <file> → id batch đã confirm
import() {
  local t=$1 f=$2
  local batch
  batch=$(curl -s -X POST "$API/api/imports" -H "Authorization: Bearer $t" -F "file=@$f" | jq_ '.batchId')
  req POST "/api/imports/$batch/confirm" "$t" > /dev/null
  echo "$batch"
}
# accountField <token> <kind> <field> — tra một field của nguồn tiền theo loại.
# Tra theo `kind` chứ không theo thứ tự mảng: thứ tự phụ thuộc orderBy của API,
# và một test hỏng vì đổi orderBy là test nói dối.
accountField() {
  req GET /api/accounts "$1" | sed '$d' | \
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const a=j.find(x=>x.kind==='$2');console.log(a?(a['$3']??''):'')})"
}

TOKEN=$(register "$EMAIL"); OTHER_TOKEN=$(register "$OTHER")

# ─── Fixture: sao kê THẺ TÍN DỤNG (có cột MCC, ghi có mang dấu âm) ───
cat > "$TMP/the.csv" <<'CSV'
Ngày giao dịch,Diễn giải,MCC,Ghi nợ,Ghi có
13/07/2026,Mua Hàng / WCM_WINMART LE DUAN,5411,184.983,0
15/07/2026,Mua Hàng / Shopee,5262,450.200,0
29/07/2026,Thanh toan sao ke the tin dung 07/2026,6012,0,-635.183
CSV

# ─── Fixture: sao kê TÀI KHOẢN THANH TOÁN, có đúng khoản trả nợ ở trên ───
cat > "$TMP/ngan-hang.csv" <<'CSV'
Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư
10/07/2026,LUONG THANG 07,,20.000.000,20.000.000
20/07/2026,HIGHLANDS COFFEE THAO DIEN,85.000,,19.915.000
25/07/2026,NAP TIEN VI MOMO,500.000,,19.415.000
29/07/2026,Thanh toan sao ke the tin dung thang 07,635.183,,18.779.817
CSV

echo "── 1. Nguồn tiền được tạo tự động khi import ──────────────────────────────"
R=$(req GET /api/accounts "$TOKEN")
check "GET /api/accounts → 200" "$(code "$R")" "200"
check "user mới chưa có nguồn tiền nào" "$(body "$R" | jq_ '.length')" "0"
check "cần đăng nhập" "$(code "$(curl -s -w '\n%{http_code}' "$API/api/accounts")")" "401"

import "$TOKEN" "$TMP/the.csv" > /dev/null
R=$(req GET /api/accounts "$TOKEN")
check "import sao kê thẻ tạo 1 nguồn tiền" "$(body "$R" | jq_ '.length')" "1"
check "nhận đúng loại: thẻ tín dụng" "$(accountField "$TOKEN" credit_card kind)" "credit_card"
check "tên mặc định đọc được" "$(accountField "$TOKEN" credit_card name)" "Thẻ tín dụng"
check "đếm đúng số giao dịch" "$(accountField "$TOKEN" credit_card transactionCount)" "3"

import "$TOKEN" "$TMP/ngan-hang.csv" > /dev/null
R=$(req GET /api/accounts "$TOKEN")
check "sao kê ngân hàng là nguồn tiền THỨ HAI" "$(body "$R" | jq_ '.length')" "2"
check "nhận đúng loại: tài khoản ngân hàng" "$(accountField "$TOKEN" bank kind)" "bank"

echo "── 2. Import lại không đẻ ra nguồn tiền trùng ─────────────────────────────"
# Cùng ngân hàng, kỳ sau. Nếu khoá map dùng tên file thì đây sẽ thành account thứ ba.
cat > "$TMP/ngan-hang-thang-8.csv" <<'CSV'
Ngày giao dịch,Nội dung,Số tiền ghi nợ,Số tiền ghi có,Số dư
05/08/2026,TIEN DIEN EVN,850.000,,17.929.817
CSV
import "$TOKEN" "$TMP/ngan-hang-thang-8.csv" > /dev/null
check "file tháng sau vào đúng nguồn cũ" "$(body "$(req GET /api/accounts "$TOKEN")" | jq_ '.length')" "2"
check "giao dịch cộng dồn vào nguồn đó" "$(accountField "$TOKEN" bank transactionCount)" "5"

CARD_ID=$(accountField "$TOKEN" credit_card id)
BANK_ID=$(accountField "$TOKEN" bank id)

echo "── 3. Chi tiêu bằng thẻ chỉ được đếm MỘT lần ──────────────────────────────"
# Đây là lỗi mà cả tính năng này sinh ra để sửa: trước đây dòng trả nợ 635.183đ
# trên sao kê ngân hàng được tính như một khoản chi bình thường, cộng chồng lên
# chính số tiền đó đã nằm ở các dòng mua hàng trong sao kê thẻ.
R=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "GET /api/stats/summary → 200" "$(code "$R")" "200"
# 184.983 + 450.200 (thẻ) + 85.000 (Highlands) = 720.183
check "chi tiêu thật = 720.183, không phải 1.355.366" "$(body "$R" | jq_ '.expense')" "720183"
check "thu nhập thật = 20tr, không tính ghi có trên thẻ" "$(body "$R" | jq_ '.income')" "20000000"
# 85.000 + 635.183 (trả nợ thẻ). Nạp ví KHÔNG tính: tiền chỉ đổi chỗ sang ví.
check "dòng tiền ra = 720.183" "$(body "$R" | jq_ '.cashOutflow')" "720183"
# 2 vế trả nợ thẻ + 1 nạp ví
check "3 khoản nội bộ đã bị loại" "$(body "$R" | jq_ '.internal.count')" "3"

echo "── 4. Lọc thống kê theo nguồn tiền ────────────────────────────────────────"
R=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31&accountId=$CARD_ID" "$TOKEN")
check "chi tiêu riêng của thẻ" "$(body "$R" | jq_ '.expense')" "635183"
# Mua bằng thẻ chưa làm tiền rời đi đâu cả
check "thẻ không có dòng tiền ra" "$(body "$R" | jq_ '.cashOutflow')" "0"
R=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31&accountId=$BANK_ID" "$TOKEN")
check "chi tiêu riêng của tài khoản" "$(body "$R" | jq_ '.expense')" "85000"
R=$(req GET "/api/stats/by-account?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "GET /api/stats/by-account → 200" "$(code "$R")" "200"
check "tách được 2 nguồn tiền" "$(body "$R" | jq_ '.expense.length')" "2"
check "nguồn chi nhiều nhất đứng đầu" "$(body "$R" | jq_ '.expense[0].total')" "635183"
check "tổng by-account khớp chi tiêu thật" "$(sumField "$R" expense total)" "720183"

echo "── 5. Danh sách khoản nội bộ đã loại ──────────────────────────────────────"
R=$(req GET "/api/transactions?internal=only&from=2026-07-01&to=2026-07-31" "$TOKEN")
check "lọc internal=only → 200" "$(code "$R")" "200"
check "đúng 3 khoản" "$(body "$R" | jq_ '.total')" "3"
R=$(req GET "/api/transactions?internal=exclude&from=2026-07-01&to=2026-07-31" "$TOKEN")
check "internal=exclude bỏ đúng 3 khoản đó" "$(body "$R" | jq_ '.total')" "4"
R=$(req GET "/api/transactions?accountId=$CARD_ID" "$TOKEN")
check "lọc theo nguồn tiền" "$(body "$R" | jq_ '.total')" "3"
check "giao dịch mang tên nguồn tiền" "$(body "$R" | jq_ '.items[0].account.name')" "Thẻ tín dụng"

echo "── 6. Sửa nhận diện sai bằng tay ──────────────────────────────────────────"
# Van an toàn: người dùng trả hộ thẻ của người khác thì đó là chi tiêu thật.
TX=$(body "$(req GET "/api/transactions?internal=only&accountId=$BANK_ID" "$TOKEN")" | jq_ '.items[0].id')
R=$(req PATCH "/api/transactions/$TX" "$TOKEN" '{"internalKind":null}')
check "bỏ đánh dấu nội bộ → 200" "$(code "$R")" "200"
check "giao dịch không còn là nội bộ" "$(body "$R" | jq_ '.internalKind')" ""
R=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "chi tiêu thật tăng đúng số đó" "$(body "$R" | jq_ '.expense')" "1355366"
# Trả lại như cũ cho các bước sau
req PATCH "/api/transactions/$TX" "$TOKEN" '{"internalKind":"card_payment"}' > /dev/null
check "đánh dấu lại được" \
  "$(body "$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN")" | jq_ '.expense')" "720183"

echo "── 7. Dư nợ thẻ tín dụng ──────────────────────────────────────────────────"
# 184.983 + 450.200 đã tiêu, 635.183 đã trả → còn 0
check "dư nợ = đã tiêu − đã trả" "$(accountField "$TOKEN" credit_card outstanding)" "0"
check "tài khoản ngân hàng không có dư nợ" "$(accountField "$TOKEN" bank outstanding)" ""
R=$(req PATCH "/api/accounts/$CARD_ID" "$TOKEN" '{"openingBalance":2000000}')
check "đặt số dư đầu kỳ → 200" "$(code "$R")" "200"
check "dư nợ cộng cả số dư đầu kỳ" "$(body "$R" | jq_ '.outstanding')" "2000000"

echo "── 8. Kỳ sao kê và ngày đến hạn ───────────────────────────────────────────"
check "chưa khai ngày chốt thì không bịa ra kỳ" "$(accountField "$TOKEN" credit_card currentPeriod)" ""
R=$(req PATCH "/api/accounts/$CARD_ID" "$TOKEN" '{"statementDay":5,"dueDay":20,"name":"VCB Visa"}')
check "khai ngày chốt → 200" "$(code "$R")" "200"
check "đổi tên được" "$(body "$R" | jq_ '.name')" "VCB Visa"
check "kỳ sao kê dài đúng một tháng" \
  "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).currentPeriod;console.log(p.to.slice(-2))})")" "05"
R=$(req PATCH "/api/accounts/$CARD_ID" "$TOKEN" '{"statementDay":32}')
check "ngày chốt ngoài 1-31 → 400" "$(code "$R")" "400"
R=$(req PATCH "/api/accounts/$CARD_ID" "$TOKEN" '{"kind":"bank"}')
check "đổi loại nguồn bị bỏ qua, không đổi được" "$(accountField "$TOKEN" credit_card kind)" "credit_card"

echo "── 9. Import lại sau khi đổi tên KHÔNG ghi đè tên người dùng ──────────────"
import "$TOKEN" "$TMP/the.csv" > /dev/null
check "tên do người dùng đặt được giữ" "$(accountField "$TOKEN" credit_card name)" "VCB Visa"
check "vẫn chỉ có 2 nguồn tiền" "$(body "$(req GET /api/accounts "$TOKEN")" | jq_ '.length')" "2"

echo "── 10. Cô lập dữ liệu giữa user (IDOR) ────────────────────────────────────"
check "user B không thấy nguồn tiền của A" "$(body "$(req GET /api/accounts "$OTHER_TOKEN")" | jq_ '.length')" "0"
R=$(req PATCH "/api/accounts/$CARD_ID" "$OTHER_TOKEN" '{"name":"Cướp"}')
check "user B sửa nguồn tiền của A → 404" "$(code "$R")" "404"
R=$(req DELETE "/api/accounts/$CARD_ID" "$OTHER_TOKEN")
check "user B xoá nguồn tiền của A → 404" "$(code "$R")" "404"
check "tên của A không đổi" "$(accountField "$TOKEN" credit_card name)" "VCB Visa"

echo "── 11. Xoá nguồn tiền đang có giao dịch bị chặn ───────────────────────────"
R=$(req DELETE "/api/accounts/$CARD_ID" "$TOKEN")
# SetNull sẽ âm thầm biến mọi giao dịch thành "không rõ nguồn" — chặn và nói rõ.
check "xoá nguồn đang dùng → 409" "$(code "$R")" "409"
check "message nói rõ số giao dịch" "$(body "$R" | grep -c 'giao dịch')" "1"
check "nguồn tiền vẫn còn" "$(body "$(req GET /api/accounts "$TOKEN")" | jq_ '.length')" "2"

rm -rf "$TMP"
echo
printf '══ %d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
