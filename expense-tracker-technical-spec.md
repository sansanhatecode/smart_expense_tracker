# Technical Specification — Smart Expense Tracker

Ứng dụng quản lý chi tiêu cá nhân với **auto-import** từ CSV / sao kê ngân hàng (Excel, PDF), thống kê & ngân sách. Fullstack, chi phí **0đ** (free tier).

> **v3** — sửa 7 quyết định data model / luồng import so với v1, và **giữ kiến trúc tách FE/BE** (v2 từng đề xuất gộp thành một app Next.js; xem ADR 9.1 để biết vì sao quay lại tách). Lý do từng thay đổi ghi ở §9 (ADR).

---

## 1. Tổng quan

Người dùng theo dõi thu–chi mà **không phải nhập tay**: kéo dữ liệu từ file sao kê / CSV, hệ thống tự chuẩn hóa, chống trùng, tự phân loại, rồi trình bày thống kê và cảnh báo vượt ngân sách.

**Phạm vi chức năng:**
- Auth (JWT access token + refresh token có rotation), dữ liệu cô lập theo user.
- CRUD giao dịch, danh mục.
- Import CSV + Excel (.xlsx) theo luồng upload → preview → confirm → rollback.
- Auto-categorize theo rule keyword.
- Dashboard: tổng thu/chi/số dư, biểu đồ theo danh mục & theo thời gian.
- Budget theo danh mục/tháng + cảnh báo ngưỡng.

**Ràng buộc:** chỉ dùng free tier, **0đ tuyệt đối**. Không link thẻ ngân hàng thật (không khả thi cho dev cá nhân ở VN hiện tại) — thay bằng import file.

---

## 2. Tech stack

Monorepo npm workspaces, hai Node process độc lập:

```
apps/web          Next.js 16    :3000    → Vercel
apps/api          NestJS 11     :3001    → Render
packages/shared   Zod + types            → cả hai đầu import
```

| Lớp | Lựa chọn | Lý do |
| :---- | :---- | :---- |
| Frontend | Next.js 16 App Router + TypeScript | routing rõ, RSC cho phần read tĩnh |
| Backend | NestJS 11 + TypeScript | module/DI, cấu trúc rõ, là phần kể được khi phỏng vấn |
| Contract | `packages/shared` — Zod schema + DTO types | Cả web và api import **cùng một** schema → contract lệch là lỗi compile, không phải lỗi runtime. Đây là thứ thay thế OpenAPI codegen sau khi tách |
| Validation | Zod ở cả hai đầu | Một schema, dùng cho cả form FE và pipe BE |
| Styling / UI | Tailwind v4 + primitive tự viết | |
| Data fetching | TanStack Query | cache, optimistic update, silent refresh token |
| Charts | Recharts | nhẹ, đủ dùng |
| ORM / DB | Prisma 7 + PostgreSQL (**Neon**) | type-safe; Neon scale-to-zero rồi **tự wake < 1s** |
| Auth | JWT access (memory) + refresh token (httpOnly cookie), argon2id | Tách origin → JWT là lựa chọn đúng. Xem ADR 9.7 |
| File parse | papaparse (CSV), **read-excel-file** (.xlsx), pdfjs-dist (mở rộng) | `xlsx` trên npm đã bỏ rơi + có CVE; `exceljs` kéo 76 dep và mang theo vuln — xem §9.2 |
| Money | `BigInt` (số nguyên VND) | VND không có đơn vị nhỏ hơn đồng — xem §9.3 |
| Test | **Vitest** | ESM native, ít config với TS |
| Deploy | **Vercel (web) + Render (api) + Neon (DB)** | 0đ. Đánh đổi: Render free sleep — xem ADR 9.9 |
| CI/CD | GitHub Actions (lint + typecheck + test), `services: postgres` cho integration | |

**Không chọn Railway:** đã bỏ free tier từ 2023, và bỏ prepaid credit đầu 2026 — chỉ còn $5 trial 30 ngày.

**Không chọn Supabase:** free project tự pause sau 7 ngày không có request và phải vào dashboard unpause bằng tay. Neon thì scale-to-zero rồi tự wake.

---

## 3. Data model

```
User             (id, email, password_hash, name?, created_at)
RefreshToken     (id, user_id, token_hash, family_id, expires_at, revoked_at?,
                  replaced_by_id?, user_agent?, ip?)         -- rotation, xem §6
Category         (id, user_id, name, type[income|expense], icon, color, sort_order)
Transaction      (id, user_id, category_id?, amount, type, date, description,
                  balance?, dedupe_hash, import_batch_id?, created_at)
StagedTransaction(id, batch_id, category_id?, amount, type, date, description,
                  balance?, dedupe_hash, is_duplicate, raw)  -- hàng chờ confirm
Budget           (id, user_id, category_id, month[YYYY-MM], limit_amount)
ImportBatch      (id, user_id, source[csv|xlsx|pdf], file_name, bank_profile?,
                  row_count, status[pending|confirmed|rolled_back], created_at)
CategoryRule     (id, user_id, keyword, category_id)         -- auto-categorize
```

### Prisma schema (rút gọn)

```prisma
// Prisma 7: generator `prisma-client` (output bắt buộc), và `url` KHÔNG còn nằm
// trong schema — nó chuyển sang prisma.config.ts.
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"              // NestJS build ra CommonJS
}

datasource db {
  provider = "postgresql"
}

model Transaction {
  id            String    @id @default(cuid())
  userId        String
  categoryId    String?
  amount        BigInt                        // số nguyên VND, LUÔN > 0
  type          TxType                        // chiều thu/chi nằm ở đây, không ở dấu
  date          DateTime  @db.Date            // ngày lịch, không phải instant
  description   String
  balance       BigInt?                       // số dư sau GD (nếu sao kê có) — dùng cho dedupe
  dedupeHash    String
  importBatchId String?
  createdAt     DateTime  @default(now())

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  category    Category?    @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  importBatch ImportBatch? @relation(fields: [importBatchId], references: [id], onDelete: SetNull)

  @@unique([userId, dedupeHash])   // chống trùng khi import
  @@index([userId, date])
  @@index([userId, categoryId])
  @@index([importBatchId])
}

enum TxType { income expense }
```

### CHECK constraint (viết tay trong migration)

Đây là chỗ chốt các invariant mà Prisma schema không diễn đạt được. Ý đồ: dữ liệu sai **không vào được bảng** kể cả khi code ứng dụng có bug.

```sql
-- ADR 9.4: amount luôn dương, chiều thu/chi nằm ở `type`
ALTER TABLE "Transaction"       ADD CONSTRAINT "Transaction_amount_positive"       CHECK ("amount" > 0);
ALTER TABLE "StagedTransaction" ADD CONSTRAINT "StagedTransaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Budget"            ADD CONSTRAINT "Budget_limit_positive"             CHECK ("limitAmount" > 0);

-- Trần 10^15đ: đây là điều bảo đảm ở tầng DB rằng BigInt → Number ở API
-- boundary không bao giờ mất chính xác (Number.MAX_SAFE_INTEGER ~ 9*10^15)
ALTER TABLE "Transaction"       ADD CONSTRAINT "Transaction_amount_max"       CHECK ("amount" <= 1000000000000000);
ALTER TABLE "StagedTransaction" ADD CONSTRAINT "StagedTransaction_amount_max" CHECK ("amount" <= 1000000000000000);
ALTER TABLE "Budget"            ADD CONSTRAINT "Budget_limit_max"             CHECK ("limitAmount" <= 1000000000000000);

-- `month` là TEXT nên không có gì chặn 'thang 8' hay '2026-13' ngoài check này
ALTER TABLE "Budget"   ADD CONSTRAINT "Budget_month_format" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$');
-- màu danh mục đi thẳng vào chart nên phải là hex hợp lệ
ALTER TABLE "Category" ADD CONSTRAINT "Category_color_hex"  CHECK ("color" ~ '^#[0-9a-fA-F]{6}$');
-- mô tả rỗng làm dedupe hash mất discriminator quan trọng nhất
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_description_not_blank" CHECK (btrim("description") <> '');
```

**Quy ước:**
- `amount` là **`BigInt` số nguyên VND, luôn dương**; chiều thu/chi do `type` quyết định. Không dùng `Float`, không dùng `Decimal`, không cần decimal library. Serialize sang `number` ở API boundary (số tiền VND thực tế < 2^53).
- `date` là **`DATE`** — sao kê cho ngày lịch. Không lưu timestamptz, nên không có bug lệch tháng ở ranh giới UTC/ICT.
- `dedupeHash` = `sha256(userId | date | amount | type | normalized_description | seq)` → unique constraint chặn import trùng. `balance` cố tình KHÔNG tham gia hash — xem ADR 9.8. Chi tiết ở §4.
- Index `(userId, date)` phục vụ filter theo kỳ và aggregation dashboard.

---

## 4. Kiến trúc import (Adapter + Normalizer)

Tách **parse** khỏi **lưu** để thêm ngân hàng mới = thêm 1 adapter, không đụng phần còn lại.

```
Upload file (validate: loại, size < 4MB, số dòng < 10.000)
   │
   ▼
Detect source (đuôi file + sniff nội dung)
   │
   ▼
Parser adapter ─ CsvParser │ XlsxParser │ PdfParser
   │                (mỗi bank = 1 mapping profile)
   ▼
Normalizer  →  NormalizedTransaction[]   (amount dương + type)
   │
   ▼
Auto-categorize (CategoryRule keyword match)
   │
   ▼
Dedupe (tính dedupe_hash; đánh dấu trùng trong batch + trùng DB)
   │
   ▼
STAGE → ghi ImportBatch(status=pending) + StagedTransaction[]  → trả batchId + preview
   │
   ▼
User xem / sửa danh mục trên preview  (state nằm ở DB, đóng tab quay lại vẫn còn)
   │
   ▼
CONFIRM (1 DB transaction) → copy sang Transaction + gắn import_batch_id
                             → status=confirmed, xoá staged
   │
   ▼
Rollback cả batch bằng DELETE /imports/:id
```

### Interface chuẩn hóa

```ts
// Điều mà sao kê cung cấp — amount có dấu, vì đó là dạng gốc
interface RawTransaction {
  date: Date;
  amount: number;        // âm = chi, dương = thu
  description: string;
  balance?: number;      // số dư sau giao dịch
  raw: string;           // dòng gốc để debug
}

// Điều mà DB lưu — Normalizer là nơi chuyển đổi
interface NormalizedTransaction {
  date: Date;
  amount: bigint;        // luôn > 0
  type: 'income' | 'expense';
  description: string;
  balance?: bigint;
  raw: string;
}

interface StatementParser {
  supports(file: UploadedFile): boolean;
  parse(file: UploadedFile, profile?: BankProfile): RawTransaction[];
}
```

### BankProfile (mapping cột theo ngân hàng)

```ts
interface BankProfile {
  bank: string;              // 'VCB' | 'TCB' | 'ACB' | 'generic'
  dateColumn: string;
  amountColumn?: string;     // 1 cột có dấu +/-
  debitColumn?: string;      // hoặc tách 2 cột nợ/có
  creditColumn?: string;
  descColumn: string;
  balanceColumn?: string;    // nếu có → dedupe chính xác hơn nhiều
  dateFormat: string;        // 'DD/MM/YYYY'
  skipRows: number;          // bỏ header/tiêu đề sao kê
}
```

### Dedupe — chi tiết

Hash **không được** chỉ gồm `(date, amount, description)`: hai ly cà phê 25.000đ cùng ngày cùng mô tả sẽ cho cùng hash → unique constraint chặn cái thứ hai → **mất dữ liệu thật**.

Discriminator là **`seq`** — thứ tự xuất hiện trong nhóm các dòng giống hệt nhau, nhóm theo `(date, amount, type, normalizedDesc)`:

```
hash = sha256(userId | date | amount | type | normalizedDesc | seq)
```

- Hai ly cà phê thật → seq 0 và 1 → hai hash khác nhau → **giữ cả hai**.
- Import lại cùng file → vẫn seq 0 và 1 → cùng hash → **nhận ra trùng**.

**`seq` của dòng import phải tính TRONG BATCH**, không cộng thêm số dòng đã có trong DB. Cộng vào thì import lại cùng file sẽ ra seq 2,3 thay vì 0,1, hash khác đi và dedupe mất tác dụng hoàn toàn.

**Giao dịch nhập tay** cũng đi qua đúng công thức này, với `seq` = số giao dịch đã có cùng khoá. Nhờ đó nhập tay 1 ly cà phê (seq 0) rồi import file có 2 ly thì dòng đầu bị nhận là trùng, dòng thứ hai được thêm.

`normalizedDesc`: bỏ dấu tiếng Việt (cùng giao dịch có thể export có dấu hoặc không), uppercase, gộp khoảng trắng, bỏ dấu câu — nhưng **giữ chữ số**. Bỏ chữ số đi thì hai giao dịch khác nhau có thể trùng khoá, mà mất dữ liệu tệ hơn sinh trùng. Ngân hàng phát ra mã tham chiếu biến động giữa các lần export thì xử lý bằng `stripPattern` trong BankProfile, không làm yếu hàm chuẩn hoá cho mọi ngân hàng.

Toàn bộ nằm ở `apps/api/src/imports/dedupe.ts`, là pure function nên test được không cần DB.

---

## 5. API design (REST, NestJS controllers)

Tất cả nằm trên origin của API (`http://localhost:3001` khi dev), FE gọi qua `fetch` với `credentials: 'include'`.

| Method | Endpoint | Mô tả |
| :---- | :---- | :---- |
| POST | `/auth/register` | đăng ký → trả access token + set refresh cookie |
| POST | `/auth/login` | đăng nhập → trả access token + set refresh cookie |
| POST | `/auth/refresh` | rotate refresh cookie → access token mới |
| POST | `/auth/logout` | revoke cả family, xoá cookie |
| GET | `/auth/me` | user hiện tại |
| GET | `/api/transactions` | list + filter (`?from&to&categoryId&type&q&page&limit&sort`) |
| POST | `/api/transactions` | tạo thủ công |
| PATCH | `/api/transactions/:id` | sửa |
| DELETE | `/api/transactions/:id` | xóa |
| GET/POST/PATCH/DELETE | `/api/categories` | CRUD danh mục |
| POST | `/api/imports` | upload → parse → normalize → categorize → dedupe → **stage**, trả batchId + preview |
| PATCH | `/api/imports/:id/rows/:rowId` | user sửa danh mục 1 dòng ở bước preview |
| POST | `/api/imports/:id/confirm` | commit batch đã stage |
| DELETE | `/api/imports/:id` | rollback (batch pending → xoá staged; confirmed → xoá Transaction theo batch) |
| GET/POST/PATCH | `/api/budgets` | ngân sách theo tháng |
| GET | `/api/stats/summary` | tổng thu/chi/số dư theo kỳ |
| GET | `/api/stats/by-category` | aggregation GROUP BY category |
| GET | `/api/stats/trend` | chuỗi thời gian theo ngày/tháng |

**Luồng import:** `POST /api/imports` ghi vào **staging table** (không phải `Transaction`) và trả `batchId` thật. Preview state nằm ở DB nên request confirm — chạy trên serverless instance khác, không chia sẻ bộ nhớ — vẫn tìm lại được batch. `Transaction` **không bao giờ** chứa dòng chưa confirm, nên không query stats nào cần filter `status`.

Batch `pending` cũ hơn 24h bị cleanup (lazy, khi tạo batch mới).

Vì API là Node long-running (Render) chứ không phải serverless, route import **không** vướng giới hạn 4.5MB body và 60s timeout của Vercel. Giới hạn upload là do ta tự đặt (`MAX_UPLOAD_BYTES`, `MAX_IMPORT_ROWS`), không phải do nền tảng — nên nếu sau này cần parse file lớn thì chỉ là nới config.

---

## 6. Xử lý kỹ thuật trọng tâm

**Aggregation ở DB, không ở JS.** Dashboard dùng `GROUP BY category` và `date_trunc('month', date)` — tránh kéo hết row về app rồi cộng. Lưu ý: Prisma `groupBy` không nhận expression nên `/stats/trend` phải dùng `$queryRaw` với `Prisma.sql` template (không nội suy string, tránh SQL injection). `/stats/by-category` thì `groupBy` là đủ.

**Tiền tệ.** `BigInt` số nguyên VND, luôn dương, `type` giữ chiều. Cộng/trừ số nguyên chính xác tuyệt đối. Một helper `lib/money.ts` lo format VND và serialize BigInt ↔ number — không rải rác logic này ra route.

**Timezone.** Không có vấn đề timezone: `date` là `DATE`, so sánh và group theo ngày lịch trực tiếp.

**Dedupe.** Unique `(userId, dedupeHash)` + discriminator `seq` → import lại file chồng lấn kỳ vẫn an toàn **mà không xoá mất giao dịch trùng lặp hợp lệ**. Giao dịch nhập tay dùng cùng công thức nên dedupe xuyên được giữa nhập tay và import.

**Auto-categorize.** Rule keyword ("GRAB"→Di chuyển, "HIGHLANDS"→Ăn uống) chạy trước; giao dịch không khớp để `categoryId = null` cho user tự gán ở bước preview.

**Rollback theo batch.** Mỗi giao dịch mang `import_batch_id` → xóa nhầm nguyên lô bằng một câu lệnh.

**Connection pooling.** API là một process long-running nên Prisma tự giữ pool — không gặp vấn đề cạn connection như serverless. Vẫn dùng Neon **pooled** URL cho runtime và **direct** URL cho migration (khai báo trong `prisma.config.ts`, không còn trong `schema.prisma` từ Prisma 7).

**Auth qua hai origin.** FE (`:3000`) và API (`:3001`) khác origin nên:

- **Access token** sống trong memory của FE (không localStorage — giảm thiệt hại nếu có XSS), TTL 15 phút, gửi qua header `Authorization: Bearer`.
- **Refresh token** là chuỗi random opaque trong cookie `httpOnly` + `SameSite=None; Secure`, path `/auth`. JS của FE không đọc được nó.
- DB chỉ lưu **sha256** của refresh token, không bao giờ lưu bản gốc.
- **Rotation:** mỗi lần refresh thì token cũ bị revoke và `replaced_by_id` trỏ sang token mới.
- **Reuse detection:** nếu một token đã revoke lại được dùng → coi như bị đánh cắp → revoke **toàn bộ family** (tất cả token sinh ra từ cùng một lần login), buộc login lại.
- CORS: chỉ cho phép đúng `WEB_ORIGIN`, `credentials: true`. Không dùng wildcard vì có cookie.

**Bảo mật.** Password hash bằng **argon2id**. Mọi query lọc theo `userId` (chống IDOR) — với resource không thuộc user thì trả **404** chứ không phải 403, để không tiết lộ resource đó có tồn tại. Validate file upload: loại, kích thước, số dòng.

---

## 7. Tiêu chí kỹ thuật (Acceptance)

- Import một file CSV và một file Excel thật → ra giao dịch đúng, đúng chiều thu/chi.
- Import lại file chồng kỳ → **không** phát sinh bản trùng.
- **Hai giao dịch giống hệt nhau trong cùng ngày → giữ cả hai** (không bị dedupe ăn mất).
- Preview: đóng tab rồi quay lại vẫn thấy batch pending với danh mục đã sửa.
- Dashboard hiển thị đúng tổng thu/chi + biểu đồ theo danh mục và theo tháng; giao dịch ngày 01 và ngày cuối tháng xếp đúng tháng.
- Vượt ngân sách → có cảnh báo.
- Có test cho parser, normalizer, dedupe, và stats aggregation.
- IDOR: user A không truy cập được resource của user B (404).
- Deploy chạy được trên free tier: web trên Vercel, api trên Render, DB trên Neon — tổng 0đ.
- FE gọi được API qua CORS với cookie (không lỗi preflight, refresh cookie được set và gửi lại đúng).
- Dùng lại refresh token đã revoke → toàn bộ family bị revoke, phải login lại.

---

## 8. Hướng mở rộng

PDF parser cho sao kê PDF · LLM insight ("tháng này tiêu cà phê nhiều hơn 40%") · giao dịch định kỳ (cron — API là process long-running nên làm được ngay, không cần hạ tầng thêm) · multi-currency (lúc đó chuyển sang minor units + currency code) · export báo cáo PDF · auto-categorize bằng ML thay rule · mobile client dùng chung API (`packages/shared` đã sẵn contract).

---

## 9. ADR — các quyết định và lý do

### 9.1. Tách FE/BE thành hai app, không gộp vào một Next.js

Đây là quyết định đã lật một lần, nên ghi lại cả hai chiều.

**Lập luận cho việc gộp** (v2 của tài liệu này): ràng buộc là 0đ tuyệt đối và app phải dùng được hàng ngày. Không nền tảng nào còn cho chạy Node backend always-on miễn phí — Railway bỏ free tier từ 2023, Render free sleep sau 15 phút idle với spin-up ~1 phút. Phần khó về kỹ thuật của dự án là import pipeline / dedupe / SQL aggregation, không phải boilerplate DI của NestJS. Gộp lại thì được: một deploy, không CORS, cookie session chạy đúng, Zod share miễn phí.

**Lý do vẫn chọn tách:** mục tiêu của dự án không chỉ là cái app — nó còn là hiện vật cho phỏng vấn. Một backend NestJS độc lập với thiết kế API rõ ràng là thứ kể được, và ranh giới FE/BE thật buộc mọi contract phải tường minh thay vì lẫn vào import trực tiếp.

**Cái giá, nói thẳng:** Render free sleep 15 phút → mỗi tối mở app phải chờ ~60s cho request đầu. Đây là xung đột thật với mục tiêu "dùng hàng ngày", và nó được chấp nhận có ý thức, không phải bỏ qua. Xem ADR 9.9 cho đường thoát.

**Điều làm cho quyết định này không đắt:** kiến trúc code giống hệt nhau dù deploy kiểu nào. `apps/api` là NestJS thường, nên chuyển giữa Render (long-running) và serverless chỉ là đổi entry point, không đụng domain layer. Việc tách hay gộp là quyết định muộn và rẻ — điều đắt là data model, và phần đó đã chốt độc lập với chuyện này.

### 9.2. Không dùng `xlsx` từ npm

Bản `xlsx` trên npm registry dừng ở 0.18.5 và có CVE severity cao (ReDoS, prototype pollution) **không có fix trên npm** — SheetJS chuyển sang phát hành qua CDN riêng. Đây là app parse file do người dùng upload, tức đúng đường tấn công.

`exceljs` là lựa chọn hiển nhiên tiếp theo, nhưng **cũng không sạch**. Đã đo, không phỏng đoán:

| | transitive deps | vuln do nó kéo vào |
| :--- | ---: | :--- |
| `exceljs` 4.4.0 | **76** | archiver, archiver-utils, glob, minimatch, readdir-glob, rimraf, zip-stream, uuid — **không có fix tiến lên** (npm gợi ý downgrade về 3.4.0) |
| `read-excel-file` 9.3.5 | **6** | không có |

Bỏ `exceljs` làm tổng vuln của repo giảm **22 → 14**, và 14 cái còn lại đều là dev/build-time (eslint, `@nestjs/cli`, `next → postcss/sharp`). Nghĩa là đường runtime chạm file do người dùng upload không còn lỗ hổng nào được biết.

Lý do gốc của khoảng cách 76 vs 6: ta chỉ cần **đọc** .xlsx, còn `exceljs` là thư viện đọc-ghi-styling đầy đủ. Phần "ghi" là chỗ kéo `archiver`, và `archiver` là chỗ phát sinh gần hết số vuln — tức ta đang trả giá bảo mật cho tính năng không dùng.

**Chọn: `read-excel-file`** (`XlsxParser` dùng entry `read-excel-file/node`). Có test chạy trên một file .xlsx thật trong `__fixtures__`.

Nguyên tắc rút ra: chọn thư viện theo **quyền hạn tối thiểu cần dùng**, không theo độ phổ biến. Bề mặt tấn công của một dependency tỉ lệ với những gì nó *có thể* làm, không phải những gì ta gọi.

### 9.3. `BigInt` thay `Decimal(14,2)`

VND không có đơn vị nhỏ hơn đồng → hai chữ số thập phân luôn là `.00`, và toàn bộ chi phí của decimal library là vô nghĩa. Số nguyên cho phép cộng/trừ chính xác tuyệt đối. `Int` của Postgres tối đa ~2.1 tỷ nên không đủ biên; `BigInt` thừa sức. Đánh đổi: `JSON.stringify` không serialize BigInt → convert ở một chỗ (`lib/money.ts`).

### 9.4. `amount` luôn dương + `type`, không dùng dấu

v1 có cả `amount` mang dấu **và** `type` enum — hai field mã hoá cùng một thông tin, có thể mâu thuẫn (`type: expense` với `amount: +50000`), và mọi aggregation phải đoán tin field nào. Một nguồn chân lý: `amount > 0` (CHECK constraint) + `type`. Aggregation tường minh, không bug dấu, và diễn đạt được hoàn tiền (refund = `income` trong category thuộc nhóm chi).

### 9.5. `DATE` thay timestamptz

v1 định "lưu UTC, hiển thị ICT". Với ICT = UTC+7, giao dịch 01/08 00:30 ICT lưu UTC thành 31/07 17:30 → `date_trunc('month')` xếp vào tháng 7. Mọi query sau đó phải nhớ `AT TIME ZONE 'Asia/Ho_Chi_Minh'`; quên một chỗ là lệch số liệu đúng ở ranh giới tháng. Sao kê cho ngày lịch chứ không phải instant → `DATE` làm cả lớp bug này biến mất.

### 9.6. Staging table thay preview in-memory

v1 nói `POST /imports` không ghi DB nhưng trả `batchId` tạm. Request confirm là request HTTP khác trên serverless instance khác — không có bộ nhớ chung, nên `batchId` tạm không trỏ vào đâu. Ba phương án: staging table, client giữ rows và POST lại, hay ghi thẳng `Transaction` với `status=pending`.

Chọn staging table: preview state bền (đóng tab quay lại vẫn còn), và `Transaction` không bao giờ chứa dòng chưa confirm nên không query stats nào cần nhớ filter `status` — tránh hẳn một họ bug thống kê.

### 9.7. JWT access + refresh token, không phải cookie session

ADR này cũng đã lật, và lý do lật đáng ghi lại: **quyết định ban đầu có điều kiện, rồi điều kiện mất.**

v2 chọn cookie session với lập luận "FE và BE cùng origin nên cookie httpOnly là lựa chọn đúng, còn JWT + refresh rotation chỉ cần khi có mobile client hoặc cross-domain". Lập luận đó không sai — nhưng tiền đề "cùng origin" biến mất khi ADR 9.1 chọn tách. Với hai origin khác nhau, cookie session cần `SameSite=None` cộng CORS credentials cộng xử lý cross-site, tức mất gần hết cái đơn giản vốn là lý do chọn nó.

Nên: JWT access token (memory, 15 phút) + refresh token opaque (httpOnly cookie, 30 ngày). Chi tiết ở §6.

Điều **không** thay đổi là lo ngại ban đầu: tự viết refresh rotation là bề mặt lỗi bảo mật lớn. Nên nó được implement đầy đủ chứ không làm nửa vời — token family, rotation, reuse detection, revocation, và chỉ lưu hash. Một refresh flow chỉ có "cấp token mới khi token cũ còn hạn" thì tệ hơn không có refresh token, vì nó tạo cảm giác an toàn mà không có cơ chế thu hồi.

### 9.8. `seq` trong dedupe hash, và vì sao KHÔNG dùng `balance`

Hash `(date, amount, description)` đơn thuần biến hai giao dịch hợp lệ giống nhau thành "trùng" và xoá âm thầm một cái. Đây là tình huống chắc chắn xảy ra với chi tiêu thật (hai lần cà phê cùng ngày), không phải edge case. Nên cần thêm discriminator.

Bản đầu của ADR này chọn `balance` (số dư sau giao dịch) làm discriminator ưu tiên, vì nó gần như duy nhất tuyệt đối. **Đã bỏ, và lý do đáng ghi lại.**

`balance` chia không gian hash làm hai phần rời nhau: dòng từ sao kê có balance, giao dịch nhập tay thì không. Hệ quả cụ thể — người dùng nhập tay "cà phê 25k ngày 15/7", sau đó import sao kê chứa đúng giao dịch đó, và nhận về **hai bản**. Đó là loại trùng dễ thấy nhất và khó hiểu nhất đối với người dùng, vì họ biết rõ mình chỉ uống một ly.

Dùng `seq` cho **cả hai** đường thì chúng chung một không gian hash, và dedupe xuyên được giữa nhập tay và import. Chi tiết công thức ở §4; đã có test cho đúng tình huống này.

`balance` vẫn được lưu — chỉ là không tham gia hash. Nó hữu ích để đối chiếu khi nghi parser đọc sai cột.

Nguyên tắc rút ra: discriminator chính xác hơn nhưng **chỉ có ở một nguồn dữ liệu** thì tệ hơn discriminator thô hơn nhưng có ở mọi nguồn.

### 9.9. Cold start của Render: biết trước, và có đường thoát

ADR 9.1 chấp nhận Render free sleep 15 phút. Ghi lại ở đây các lựa chọn khi cái giá đó trở nên không chịu được, để lúc đó không phải suy nghĩ lại từ đầu:

1. **Deploy `apps/api` lên Vercel serverless** (một Vercel project thứ hai). Vẫn 0đ, vẫn hai origin, vẫn NestJS — chỉ thêm một entry point wrap Nest app thành handler. Cold start còn ~1s thay vì ~60s. Đánh đổi: quay lại giới hạn 4.5MB body / 60s timeout, và mất khả năng chạy cron/queue trong process.
2. **Trả ~$5/tháng** cho Fly.io hoặc một VPS. Hết cold start, không giới hạn serverless. Đây là câu trả lời sạch nhất và cũng là lý do nó được liệt kê — "0đ" là ràng buộc tự đặt, không phải định luật.
3. **Ping định kỳ để giữ thức** — cố tình *không* chọn. Nó lách quota của nhà cung cấp, đốt 750 instance-hours/tháng của Render vào việc không làm gì, và vẫn chết khi hết giờ. Giải pháp giả.

Điều làm cả ba đường này đều rẻ: `apps/api` không phụ thuộc vào cách nó được host. Domain layer không biết mình đang chạy trong `main.ts` hay trong một serverless handler.
