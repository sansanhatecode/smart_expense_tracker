#!/usr/bin/env bash
# Kiểm thử stats + budget với dataset biết trước kết quả.
#
# Trọng tâm:
#   - số liệu tổng hợp khớp với dữ liệu đã seed (tính bằng tay ở dưới)
#   - ranh giới tháng đúng (hồi quy ADR 9.5)
#   - giao dịch chưa phân loại vẫn được tính vào tổng, không bị bỏ
#   - ngưỡng cảnh báo ngân sách khớp với định nghĩa trong packages/shared
set -uo pipefail

API=${API_BASE:-http://localhost:3001}
PASS="matkhau12345"
EMAIL="stat-$RANDOM@example.com"
OTHER="stat-other-$RANDOM@example.com"
PASSED=0; FAILED=0

check() {
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }
jq_() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(eval('j$1')??'')}catch(e){console.log('')}})"; }

# CẢNH BÁO khi thêm node -e vào file này: KHÔNG để dấu phẩy bên trong { }.
#
# Bash coi `{a,b}` là brace expansion và tách đoạn script thành nhiều từ, kể cả
# khi nó nằm trong nháy kép. Hậu quả không phải là test đỏ mà là `check` nhận
# sai vị trí tham số rồi BÁO PASS GIẢ — ba check dưới đây đã im lặng không kiểm
# gì suốt một thời gian vì lý do đó. Ba helper sau né bằng cách không dùng ngoặc
# nhọn nào cả.
sumField() { # sumField <mảng> <field> — đọc JSON từ stdin
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['$1'].reduce((a,x)=>a+x['$2'],0)))"
}
sumShare() { # tổng share, làm tròn 3 chữ số
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(Math.round(JSON.parse(s).expense.reduce((a,x)=>a+x.share,0)*1000)/1000))"
}
isSortedDesc() { # 'yes' nếu mảng expense đã giảm dần theo total
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).expense.map(x=>x.total))===JSON.stringify(JSON.parse(s).expense.map(x=>x.total).sort((a,b)=>b-a))?'yes':'no'))"
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
mktx() { # mktx <token> <amount> <date> <desc> <catId|null> <type>
  local catJson='null'; [ "$5" != "null" ] && catJson="\"$5\""
  req POST /api/transactions "$1" \
    "{\"amount\":$2,\"type\":\"$6\",\"date\":\"$3\",\"description\":\"$4\",\"categoryId\":$catJson}" >/dev/null
}

TOKEN=$(register "$EMAIL"); OTHER_TOKEN=$(register "$OTHER")
CATS=$(req GET /api/categories "$TOKEN" | sed '$d')
AN_UONG=$(echo "$CATS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.name==='Ăn uống').id)})")
DI_CHUYEN=$(echo "$CATS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.name==='Di chuyển').id)})")
LUONG=$(echo "$CATS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(c=>c.name==='Lương').id)})")

# ─── Dataset tháng 7/2026, số liệu tính tay ───
#   Ăn uống      : 500.000 + 300.000            = 800.000
#   Di chuyển    : 200.000                      = 200.000
#   chưa phân loại: 100.000                     = 100.000
#   ─────────────────────────────────────────────────────
#   Tổng chi                                    = 1.100.000
#   Tổng thu (Lương)                            = 20.000.000
#   Số dư                                       = 18.900.000
#   Số giao dịch                                = 5
mktx "$TOKEN" 500000  2026-07-05 "An trua"      "$AN_UONG"   expense
mktx "$TOKEN" 300000  2026-07-15 "An toi"       "$AN_UONG"   expense
mktx "$TOKEN" 200000  2026-07-20 "Grab"         "$DI_CHUYEN" expense
mktx "$TOKEN" 100000  2026-07-25 "Chua ro"      null         expense
mktx "$TOKEN" 20000000 2026-07-10 "Luong"       "$LUONG"     income
# ─── Tháng 6/2026 (kỳ trước): chi 400.000, thu 15.000.000 ───
mktx "$TOKEN" 400000  2026-06-10 "Thang truoc"  "$AN_UONG"   expense
mktx "$TOKEN" 15000000 2026-06-05 "Luong T6"    "$LUONG"     income
# ─── Ranh giới: 30/06 và 01/08 phải KHÔNG thuộc tháng 7 ───
mktx "$TOKEN" 11000   2026-06-30 "Cuoi thang 6" null         expense
mktx "$TOKEN" 12000   2026-08-01 "Dau thang 8"  null         expense

echo "── 1. Summary tháng 7 ─────────────────────────────────────────────────────"
S=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "GET /api/stats/summary → 200" "$(code "$S")" "200"
check "tổng chi = 1.100.000" "$(body "$S" | jq_ '.expense')" "1100000"
check "tổng thu = 20.000.000" "$(body "$S" | jq_ '.income')" "20000000"
check "số dư = 18.900.000" "$(body "$S" | jq_ '.net')" "18900000"
check "số giao dịch = 5" "$(body "$S" | jq_ '.transactionCount')" "5"

echo "── 2. Ranh giới tháng (hồi quy ADR 9.5) ───────────────────────────────────"
check "giao dịch 30/06 KHÔNG tính vào tháng 7" \
  "$(body "$S" | jq_ '.expense')" "1100000"
# Kỳ là đúng một tháng lịch → kỳ trước là tháng lịch liền trước, không phải
# "31 ngày trước đó" (sẽ ra 31/05 và lấn sang tháng 5)
check "tháng lịch → kỳ trước là tháng 6 trọn vẹn: 01/06" "$(body "$S" | jq_ '.previous.from')" "2026-06-01"
check "kỳ trước đến 30/06" "$(body "$S" | jq_ '.previous.to')" "2026-06-30"
check "chi kỳ trước = 400.000 + 11.000 = 411.000" "$(body "$S" | jq_ '.previous.expense')" "411000"
check "thu kỳ trước = 15.000.000" "$(body "$S" | jq_ '.previous.income')" "15000000"
S8=$(req GET "/api/stats/summary?from=2026-08-01&to=2026-08-31" "$TOKEN")
check "giao dịch 01/08 thuộc tháng 8" "$(body "$S8" | jq_ '.expense')" "12000"

echo "── 3. Kỳ trước cùng ĐỘ DÀI, không phải 'tháng trước' ──────────────────────"
S10=$(req GET "/api/stats/summary?from=2026-07-21&to=2026-07-30" "$TOKEN")
check "kỳ 10 ngày → kỳ trước cũng 10 ngày, bắt đầu 11/07" \
  "$(body "$S10" | jq_ '.previous.from')" "2026-07-11"
check "  và kết thúc 20/07" "$(body "$S10" | jq_ '.previous.to')" "2026-07-20"

echo "── 4. Breakdown theo danh mục ─────────────────────────────────────────────"
C=$(req GET "/api/stats/by-category?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "GET /api/stats/by-category → 200" "$(code "$C")" "200"
check "Ăn uống = 800.000 (gộp 2 giao dịch)" \
  "$(body "$C" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.expense.find(x=>x.name==='Ăn uống').total)})")" "800000"
check "  đếm đúng 2 giao dịch" \
  "$(body "$C" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.expense.find(x=>x.name==='Ăn uống').transactionCount)})")" "2"
check "giao dịch chưa phân loại VẪN hiện, không bị bỏ" \
  "$(body "$C" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.expense.find(x=>x.name==='Chưa phân loại')?.total ?? 'thiếu')})")" "100000"
check "tổng breakdown chi khớp với summary (1.100.000)" \
  "$(body "$C" | sumField expense total)" "1100000"
check "share cộng lại = 1" "$(body "$C" | sumShare)" "1"
check "sắp xếp giảm dần theo tổng" "$(body "$C" | isSortedDesc)" "yes"

echo "── 5. Trend ───────────────────────────────────────────────────────────────"
T=$(req GET "/api/stats/trend?from=2026-06-01&to=2026-08-31&granularity=month" "$TOKEN")
check "GET /api/stats/trend → 200" "$(code "$T")" "200"
check "3 tháng → 3 điểm" "$(body "$T" | jq_ '.points.length')" "3"
check "điểm đầu là 2026-06" "$(body "$T" | jq_ '.points[0].period')" "2026-06"
check "tháng 7 chi = 1.100.000" \
  "$(body "$T" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.points.find(p=>p.period==='2026-07').expense)})")" "1100000"
T2=$(req GET "/api/stats/trend?from=2026-07-01&to=2026-07-31&granularity=day" "$TOKEN")
check "31 ngày → 31 điểm (kỳ trống được điền 0)" "$(body "$T2" | jq_ '.points.length')" "31"
check "ngày không có giao dịch = 0, không bị thiếu điểm" \
  "$(body "$T2" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.points.find(p=>p.period==='2026-07-02').expense)})")" "0"

echo "── 6. Budget ──────────────────────────────────────────────────────────────"
B=$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$AN_UONG\",\"month\":\"2026-07\",\"limitAmount\":1000000}")
check "đặt ngân sách → 200" "$(code "$B")" "200"
check "spent tính từ DB = 800.000" "$(body "$B" | jq_ '.spent')" "800000"
check "còn lại = 200.000" "$(body "$B" | jq_ '.remaining')" "200000"
check "800k/1tr = 80% → status warning" "$(body "$B" | jq_ '.status')" "warning"
B=$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$AN_UONG\",\"month\":\"2026-07\",\"limitAmount\":2000000}")
check "đặt lại cùng danh mục+kỳ → upsert, không 409" "$(code "$B")" "200"
check "800k/2tr = 40% → status ok" "$(body "$B" | jq_ '.status')" "ok"
B=$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$AN_UONG\",\"month\":\"2026-07\",\"limitAmount\":500000}")
check "800k/500k → status over" "$(body "$B" | jq_ '.status')" "over"
check "remaining âm, KHÔNG kẹp về 0" "$(body "$B" | jq_ '.remaining')" "-300000"
check "ngân sách cho danh mục THU → 400" \
  "$(code "$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$LUONG\",\"month\":\"2026-07\",\"limitAmount\":1000000}")")" "400"
check "kỳ sai định dạng → 400" \
  "$(code "$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$AN_UONG\",\"month\":\"2026-13\",\"limitAmount\":1000}")")" "400"
check "limit = 0 → 400" \
  "$(code "$(req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$AN_UONG\",\"month\":\"2026-07\",\"limitAmount\":0}")")" "400"

echo "── 7. Cảnh báo ────────────────────────────────────────────────────────────"
req POST /api/budgets "$TOKEN" "{\"categoryId\":\"$DI_CHUYEN\",\"month\":\"2026-07\",\"limitAmount\":10000000}" >/dev/null
A=$(req GET "/api/budgets/alerts?month=2026-07" "$TOKEN")
check "GET /api/budgets/alerts → 200" "$(code "$A")" "200"
check "chỉ trả ngân sách đang warning/over (1 cái)" "$(body "$A" | jq_ '.length')" "1"
check "  đúng danh mục đang vượt" "$(body "$A" | jq_ '[0].categoryName')" "Ăn uống"
check "  status = over" "$(body "$A" | jq_ '[0].status')" "over"
check "list trả cả 2 ngân sách" \
  "$(req GET "/api/budgets?month=2026-07" "$TOKEN" | sed '$d' | jq_ '.length')" "2"

echo "── 8. Khoản nội bộ không chạm vào thống kê lẫn ngân sách ──────────────────"
# Một khoản chuyển tiền nội bộ 5tr rơi vào danh mục Ăn uống. Nếu nó được tính,
# ngân sách 500k của Ăn uống sẽ hiện 5,8tr đã chi trong khi người dùng chưa ăn
# thêm gì — đó là điều đã xảy ra trước khi có internalKind.
INT=$(req POST /api/transactions "$TOKEN" \
  "{\"amount\":5000000,\"type\":\"expense\",\"date\":\"2026-07-18\",\"description\":\"Chuyen noi bo\",\"categoryId\":\"$AN_UONG\",\"internalKind\":\"self_transfer\"}")
check "tạo giao dịch nội bộ → 201" "$(code "$INT")" "201"
check "  DTO mang internalKind" "$(body "$INT" | jq_ '.internalKind')" "self_transfer"
S=$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "tổng chi KHÔNG đổi, vẫn 1.100.000" "$(body "$S" | jq_ '.expense')" "1100000"
check "nó được đếm riêng ở internal" "$(body "$S" | jq_ '.internal.count')" "1"
check "  kèm số tiền" "$(body "$S" | jq_ '.internal.total')" "5000000"
# Nhập tay không gắn nguồn → coi như tiền mặt, vẫn là tiền rời túi.
check "dòng tiền ra = 1.100.000, không gồm khoản nội bộ" "$(body "$S" | jq_ '.cashOutflow')" "1100000"
C=$(req GET "/api/stats/by-category?from=2026-07-01&to=2026-07-31" "$TOKEN")
check "breakdown: Ăn uống vẫn 800.000" \
  "$(body "$C" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.expense.find(x=>x.name==='Ăn uống').total)})")" "800000"
check "ngân sách Ăn uống vẫn tính 800.000" \
  "$(req GET "/api/budgets?month=2026-07" "$TOKEN" | sed '$d' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.find(b=>b.category.name==='Ăn uống').spent)})")" "800000"
check "bỏ đánh dấu thì nó được tính lại" \
  "$(code "$(req PATCH "/api/transactions/$(body "$INT" | jq_ '.id')" "$TOKEN" '{"internalKind":null}')")" "200"
check "  tổng chi thành 6.100.000" \
  "$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$TOKEN" | sed '$d' | jq_ '.expense')" "6100000"
# Trả lại như cũ cho phần sau
req PATCH "/api/transactions/$(body "$INT" | jq_ '.id')" "$TOKEN" '{"internalKind":"self_transfer"}' >/dev/null

echo "── 9. Cô lập dữ liệu giữa user ────────────────────────────────────────────"
check "user khác: summary = 0" \
  "$(req GET "/api/stats/summary?from=2026-07-01&to=2026-07-31" "$OTHER_TOKEN" | sed '$d' | jq_ '.expense')" "0"
check "user khác: breakdown rỗng" \
  "$(req GET "/api/stats/by-category?from=2026-07-01&to=2026-07-31" "$OTHER_TOKEN" | sed '$d' | jq_ '.expense.length')" "0"
check "user khác: không thấy ngân sách" \
  "$(req GET "/api/budgets?month=2026-07" "$OTHER_TOKEN" | sed '$d' | jq_ '.length')" "0"
BID=$(req GET "/api/budgets?month=2026-07" "$TOKEN" | sed '$d' | jq_ '[0].id')
check "user khác xoá ngân sách của mình → 404" \
  "$(code "$(req DELETE "/api/budgets/$BID" "$OTHER_TOKEN")")" "404"
check "cần đăng nhập mới xem được stats" \
  "$(code "$(curl -s -w '\n%{http_code}' "$API/api/stats/summary")")" "401"

echo
echo "══ $PASSED passed, $FAILED failed ══"
[ "$FAILED" -eq 0 ]
