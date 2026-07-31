#!/usr/bin/env bash
# Kiểm thử luồng auth end-to-end. Điểm chính: chứng minh reuse detection revoke
# CẢ FAMILY, không chỉ token bị dùng lại.
set -uo pipefail

API=http://localhost:3001
JAR=$(mktemp -d)
EMAIL="test-$RANDOM@example.com"
PASS="matkhau12345"
PASSED=0; FAILED=0

check() { # check <mô tả> <thực tế> <mong đợi>
  if [ "$2" = "$3" ]; then printf '  ✓ %-58s %s\n' "$1" "$2"; PASSED=$((PASSED+1));
  else printf '  ✗ %-58s got=%s want=%s\n' "$1" "$2" "$3"; FAILED=$((FAILED+1)); fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }

post() { # post <path> <cookiejar-in> <cookiejar-out> [json]
  local p=$1 cin=$2 cout=$3 data=${4:-}
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X POST "$API$p" -H 'Content-Type: application/json' \
      ${cin:+-b "$cin"} ${cout:+-c "$cout"} -d "$data"
  else
    curl -s -w '\n%{http_code}' -X POST "$API$p" ${cin:+-b "$cin"} ${cout:+-c "$cout"}
  fi
}

echo "── 1. Đăng ký ─────────────────────────────────────────────────────────────"
R=$(post /auth/register "" "$JAR/c1" "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Test\"}")
check "POST /auth/register" "$(code "$R")" "201"
ACCESS=$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).accessToken||'')}catch{console.log('')}})")
[ -n "$ACCESS" ] && check "trả về accessToken" "yes" "yes" || check "trả về accessToken" "no" "yes"
grep -q expense_refresh "$JAR/c1" && check "set refresh cookie" "yes" "yes" || check "set refresh cookie" "no" "yes"
check "refresh token KHÔNG có trong body" \
  "$(body "$R" | grep -c refreshToken)" "0"
grep -q HttpOnly "$JAR/c1" && check "cookie là HttpOnly" "yes" "yes" || check "cookie là HttpOnly" "no" "yes"

echo "── 2. Mật khẩu yếu / email trùng ──────────────────────────────────────────"
R=$(post /auth/register "" "" "{\"email\":\"x$EMAIL\",\"password\":\"123\"}")
check "password < 8 ký tự bị chặn" "$(code "$R")" "400"
body "$R" | grep -q fieldErrors && check "trả fieldErrors cho form" "yes" "yes" || check "trả fieldErrors cho form" "no" "yes"
R=$(post /auth/register "" "" "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
check "email trùng → 409" "$(code "$R")" "409"

echo "── 3. /auth/me ────────────────────────────────────────────────────────────"
R=$(curl -s -w '\n%{http_code}' "$API/auth/me" -H "Authorization: Bearer $ACCESS")
check "có access token → 200" "$(code "$R")" "200"
check "trả đúng email" "$(body "$R" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).email))")" "$EMAIL"
check "không có token → 401" "$(code "$(curl -s -w '\n%{http_code}' "$API/auth/me")")" "401"
check "token rác → 401" \
  "$(code "$(curl -s -w '\n%{http_code}' "$API/auth/me" -H 'Authorization: Bearer khong-phai-token')")" "401"

echo "── 4. Rotation ────────────────────────────────────────────────────────────"
cp "$JAR/c1" "$JAR/old"          # giữ lại cookie CŨ để thử reuse
R=$(post /auth/refresh "$JAR/c1" "$JAR/c2" "")
check "refresh với cookie hợp lệ → 200" "$(code "$R")" "200"
OLD_TOK=$(grep expense_refresh "$JAR/old" | awk '{print $NF}')
NEW_TOK=$(grep expense_refresh "$JAR/c2" | awk '{print $NF}')
[ "$OLD_TOK" != "$NEW_TOK" ] && check "token đã được rotate (khác token cũ)" "yes" "yes" \
  || check "token đã được rotate (khác token cũ)" "no" "yes"

echo "── 5. Reuse detection (phần quan trọng nhất) ──────────────────────────────"
R=$(post /auth/refresh "$JAR/old" "" "")
check "dùng lại token ĐÃ revoke → 401" "$(code "$R")" "401"
# Đây là chỗ chứng minh revoke theo FAMILY: token mới vẫn còn hạn và chưa từng
# bị dùng, nhưng phải chết theo vì cùng family với token bị đánh cắp.
R=$(post /auth/refresh "$JAR/c2" "" "")
check "token MỚI cũng bị revoke theo family → 401" "$(code "$R")" "401"

echo "── 6. Login lại + logout ──────────────────────────────────────────────────"
R=$(post /auth/login "" "$JAR/c3" "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
check "login sau khi family bị revoke → 200" "$(code "$R")" "200"
R=$(post /auth/login "" "" "{\"email\":\"$EMAIL\",\"password\":\"sai-mat-khau\"}")
check "mật khẩu sai → 401" "$(code "$R")" "401"
R=$(post /auth/login "" "" "{\"email\":\"khong-ton-tai@example.com\",\"password\":\"$PASS\"}")
check "email không tồn tại → 401 (cùng message)" "$(code "$R")" "401"
R=$(post /auth/refresh "$JAR/c3" "$JAR/c4" "")
check "refresh sau login mới → 200" "$(code "$R")" "200"
R=$(post /auth/logout "$JAR/c4" "$JAR/c5" "")
check "logout → 204" "$(code "$R")" "204"
R=$(post /auth/refresh "$JAR/c4" "" "")
check "refresh sau logout → 401" "$(code "$R")" "401"

echo
echo "══ $PASSED passed, $FAILED failed ══"
echo "EMAIL=$EMAIL"
rm -rf "$JAR"
[ "$FAILED" -eq 0 ]
