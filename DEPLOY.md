# Deploy — 0đ, không thẻ

| Phần | Nền tảng | Free plan |
| :--- | :--- | :--- |
| `apps/web` | Vercel Hobby | 100 GB bandwidth, 1M request, 100 phút build / tháng |
| `apps/api` | Render free web service | 750 instance-hours / tháng, sleep sau 15 phút idle |
| Postgres | Neon free | 0.5 GB / project, 100 CU-hours / tháng, vĩnh viễn (không phải trial) |

Lý do chọn ba chỗ này: §9.1 của [spec](expense-tracker-technical-spec.md). Đường
thoát khi cold start của Render trở nên không chịu được: ADR 9.9.

**Không chỗ nào cần thẻ.** Xem [Vì sao không phát sinh phí](#vì-sao-không-phát-sinh-phí)
ở dưới trước khi bấm gì.

Config đã có trong repo: [render.yaml](render.yaml) (blueprint cho api),
[apps/web/vercel.json](apps/web/vercel.json) (build command cho monorepo).

---

## 1. Neon — tạo database

1. [console.neon.tech](https://console.neon.tech) → đăng ký bằng GitHub, **không nhập thẻ**.
2. Create project: region **Singapore** (gần VN nhất), Postgres 16+.
3. Ở **Connection string**, lấy **hai** chuỗi:

| Lấy ở đâu | Dùng làm | Đặc điểm |
| :--- | :--- | :--- |
| Connection string mặc định (có **Pooled connection** bật) | `DATABASE_URL` | host chứa `-pooler` |
| Tắt **Pooled connection** | `DIRECT_URL` | host **không** có `-pooler` |

Cả hai phải giữ `?sslmode=require&channel_binding=require`.

> Vì sao cần cả hai: `prisma migrate deploy` không chạy được qua pooler. Xem
> [apps/api/prisma.config.ts](apps/api/prisma.config.ts).

**Đừng dùng Postgres free của Render** — nó hết hạn và bị xoá sau 30 ngày. Neon
free thì không hết hạn.

---

## 2. Render — deploy api

1. [dashboard.render.com](https://dashboard.render.com) → đăng ký bằng GitHub, **không nhập thẻ**.
2. **New → Blueprint** → chọn repo `smart_expense_tracker`. Render đọc
   `render.yaml`, không phải tự điền build command.
3. Render hỏi ba biến (`sync: false` trong blueprint):

   | Biến | Giá trị |
   | :--- | :--- |
   | `DATABASE_URL` | chuỗi **pooled** ở bước 1 |
   | `DIRECT_URL` | chuỗi **direct** ở bước 1 |
   | `WEB_ORIGIN` | `https://<tên-project>.vercel.app` — đoán trước, sửa lại ở bước 4 |

   `JWT_ACCESS_SECRET` Render tự sinh, không phải làm gì.

4. Apply. Build ~3–5 phút. Nó chạy `migrate deploy` nên schema được tạo luôn —
   không cần seed: đăng ký user là tự có 15 danh mục + 108 rule.
5. Ghi lại URL, dạng `https://expense-tracker-api-xxxx.onrender.com`.
6. Kiểm tra: `curl https://<api>.onrender.com/health` → `{"status":"ok","database":"ok",...}`.
   Nếu `database` không "ok" thì `DATABASE_URL` sai, không phải app sai.

---

## 3. Vercel — deploy web

1. [vercel.com/new](https://vercel.com/new) → import repo, plan **Hobby**, **không nhập thẻ**.
2. **Root Directory** = `apps/web`. Bắt buộc. Vercel sẽ tự nhận npm workspaces và
   cài dependency ở root repo.
3. Environment variable:

   | Biến | Giá trị |
   | :--- | :--- |
   | `NEXT_PUBLIC_API_URL` | URL Render ở bước 2, **không** có dấu `/` cuối |

   Phải đặt **trước** khi build: `NEXT_PUBLIC_*` được nhúng vào bundle lúc build,
   đổi sau thì phải redeploy mới có tác dụng.
4. Deploy. Build command đã nằm trong `apps/web/vercel.json` — nó build
   `@expense/shared` trước, vì web import package đó từ `dist/` và `dist/` không
   nằm trong git.

---

## 4. Nối hai đầu lại

Về Render → **Environment** → sửa `WEB_ORIGIN` thành URL production thật của
Vercel. Lưu là Render tự redeploy.

Sai bước này thì biểu hiện rất dễ nhận: web load được nhưng mọi request chết ở
preflight CORS.

**Preview deployment của Vercel không gọi được API** — mỗi preview có URL random,
không nằm trong `WEB_ORIGIN`. `WEB_ORIGIN` nhận nhiều origin cách nhau bằng dấu
phẩy nếu cần, nhưng với project cá nhân thì chỉ production là đủ.

---

## 5. Kiểm tra thật

```bash
curl https://<api>.onrender.com/health          # database: ok
```

Rồi trên web: đăng ký → tạo một giao dịch → **reload trang**. Reload là phần đáng
kiểm nhất: nó chứng minh refresh cookie cross-site được set và gửi lại đúng.

Request đầu tiên sau 15 phút không dùng sẽ chờ ~1 phút. Đó là Render free sleep,
không phải lỗi.

---

## Vì sao không phát sinh phí

Không nhập thẻ ở cả ba nền tảng. Cả ba đều **dừng chạy** khi hết quota, không có
overage billing:

| | Khi hết quota |
| :--- | :--- |
| Vercel Hobby | Project pause tới chu kỳ sau. Không tính tiền vượt — Hobby không có overage. |
| Render free | Service suspend tới đầu tháng sau. Service đang sleep **không** tiêu instance-hours, nên 750h/tháng gần như không thể hết với một service. |
| Neon free | Compute suspend tới chu kỳ sau. |

Hai điều duy nhất có thể sinh phí, và cả hai đều phải do bạn tự bấm:

1. **Nâng plan.** Đừng. Render free service không tự lên plan trả tiền.
2. **Vercel Hobby chỉ cho phi thương mại.** App quản lý chi tiêu cá nhân thì đúng
   điều khoản. Nếu sau này nó thu tiền của ai đó thì phải lên Pro ($20/tháng) —
   đấy là lúc quyết định lại, không phải bây giờ.

Neon free là plan vĩnh viễn, không phải trial 30 ngày.

---

## Ba thứ nên biết trước

**Cold start ~1 phút.** Render free sleep sau 15 phút idle. Đã biết và chấp nhận
từ ADR 9.1; ADR 9.9 ghi sẵn các đường thoát (đưa api lên Vercel serverless →
cold start ~1s, vẫn 0đ). Ping định kỳ để giữ thức là giải pháp giả — xem 9.9.

**Safari và Brave sẽ không giữ được đăng nhập.** Web ở `vercel.app`, api ở
`onrender.com` là hai site khác nhau, nên refresh cookie là third-party cookie.
Safari chặn third-party cookie mặc định từ 2020, Brave cũng vậy. Hệ quả: login
xong dùng bình thường, nhưng reload trang là mất session, phải login lại.
Chrome, Edge và Firefox thì không sao (Firefox partition cookie theo top-level
site, và partition đó nhất quán nên vẫn chạy).

Cách sửa, khi nào cần:

1. **Custom domain**: web `app.domain.com`, api `api.domain.com` → cùng site,
   hết vấn đề. Mất tiền domain (~$10/năm), không còn 0đ tuyệt đối.
2. **Proxy api qua chính Next.js** (rewrite trong `next.config.ts`) → browser chỉ
   thấy một origin, cookie thành first-party. 0đ, nhưng phải sửa
   `NEXT_PUBLIC_API_URL` và `path` của refresh cookie (đang là `/auth`).

**0.5 GB DB.** Một giao dịch là vài trăm byte. Vài chục nghìn giao dịch một năm
vẫn còn cách giới hạn rất xa — hết chỗ vì dữ liệu chi tiêu cá nhân là chuyện
không xảy ra.

---

## Deploy lần sau

`git push` lên `main` → cả Vercel và Render tự build lại. Migration mới được
`migrate deploy` chạy trong buildCommand của Render, không phải làm tay.

Migration lỗi thì build fail và Render giữ nguyên bản đang chạy — code mới không
bao giờ gặp schema chưa kịp đổi.
