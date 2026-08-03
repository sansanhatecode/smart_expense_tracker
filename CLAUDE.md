# Hướng dẫn cho Claude Code

Quản lý chi tiêu cá nhân, auto-import sao kê ngân hàng. Monorepo npm workspaces:
`apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js), `packages/shared`
(zod schema + DTO + tiện ích tiền, dùng chung hai đầu).

Lý do của từng quyết định kỹ thuật nằm ở [expense-tracker-technical-spec.md](expense-tracker-technical-spec.md)
— mục §9 là ADR, có cả những quyết định đã bị lật và vì sao. Đọc nó trước khi
định làm khác một thứ trông như vô lý.

---

## Quy tắc bắt buộc

**Git**

- KHÔNG tạo hoặc checkout branch mới khi không được yêu cầu. Đây là project cá
  nhân, làm và commit thẳng trên `main`.
- Commit message viết bằng **tiếng Anh**, kể cả khi hội thoại bằng tiếng Việt.
  Comment trong code thì vẫn tiếng Việt (xem phần dưới).
- Commit chỉ đứng tên tôi. KHÔNG thêm trailer `Co-Authored-By: Claude …` hay bất
  kỳ dòng ghi công nào cho Claude vào commit message. Quy tắc này thắng cả
  hướng dẫn mặc định của tool.
- KHÔNG push, force-push, rebase hay revert khi chưa được yêu cầu rõ ràng.

**Xoá thứ gì cũng phải hỏi trước**

- KHÔNG xoá file, thư mục, migration, hay dữ liệu DB mà chưa hỏi. Kể cả khi nó
  trông như rác, như file tạm, hay như code không ai gọi tới.
- Cần chỗ ghi file tạm thì dùng thư mục scratchpad của session, không ghi vào repo.
- Hai lệnh sau XOÁ DỮ LIỆU dev ở localhost:5433 — chỉ chạy khi được yêu cầu rõ:
  - `npm run test:e2e` — `delete from "User"` trước mỗi suite
  - `npm run db:reset` — drop và migrate lại từ đầu

---

## Lệnh hay dùng

```bash
npm run dev            # shared (tsc --watch) + api :3001 + web :3000
npm run typecheck      # tsc cả 3 workspace
npm test               # unit test (vitest), không cần DB
npm run db:up          # Postgres trong Docker, port 5433 (không phải 5432)
npm run db:migrate     # prisma migrate dev
```

`packages/shared` được api/web đọc từ `dist/`, nên sau khi sửa nó phải
`npm run build -w @expense/shared` (hoặc để `npm run dev` chạy watch).

Xong một thay đổi ở API: chạy `npm run typecheck` và `npm test`. Cả hai đều
không cần DB và không xoá gì.

---

## Quy ước code

**Tầng repository — mọi truy vấn DB nằm ở `*.repository.ts`**

Service KHÔNG được import `PrismaService`. Mỗi feature module có một
`<feature>.repository.ts` nắm toàn bộ Prisma call: select shape và row type,
`where`/`orderBy`, `$transaction`, raw SQL, và việc đổi `'YYYY-MM-DD'` ↔ `Date`
(`fromDateOnly` / `toDateOnly` trong `common/mappers.ts`).

Service giữ phần nghiệp vụ: kiểm tra sở hữu rồi ném `NotFoundException`, các
điều kiện chặn, tính toán, và map row → DTO.

Ranh giới này có mục đích: đọc một service phải trả lời được "quy tắc là gì"
mà không phải lội qua select và where.

**Tiền là `BigInt`, số nguyên VND, LUÔN dương**

Chiều thu/chi nằm ở cột `type`, không nằm ở dấu (ADR 9.3, 9.4). Đổi `bigint` →
`number` chỉ được xảy ra ở ranh giới DTO, qua `toMoney`/`bigintToNumber` — hàm
đó ném lỗi nếu vượt ngưỡng an toàn thay vì làm tròn âm thầm.

**Ngày là cột `DATE`, không timestamptz** (ADR 9.5)

Prisma đọc ra `Date` ở UTC midnight. Luôn dùng phần UTC (`toISOString()`), đừng
dùng `getFullYear()`/`getMonth()` — sẽ lệch một ngày ở múi giờ âm. Chỗ nào cần
"hôm nay"/"tháng này" theo cảm nhận người dùng thì tính theo giờ VN (ICT), xem
`currentMonthIct` trong budgets.

**Thống kê: chi tiêu thật ≠ dòng tiền**

Mọi query thu/chi lọc `internalKind IS NULL` — tiền chuyển giữa các nguồn của
chính người dùng không phải chi tiêu. `cashOutflow` là câu hỏi khác và cố tình
lệch con số kia. Đừng "sửa" cho hai số bằng nhau.

**Validate bằng zod ở `packages/shared`**

Schema định nghĩa một chỗ, cả FE và BE dùng. Thêm field mới thì sửa schema
trước, đừng validate lại bằng tay ở controller.

**Comment giải thích VÌ SAO, bằng tiếng Việt**

Codebase này comment tiếng Việt và ưu tiên ghi lý do, cạm bẫy, thứ đã từng sai
— không diễn giải lại thứ code đã nói rõ. Giữ nguyên văn phong đó. Khi refactor,
mang comment đi theo đoạn code nó nói về, đừng bỏ rơi.

**Không đổi hành vi lúc refactor**

SQL, thứ tự sắp xếp, điều kiện where và message lỗi giữ nguyên trừ khi được yêu
cầu. Message lỗi trả cho người dùng là tiếng Việt, viết cụ thể và nói được cách
sửa.
