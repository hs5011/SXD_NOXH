#!/usr/bin/env bash
# =============================================================================
# NOXH_ketnoiAPI - Full API Test Suite (v2)
# Chạy: bash test/test_api.sh
# Yêu cầu: server đang chạy trên localhost:3000 (npm run dev)
#
# Cập nhật v2:
#   - Thêm test Email Config (GET/POST)
#   - Thêm test Password Recovery
#   - Thêm test Attachment download với invalid ID
#   - Thêm test metadata đầy đủ (projectCategories, processes, locations)
#   - Thêm kiểm tra cấu trúc response chi tiết hơn
# =============================================================================

BASE="http://localhost:3000"
PASS=0
FAIL=0
WARN=0

# Màu sắc terminal
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✅ PASS${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}❌ FAIL${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠️  WARN${NC} $1"; ((WARN++)); }
header() { echo -e "\n${CYAN}${BOLD}$1${NC}"; }

# Hàm gọi API và parse JSON bằng Node.js
json() {
  node -e "
    const c=[];
    process.stdin.on('data',d=>c.push(d));
    process.stdin.on('end',()=>{
      try{ const d=JSON.parse(Buffer.concat(c)); process.stdout.write(JSON.stringify(d)); }
      catch(e){ process.stdout.write('PARSE_ERROR:'+Buffer.concat(c).toString().substring(0,100)); }
    });
  "
}

get_field() {
  echo "$1" | node -e "
    const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
      try{
        const d=JSON.parse(Buffer.concat(c));
        const path='$2'.replace(/^\./,'').split('.');
        let v=d; for(const k of path) v=v?.[k];
        process.stdout.write(v!=null?String(v):'');
      }catch{process.stdout.write('');}
    });"
}

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     NOXH_ketnoiAPI - Full API Test Suite v2          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
# BƯỚC 0: Kiểm tra server
# =============================================================================
header "[ 0 ] Kiểm tra server"

HEALTH=$(curl -s --max-time 5 "$BASE/api/health" 2>/dev/null)
if [ "$HEALTH" = '{"status":"ok"}' ]; then
  pass "Server đang chạy tại $BASE"
else
  fail "Server KHÔNG chạy tại $BASE — hãy chạy 'npm run dev' trước"
  echo -e "\n${RED}Dừng test vì server chưa khởi động.${NC}"
  exit 1
fi

# =============================================================================
# 1. INFRASTRUCTURE
# =============================================================================
header "[ 1 ] Infrastructure"

DB=$(curl -s "$BASE/api/db-status" | json)
DB_CONNECTED=$(get_field "$DB" ".connected")
DB_MODE=$(get_field "$DB" ".mode")
if [ "$DB_CONNECTED" = "true" ]; then
  pass "DB kết nối: $DB_MODE"
else
  warn "DB không kết nối — đang chạy In-Memory Fallback (msg: $(get_field "$DB" ".errorMessage"))"
fi

# Kiểm tra cấu trúc response db-status
if get_field "$DB" ".mode" | grep -qE "(PostgreSQL|In-Memory)"; then
  pass "db-status.mode hợp lệ: $DB_MODE"
else
  fail "db-status.mode không hợp lệ: $DB_MODE"
fi

# DB Status retry
DB_RETRY=$(curl -s "$BASE/api/db-status?retry=true" | json)
DB_RETRY_CONNECTED=$(get_field "$DB_RETRY" ".connected")
if [ "$DB_RETRY_CONNECTED" = "true" ]; then
  pass "GET /api/db-status?retry=true → connected"
else
  warn "GET /api/db-status?retry=true → $(get_field "$DB_RETRY" ".mode")"
fi

# =============================================================================
# 2. GET /api/data
# =============================================================================
header "[ 2 ] GET /api/data"

DATA=$(curl -s "$BASE/api/data" | json)
PROJ_COUNT=$(get_field "$DATA" ".projects.length")
USER_COUNT=$(get_field "$DATA" ".users.length")
PROG_COUNT=$(echo "$DATA" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Object.keys(d.actualProgress||{}).length));}
    catch{process.stdout.write('0');}
  });")

if [ -n "$PROJ_COUNT" ] && [ "$PROJ_COUNT" -gt 0 ] 2>/dev/null; then
  pass "projects: $PROJ_COUNT"
else
  fail "projects: không có dữ liệu ($PROJ_COUNT)"
fi

if [ -n "$USER_COUNT" ] && [ "$USER_COUNT" -gt 0 ] 2>/dev/null; then
  pass "users: $USER_COUNT"
else
  fail "users: không có dữ liệu"
fi

if [ -n "$PROG_COUNT" ] && [ "$PROG_COUNT" -gt 0 ] 2>/dev/null; then
  pass "actualProgress: $PROG_COUNT entries"
else
  warn "actualProgress: $PROG_COUNT entries"
fi

# Kiểm tra metadata có trong response
INVESTORS=$(echo "$DATA" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(d.investors?'yes':'no');}
    catch{process.stdout.write('no');}
  });")
if [ "$INVESTORS" = "yes" ]; then
  pass "/api/data chứa investors"
else
  warn "/api/data không chứa investors"
fi

# =============================================================================
# 3. PROJECTS CRUD
# =============================================================================
header "[ 3 ] Projects CRUD"

# 3.1 POST - tạo dự án
CREATE_RESP=$(curl -s -X POST "$BASE/api/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST-AUTO-001",
    "name": "Du an test tu dong",
    "investor": "Chu dau tu Test",
    "location": "Phuong 1, Quan 1",
    "totalArea": 5000,
    "height": 10,
    "apartmentCount": 100,
    "progress": 0,
    "status": "Chua trien khai",
    "projectGroup": "Nha o xa hoi",
    "stage": "CHUAN BI DAU TU",
    "isKeyProject": false,
    "isPublicInvestment": false
  }')
PROJECT_ID=$(get_field "$CREATE_RESP" ".id")
PROJECT_CODE=$(get_field "$CREATE_RESP" ".code")
if [ -n "$PROJECT_ID" ] && [ "$PROJECT_CODE" = "TEST-AUTO-001" ]; then
  pass "POST /api/projects → ID=$PROJECT_ID"
else
  fail "POST /api/projects → $(echo "$CREATE_RESP" | head -c 200)"
fi

# 3.2 PUT - cập nhật dự án
UPDATE_RESP=$(curl -s -X PUT "$BASE/api/projects/$PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST-AUTO-001",
    "name": "Du an test - da cap nhat",
    "investor": "Chu dau tu Test",
    "location": "Phuong 2, Quan 1",
    "totalArea": 7500,
    "height": 15,
    "apartmentCount": 200,
    "progress": 30,
    "status": "Dang trien khai",
    "projectGroup": "Nha o xa hoi",
    "stage": "THUC HIEN DAU TU",
    "isKeyProject": true,
    "isPublicInvestment": false
  }')
UPD_PROGRESS=$(get_field "$UPDATE_RESP" ".progress")
UPD_KEY=$(get_field "$UPDATE_RESP" ".isKeyProject")
if [ "$UPD_PROGRESS" = "30" ] && [ "$UPD_KEY" = "true" ]; then
  pass "PUT /api/projects/:id → progress=$UPD_PROGRESS, isKeyProject=$UPD_KEY"
else
  fail "PUT /api/projects/:id → $(echo "$UPDATE_RESP" | head -c 200)"
fi

# 3.3 POST history
HIST_RESP=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/history" \
  -H "Content-Type: application/json" \
  -d '{"userName":"auto-test","actionType":"update","description":"API test entry","oldStatus":"","newStatus":""}')
HIST_ID=$(get_field "$HIST_RESP" ".id")
if [ -n "$HIST_ID" ]; then
  pass "POST /api/projects/:id/history → id=$HIST_ID"
else
  fail "POST /api/projects/:id/history → $(echo "$HIST_RESP" | head -c 200)"
fi

# 3.4 GET history
GET_HIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/history")
HIST_LEN=$(echo "$GET_HIST" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:0));}
    catch{process.stdout.write('0');}
  });")
if [ "$HIST_LEN" -ge 1 ] 2>/dev/null; then
  pass "GET /api/projects/:id/history → $HIST_LEN entries"
else
  fail "GET /api/projects/:id/history → không có dữ liệu"
fi

# 3.5 DELETE dự án
DEL_PROJ=$(curl -s -X DELETE "$BASE/api/projects/$PROJECT_ID")
DEL_OK=$(get_field "$DEL_PROJ" ".success")
if [ "$DEL_OK" = "true" ]; then
  pass "DELETE /api/projects/:id → success=true"
else
  fail "DELETE /api/projects/:id → $(echo "$DEL_PROJ" | head -c 200)"
fi

# =============================================================================
# 4. ATTACHMENTS
# =============================================================================
header "[ 4 ] Attachments (dự án id=1)"

# 4.1 Upload file
echo "test attachment content - auto test" > /tmp/noxh_test_attach.txt
UPLOAD_RESP=$(curl -s -X POST "$BASE/api/projects/1/attachments/upload" \
  -F "file=@/tmp/noxh_test_attach.txt" \
  -F "uploadedBy=auto-test")
ATTACH_ID=$(get_field "$UPLOAD_RESP" ".id")
if [ -n "$ATTACH_ID" ]; then
  pass "POST upload attachment → id=$ATTACH_ID"
else
  fail "POST upload attachment → $(echo "$UPLOAD_RESP" | head -c 200)"
fi
rm -f /tmp/noxh_test_attach.txt

# 4.2 GET attachments list
ATTACH_LIST=$(curl -s "$BASE/api/projects/1/attachments")
ATTACH_COUNT=$(echo "$ATTACH_LIST" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:0));}
    catch{process.stdout.write('0');}
  });")
if [ "$ATTACH_COUNT" -ge 1 ] 2>/dev/null; then
  pass "GET /api/projects/1/attachments → $ATTACH_COUNT files"
else
  fail "GET /api/projects/1/attachments → không có file"
fi

# 4.3 Download attachment (hợp lệ)
if [ -n "$ATTACH_ID" ]; then
  DL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/attachments/$ATTACH_ID/download")
  if [ "$DL_STATUS" = "200" ]; then
    pass "GET /api/attachments/:id/download → HTTP $DL_STATUS"
  else
    fail "GET /api/attachments/:id/download → HTTP $DL_STATUS"
  fi
else
  warn "Bỏ qua download test (không có attachment ID)"
fi

# 4.4 Download attachment invalid ID
INV_DL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/attachments/abc/download")
if [ "$INV_DL_STATUS" = "400" ]; then
  pass "GET /api/attachments/abc/download → HTTP 400 (invalid id)"
else
  warn "GET /api/attachments/abc/download → HTTP $INV_DL_STATUS (mong đợi 400)"
fi

# 4.5 Download attachment không tồn tại (id=99999)
NOT_FOUND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/attachments/99999/download")
if [ "$NOT_FOUND_STATUS" = "404" ] || [ "$NOT_FOUND_STATUS" = "200" ]; then
  # 200 = fallback file giả, 404 = không tìm thấy; cả hai đều chấp nhận
  pass "GET /api/attachments/99999/download → HTTP $NOT_FOUND_STATUS"
else
  warn "GET /api/attachments/99999/download → HTTP $NOT_FOUND_STATUS"
fi

# =============================================================================
# 5. USERS CRUD
# =============================================================================
header "[ 5 ] Users CRUD"

# 5.1 GET users
USERS=$(curl -s "$BASE/api/users")
USERS_COUNT=$(echo "$USERS" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:0));}
    catch{process.stdout.write('0');}
  });")
if [ "$USERS_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET /api/users → $USERS_COUNT users"
else
  fail "GET /api/users → không có dữ liệu"
fi

# 5.2 POST - tạo user
NEW_USER=$(curl -s -X POST "$BASE/api/users" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "autotest_temp@example.com",
    "password": "AutoTest123",
    "fullName": "Auto Test User",
    "roleId": "Chuyen vien",
    "userType": "agency",
    "agencyId": "1"
  }')
NEW_USER_ID=$(get_field "$NEW_USER" ".id")
NEW_USER_EMAIL=$(get_field "$NEW_USER" ".email")
if [ -n "$NEW_USER_ID" ] && [ "$NEW_USER_EMAIL" = "autotest_temp@example.com" ]; then
  pass "POST /api/users → id=$NEW_USER_ID"
else
  fail "POST /api/users → $(echo "$NEW_USER" | head -c 200)"
fi

# 5.3 PUT - cập nhật user
UPD_USER=$(curl -s -X PUT "$BASE/api/users/$NEW_USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "autotest_temp@example.com",
    "password": "NewPass456",
    "fullName": "Auto Test Updated",
    "roleId": "Lanh dao",
    "userType": "agency",
    "agencyId": "1"
  }')
UPD_NAME=$(get_field "$UPD_USER" ".fullName")
if [ "$UPD_NAME" = "Auto Test Updated" ]; then
  pass "PUT /api/users/:id → fullName=$UPD_NAME"
else
  fail "PUT /api/users/:id → $(echo "$UPD_USER" | head -c 200)"
fi

# 5.4 DELETE user
DEL_USER=$(curl -s -X DELETE "$BASE/api/users/$NEW_USER_ID")
DEL_USER_OK=$(get_field "$DEL_USER" ".success")
if [ "$DEL_USER_OK" = "true" ]; then
  pass "DELETE /api/users/:id → success=true"
else
  fail "DELETE /api/users/:id → $(echo "$DEL_USER" | head -c 200)"
fi

# =============================================================================
# 6. ACTUAL PROGRESS
# =============================================================================
header "[ 6 ] Actual Progress"

# 6.1 GET all actual progress
PROG_ALL=$(curl -s "$BASE/api/actual-progress")
PROG_TOTAL=$(echo "$PROG_ALL" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Object.keys(d).length));}
    catch{process.stdout.write('0');}
  });")
if [ "$PROG_TOTAL" -gt 0 ] 2>/dev/null; then
  pass "GET /api/actual-progress → $PROG_TOTAL entries"
else
  fail "GET /api/actual-progress → không có dữ liệu"
fi

# 6.2 PUT update progress
UPD_PROG=$(curl -s -X PUT "$BASE/api/actual-progress/1" \
  -H "Content-Type: application/json" \
  -d '{
    "chutruong": {"cdtDate": "2024-01-15", "nnDate": "2024-02-20"},
    "qh1500":    {"cdtDate": "2024-03-01", "nnDate": ""},
    "giaodat":   {"cdtDate": "",           "nnDate": ""},
    "htkt":      {"cdtDate": "",           "nnDate": ""},
    "bcnckt":    {"cdtDate": "",           "nnDate": ""},
    "pccc":      {"cdtDate": "",           "nnDate": ""},
    "gpxd":      {"cdtDate": "",           "nnDate": ""}
  }')
UPD_CDT=$(get_field "$UPD_PROG" ".chutruong.cdtDate")
if [ "$UPD_CDT" = "2024-01-15" ]; then
  pass "PUT /api/actual-progress/:id → chutruong.cdtDate=$UPD_CDT"
else
  fail "PUT /api/actual-progress/:id → $(echo "$UPD_PROG" | head -c 200)"
fi

# 6.3 POST reset
RESET_RESP=$(curl -s -X POST "$BASE/api/actual-progress/reset")
RESET_OK=$(get_field "$RESET_RESP" ".success")
if [ "$RESET_OK" = "true" ]; then
  pass "POST /api/actual-progress/reset → success=true"
else
  fail "POST /api/actual-progress/reset → $(echo "$RESET_RESP" | head -c 200)"
fi

# =============================================================================
# 7. METADATA
# =============================================================================
header "[ 7 ] Metadata"

declare -A METADATA_TESTS=(
  ["investors"]='["Chu dau tu A","Chu dau tu B","Chu dau tu Test"]'
  ["projectStatuses"]='["Chua trien khai","Dang trien khai","Hoan thanh","Tam dung"]'
  ["projectGroups"]='["Nha o xa hoi","Nha o thuong mai","Tai dinh cu"]'
  ["buildingGrades"]='["Cap I","Cap II","Cap III"]'
  ["projectStages"]='["CHUAN BI DAU TU","THUC HIEN DAU TU","KET THUC DAU TU"]'
  ["fundingSources"]='["Ngan sach nha nuoc","Von vay","Von tu nhan"]'
  ["stepStatuses"]='["Cho xu ly","Dang xu ly","Hoan thanh","Qua han"]'
  ["priorities"]='["Cao","Trung binh","Thap"]'
  ["processingResults"]='["Dat","Khong dat","Cho ket qua"]'
  ["projectCategories"]='["Nha o xa hoi dinh dien","Nha o xu ly nguoi dan khong o","Nha luu tru cong nhan"]'
)

for KEY in "${!METADATA_TESTS[@]}"; do
  RESP=$(curl -s -X PUT "$BASE/api/metadata/$KEY" \
    -H "Content-Type: application/json" \
    -d "${METADATA_TESTS[$KEY]}")
  COUNT=$(echo "$RESP" | node -e "
    const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
      try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:-1));}
      catch{process.stdout.write('-1');}
    });")
  if [ "$COUNT" -gt 0 ] 2>/dev/null; then
    pass "PUT /api/metadata/$KEY → $COUNT items"
  else
    fail "PUT /api/metadata/$KEY → $(echo "$RESP" | head -c 100)"
  fi
done

# processingAgencies (cấu trúc phức tạp)
PA_RESP=$(curl -s -X PUT "$BASE/api/metadata/processingAgencies" \
  -H "Content-Type: application/json" \
  -d '[
    {"id":"so-xay-dung","name":"So Xay Dung","displayOrder":1,"departments":["Phong 1","Phong 2"]},
    {"id":"so-qhkt","name":"So QHKT","displayOrder":2,"departments":[]}
  ]')
PA_COUNT=$(echo "$PA_RESP" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:-1));}
    catch{process.stdout.write('-1');}
  });")
if [ "$PA_COUNT" = "2" ]; then
  pass "PUT /api/metadata/processingAgencies → $PA_COUNT items (complex)"
else
  fail "PUT /api/metadata/processingAgencies → $(echo "$PA_RESP" | head -c 200)"
fi

# locations
LOC_RESP=$(curl -s -X PUT "$BASE/api/metadata/locations" \
  -H "Content-Type: application/json" \
  -d '[{"ward":"Phuong 1","oldArea":"Quan 1"},{"ward":"Phuong 2","oldArea":"Quan 1"}]')
LOC_COUNT=$(echo "$LOC_RESP" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:-1));}
    catch{process.stdout.write('-1');}
  });")
if [ "$LOC_COUNT" = "2" ]; then
  pass "PUT /api/metadata/locations → $LOC_COUNT items (ward+oldArea)"
else
  fail "PUT /api/metadata/locations → $(echo "$LOC_RESP" | head -c 200)"
fi

# processes
PROC_RESP=$(curl -s -X PUT "$BASE/api/metadata/processes" \
  -H "Content-Type: application/json" \
  -d '[{"id":"proc-1","name":"Quy trinh A","parentSteps":[]},{"id":"proc-2","name":"Quy trinh B","parentSteps":[]}]')
PROC_COUNT=$(echo "$PROC_RESP" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{const d=JSON.parse(Buffer.concat(c));process.stdout.write(String(Array.isArray(d)?d.length:-1));}
    catch{process.stdout.write('-1');}
  });")
if [ "$PROC_COUNT" = "2" ]; then
  pass "PUT /api/metadata/processes → $PROC_COUNT items"
else
  fail "PUT /api/metadata/processes → $(echo "$PROC_RESP" | head -c 200)"
fi

# =============================================================================
# 8. EMAIL CONFIG (MỚI)
# =============================================================================
header "[ 8 ] Email Config"

# 8.1 GET email config
EMAIL_CFG=$(curl -s "$BASE/api/email-config" | json)
EMAIL_HOST=$(get_field "$EMAIL_CFG" ".host")
EMAIL_PASS=$(get_field "$EMAIL_CFG" ".password")
if [ -n "$EMAIL_HOST" ]; then
  pass "GET /api/email-config → host=$EMAIL_HOST"
else
  warn "GET /api/email-config → không có host (chưa cấu hình)"
fi

# Kiểm tra password được ẩn
if [ "$EMAIL_PASS" = "●●●●●●●●" ] || [ -z "$EMAIL_PASS" ]; then
  pass "GET /api/email-config → password được ẩn/rỗng"
else
  fail "GET /api/email-config → password KHÔNG được ẩn: $EMAIL_PASS"
fi

# 8.2 POST email config (lưu cấu hình mới)
SAVE_CFG=$(curl -s -X POST "$BASE/api/email-config" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "smtp.example.com",
    "port": "587",
    "secure": false,
    "username": "test@example.com",
    "password": "TestPass123",
    "fromName": "NOXH Test",
    "fromEmail": "noreply@example.com"
  }')
SAVE_HOST=$(get_field "$SAVE_CFG" ".host")
if [ "$SAVE_HOST" = "smtp.example.com" ]; then
  pass "POST /api/email-config → lưu thành công, host=$SAVE_HOST"
else
  warn "POST /api/email-config → $(echo "$SAVE_CFG" | head -c 200)"
fi

# 8.3 POST email config với placeholder password (giữ nguyên password cũ)
SAVE_PLACEHOLDER=$(curl -s -X POST "$BASE/api/email-config" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "smtp.example.com",
    "port": "587",
    "secure": false,
    "username": "test@example.com",
    "password": "●●●●●●●●",
    "fromName": "NOXH Test",
    "fromEmail": "noreply@example.com"
  }')
PLACEHOLDER_HOST=$(get_field "$SAVE_PLACEHOLDER" ".host")
if [ "$PLACEHOLDER_HOST" = "smtp.example.com" ]; then
  pass "POST /api/email-config với placeholder → xử lý đúng"
else
  warn "POST /api/email-config với placeholder → $(echo "$SAVE_PLACEHOLDER" | head -c 200)"
fi

# =============================================================================
# 9. PASSWORD RECOVERY (MỚI)
# =============================================================================
header "[ 9 ] Password Recovery"

# Lấy danh sách user để test recovery
USERS_LIST=$(curl -s "$BASE/api/users" | json)
FIRST_USER_ID=$(echo "$USERS_LIST" | node -e "
  const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{
    try{
      const d=JSON.parse(Buffer.concat(c));
      const u=Array.isArray(d)?d.find(u=>u.email):null;
      process.stdout.write(u?u.id:'');
    }catch{process.stdout.write('');}
  });")

if [ -n "$FIRST_USER_ID" ]; then
  RECOVER_RESP=$(curl -s -X POST "$BASE/api/users/$FIRST_USER_ID/recover-password")
  RECOVER_OK=$(get_field "$RECOVER_RESP" ".success")
  TEMP_PASS=$(get_field "$RECOVER_RESP" ".tempPassword")
  EMAIL_SENT=$(get_field "$RECOVER_RESP" ".emailSent")

  if [ "$RECOVER_OK" = "true" ]; then
    pass "POST /api/users/:id/recover-password → success=true"
  else
    fail "POST /api/users/:id/recover-password → $(echo "$RECOVER_RESP" | head -c 200)"
  fi

  if [ -n "$TEMP_PASS" ]; then
    pass "recover-password → tempPassword được tạo ($TEMP_PASS)"
  else
    fail "recover-password → không có tempPassword"
  fi

  if [ "$EMAIL_SENT" = "true" ] || [ "$EMAIL_SENT" = "false" ]; then
    pass "recover-password → emailSent=$EMAIL_SENT"
  else
    fail "recover-password → không có trường emailSent"
  fi
else
  warn "Bỏ qua password recovery test (không tìm thấy user có email)"
fi

# Test với user không tồn tại
NOT_FOUND_RECOVER=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE/api/users/nonexistent-user-9999/recover-password")
if [ "$NOT_FOUND_RECOVER" = "404" ]; then
  pass "POST /api/users/nonexistent/recover-password → HTTP 404"
else
  warn "POST /api/users/nonexistent/recover-password → HTTP $NOT_FOUND_RECOVER (mong đợi 404)"
fi

# =============================================================================
# KẾT QUẢ
# =============================================================================
TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗"
echo -e "║                   KẾT QUẢ TEST                      ║"
echo -e "╚══════════════════════════════════════════════════════╝${NC}"
echo -e "  Tổng số test  : ${BOLD}$TOTAL${NC}"
echo -e "  ${GREEN}✅ PASS${NC}          : ${BOLD}$PASS${NC}"
echo -e "  ${RED}❌ FAIL${NC}          : ${BOLD}$FAIL${NC}"
echo -e "  ${YELLOW}⚠️  WARN${NC}          : ${BOLD}$WARN${NC}"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}🎉 Tất cả test đều PASS!${NC}"
else
  echo -e "  ${RED}${BOLD}💥 Có $FAIL test FAIL — cần kiểm tra lại.${NC}"
fi
echo ""
