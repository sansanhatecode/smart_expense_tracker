# Deploy

| Phần | Nền tảng |
| :--- | :--- |
| `apps/web` | Vercel |
| `apps/api` | Render |
| Postgres | Neon |

Config đã có trong repo: [render.yaml](render.yaml) (blueprint cho api),
[apps/web/vercel.json](apps/web/vercel.json) (build command cho monorepo).

---

## Bản deploy đang chạy

| | |
| :--- | :--- |
| Web | https://expense-tracker-nine-lovat-73.vercel.app |
| API | https://expense-tracker-api-6znm.onrender.com (`srv-d9oqk27qj5pc73871kh0`) |
| DB | Neon `expense-tracker-db`, plan `free_v3`, `ap-southeast-1` |

Nó **không** được dựng bằng blueprint như mục dưới, vì `console.neon.tech` không
load được trong browser lúc đó. Đường đã dùng thật, ghi lại để lần sau không phải
mò lại: Neon được provision qua **Vercel Marketplace**, tức không cần vào console
Neon lần nào.

```bash
vercel integration add neon --plan free_v3 -m region=sin1 -m auth=false \
  --name expense-tracker-db --no-env-pull
```

Nó set sẵn `DATABASE_URL` (pooled) và `DATABASE_URL_UNPOOLED` (direct) trên project
Vercel — đúng hai thứ `DIRECT_URL` cần. Lấy ra bằng
`vercel env pull <file> --environment=production`, rồi truyền vào Render.

Service Render được tạo bằng `render services create` với đúng các flag tương ứng
`render.yaml` (CLI không đọc được `render.yaml`; `render blueprints` chỉ validate).

Hai chỗ CLI **không** làm được, phải bấm tay:

- **Accept marketplace terms** của Neon: một lần, trên `vercel.com`.
- **Sửa env var của service Render**: `render services update` không có flag
  env-var. Phải vào [dashboard](https://dashboard.render.com/web/srv-d9oqk27qj5pc73871kh0/env)
  hoặc gọi `PUT /v1/services/{id}/env-vars/{key}` của API Render.

**Web đã nối Git.** Cài Vercel GitHub App rồi chạy `vercel git connect` — giờ push
lên `main` thì **cả api và web tự deploy**, không cần `vercel deploy --prod` tay
nữa.

CI (`ci.yml`) và hai CD này chạy **độc lập, không cái nào đợi cái nào**: Render và
Vercel deploy trực tiếp từ event push, không đợi GitHub Actions pass. Một commit
làm fail lint/typecheck/test vẫn có thể đã lên production ở cả hai nơi trước khi
Actions kịp báo đỏ.

Nối Git cũng kéo theo preview deployment cho branch/PR khác `main` — URL random,
và **không gọi được API** vì `WEB_ORIGIN` trên Render chỉ whitelist origin
production (xem mục 4 "Nối hai đầu lại"). Với project một mình dùng thì bỏ qua
được, chỉ cần biết để không tưởng preview bị lỗi.

---

## 1. Neon — tạo database

Cách này cần `console.neon.tech` load được. Không load được thì dùng đường
Marketplace ở mục trên.

1. [console.neon.tech](https://console.neon.tech) → đăng ký bằng GitHub.
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

1. [dashboard.render.com](https://dashboard.render.com) → đăng ký bằng GitHub.
2. **New → Blueprint** → chọn repo `smart_expense_tracker`. Render đọc
   `render.yaml`, không phải tự điền build command.
3. Render hỏi ba biến (`sync: false` trong blueprint):

   | Biến | Giá trị |
   | :--- | :--- |
   | `DATABASE_URL` | chuỗi **pooled** ở bước 1 |
   | `DIRECT_URL` | chuỗi **direct** ở bước 1 |
   | `WEB_ORIGIN` | `https://<tên-project>.vercel.app` — đoán trước, sửa lại ở bước 4 |

   `JWT_ACCESS_SECRET` Render tự sinh, không phải làm gì.

   **Đừng quên hai biến OPTIONAL của nút "Báo lỗi".** Chúng không có trong
   `render.yaml` vì app thiếu chúng vẫn chạy — và chính vì thế rất dễ sót. Sót thì
   `POST /api/feedback` trả 503 "chưa được cấu hình", còn mọi thứ khác vẫn xanh:

   | Biến | Giá trị |
   | :--- | :--- |
   | `GITHUB_ISSUE_REPO` | `sansanhatecode/smart_expense_tracker` |
   | `GITHUB_ISSUE_TOKEN` | fine-grained PAT, **chỉ** repo này, **chỉ** quyền Issues: Read and write |

   Service dùng label `bug` và `enhancement` (xem `issue-body.ts`) — đó là label
   mặc định của repo GitHub, nhưng xoá đi thì GitHub trả 422.

4. Apply. Build ~3–5 phút. Nó chạy `migrate deploy` nên schema được tạo luôn —
   không cần seed: đăng ký user là tự có 15 danh mục + 108 rule.
5. Ghi lại URL, dạng `https://expense-tracker-api-xxxx.onrender.com`.
6. Kiểm tra: `curl https://<api>.onrender.com/health` → `{"status":"ok","database":"ok",...}`.
   Nếu `database` không "ok" thì `DATABASE_URL` sai, không phải app sai.

---

## 3. Vercel — deploy web

1. [vercel.com/new](https://vercel.com/new) → import repo, plan **Hobby**.
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

## Hai thứ nên biết trước

**Cold start ~1 phút.** Render free sleep sau 15 phút idle, nên request đầu
tiên sau khoảng nghỉ đó phải chờ container khởi động lại. Đường thoát nếu cold
start này không chấp nhận được: chuyển `apps/api` sang chạy trên nền serverless
(ví dụ Vercel Functions) — cold start khi đó chỉ còn ~1 giây. Ping định kỳ để
giữ container thức không giải quyết được vấn đề: nó chỉ trì hoãn cold start,
không loại bỏ được.

**Safari và Brave sẽ không giữ được đăng nhập.** Web ở `vercel.app`, api ở
`onrender.com` là hai site khác nhau, nên refresh cookie là third-party cookie.
Safari chặn third-party cookie mặc định từ 2020, Brave cũng vậy. Hệ quả: login
xong dùng bình thường, nhưng reload trang là mất session, phải login lại.
Chrome, Edge và Firefox thì không sao (Firefox partition cookie theo top-level
site, và partition đó nhất quán nên vẫn chạy).

Cách sửa, khi nào cần:

1. **Custom domain**: web `app.domain.com`, api `api.domain.com` → cùng site,
   hết vấn đề.
2. **Proxy api qua chính Next.js** (rewrite trong `next.config.ts`) → browser chỉ
   thấy một origin, cookie thành first-party. Phải sửa `NEXT_PUBLIC_API_URL` và
   `path` của refresh cookie (đang là `/auth`).

---

## Deploy lần sau

```bash
git push    # api và web đều tự build và deploy lại
```

Không cần `vercel deploy --prod` tay nữa — xem mục "Bản deploy đang chạy" ở trên
về việc web đã nối Git. Lệnh đó vẫn dùng được nếu cần trigger deploy web mà không
đợi một push mới (chạy từ ROOT repo, không phải `apps/web` — Root Directory của
project là `apps/web`, nên upload từ trong `apps/web` sẽ thành
`apps/web/apps/web`).

Migration mới được `migrate deploy` chạy trong buildCommand của Render, không phải
làm tay. Migration lỗi thì build fail và Render giữ nguyên bản đang chạy — code mới
không bao giờ gặp schema chưa kịp đổi.

Đổi `NEXT_PUBLIC_API_URL` thì phải deploy lại web mới có tác dụng: nó được nhúng
vào bundle lúc build, không đọc lúc chạy.
