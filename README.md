# Smart Expense Tracker

Quản lý chi tiêu cá nhân với **auto-import từ sao kê ngân hàng** (CSV / Excel), thống kê và ngân sách.

Thiết kế và các quyết định kỹ thuật: [expense-tracker-technical-spec.md](expense-tracker-technical-spec.md) — mục §9 là ADR, ghi lại lý do của từng lựa chọn, gồm cả những quyết định đã bị lật và vì sao.

---

## Yêu cầu

| | Phiên bản dùng khi phát triển |
| :--- | :--- |
| Node.js | 24 (cần ≥ 20) |
| Docker | để chạy Postgres local |
| npm | 11 (workspaces) |

---

## Chạy lần đầu

```bash
npm ci                 # cài dependency theo lockfile
npm run setup          # tạo apps/api/.env và apps/web/.env.local, sinh sẵn secret
npm run db:up          # Postgres trong Docker, port 5433
npm run db:migrate     # tạo schema
npm run dev            # chạy cả 3 process
```

Mở **http://localhost:3000**.

`npm run setup` không ghi đè file `.env` đã có, nên chạy lại nhiều lần vẫn an toàn.

> **Port 5433, không phải 5432** — để không đụng Postgres nào khác đang chạy trên máy.

---

## Ba process

`npm run dev` chạy đồng thời:

| | Port | Là gì |
| :--- | :--- | :--- |
| `shared` | — | `tsc --watch` cho `packages/shared`; **api và web đọc từ `dist/`** nên nó phải chạy |
| `api` | 3001 | NestJS, hot reload |
| `web` | 3000 | Next.js |

Chạy riêng từng cái khi cần: `npm run dev:api`, `npm run dev:web`, `npm run dev:shared`.

Nếu `api` báo không tìm thấy `@expense/shared`, chạy `npm run build -w @expense/shared` một lần.

---

## Các lệnh khác

```bash
# Kiểm tra
npm run typecheck      # tsc cho cả 3 workspace
npm test               # unit test (88 test: parser, dedupe, money…)
npm run test:e2e       # e2e API (191 check, tự khởi động API và reset DB)

# Database
npm run db:studio      # Prisma Studio
npm run db:reset       # xoá và migrate lại — MẤT HẾT DỮ LIỆU
npm run db:down        # dừng container Postgres

# Build production
npm run build
```

### Về `npm run test:e2e`

Nó tự khởi động **hai** instance API:

- `:3001` với rate limit nâng cao → các suite chức năng
- `:3002` với rate limit thật (10/phút) → suite kiểm rate limit

Lý do: mỗi suite đăng ký vài user, chạy liên tiếp sẽ vượt giới hạn thật rồi nhận 429 ở mọi request sau — tức suite thất bại vì rate limit chứ không vì bug. Nới giới hạn trong code thì mất luôn thứ cần kiểm, nên tách hai instance.

---

## Cấu trúc

```
apps/
  api/                 NestJS  :3001
    prisma/            schema + migrations
    src/
      auth/            JWT access + refresh token (rotation, reuse detection)
      categories/      danh mục + rule auto-categorize
      transactions/    CRUD + filter
      imports/         ← phần khó nhất của dự án
        parsers/       CsvParser, XlsxParser
        table-parser   nhận hàng header, nhận cột, đọc dòng (dùng chung 2 parser)
        dedupe         chống trùng khi import lại  (xem ADR 9.8)
        normalizer     sao kê → dạng DB (amount dương + type)
        categorizer    gán danh mục theo keyword
      stats/           aggregation bằng SQL
      budgets/         ngân sách + cảnh báo
    test/              e2e bằng shell script, chạy trên API + DB thật
  web/                 Next.js :3000
packages/
  shared/              Zod schema + type — cả api và web import từ đây
```

`packages/shared` là thứ giữ lại type-safe end-to-end sau khi tách FE/BE: cả hai đầu import **cùng một** Zod schema, nên contract lệch là lỗi compile chứ không phải lỗi runtime.

---

## Trạng thái

**Backend: xong đủ spec.** 191 e2e + 88 unit test.

| | |
| :--- | :--- |
| Auth | JWT access (memory) + refresh (httpOnly cookie), rotation, reuse detection → revoke cả family, argon2id |
| Danh mục | CRUD + rule keyword; đăng ký tạo sẵn 15 danh mục và 108 rule theo cách chi tiêu ở VN |
| Giao dịch | CRUD, filter, phân trang, gán danh mục hàng loạt |
| Import | CSV + XLSX → preview → confirm → rollback; import lại file chồng kỳ không sinh bản trùng |
| Thống kê | tổng quan (kèm kỳ trước), theo danh mục, theo thời gian — aggregation ở DB |
| Ngân sách | theo danh mục/tháng + cảnh báo ngưỡng |

**Frontend: đang làm.** Hiện chỉ có trang trạng thái để xác nhận web nối được với api. Design token đã dựng với bảng màu đã qua validator.

---

## Vài điều đáng biết trước khi đọc code

Chi tiết ở §9 của spec, nhưng ba điều hay gây bất ngờ nhất:

**Tiền là `BigInt` số nguyên VND, luôn dương.** Không dùng `Decimal`: đồng không có đơn vị nhỏ hơn nên hai chữ số thập phân luôn là `.00`. Chiều thu/chi nằm ở cột `type`, không nằm ở dấu của số tiền. CHECK constraint trong DB chặn số ≤ 0.

**`date` là `DATE`, không phải timestamptz.** Sao kê ngân hàng nói về ngày lịch, không phải một thời điểm. Lưu UTC rồi hiển thị theo giờ VN sẽ đẩy giao dịch 01/08 00:30 ICT về tháng 7 khi `date_trunc` xử lý.

**Import ghi vào bảng staging, không ghi thẳng `Transaction`.** Nhờ vậy không query thống kê nào cần nhớ filter theo status, và preview state sống qua được việc đóng tab.
