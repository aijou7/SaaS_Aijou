# Deployment Beta: Vercel + Neon

Dokumen ini memakai alur GitHub → Vercel untuk aplikasi Next.js dan Neon untuk PostgreSQL. Jalankan langkahnya sesuai urutan agar kode baru tidak aktif sebelum schema dan secret production siap.

## Urutan aman

1. Rotate credential yang pernah terekspos dan buat backup/branch Neon.
2. Jalankan duplicate preflight pada database production.
3. Siapkan Vercel project, Blob store, domain, serta seluruh environment variable.
4. Jalankan `prisma migrate deploy` ke Neon sebelum push kode yang memakai kolom baru.
5. Jalankan seed hanya jika perlu membuat owner atau mempromosikan owner lama.
6. Push ke GitHub dan tunggu deployment Vercel selesai.
7. Jalankan smoke test untuk health, login, widget, inbox, job, storage, serta integration webhook.

## 1. Credential hygiene

Jangan paste database URL, API key, bot token, access token, callback token, atau encryption key ke chat, screenshot, issue, maupun commit.

Jika sebuah credential pernah terlihat di tempat tersebut, anggap sudah bocor dan rotate sebelum beta dibuka. Untuk Neon:

1. Reset password role/database di Neon.
2. Salin connection string baru.
3. Update `DATABASE_URL` di Vercel untuk Production, Preview bila dipakai, dan development environment yang relevan.
4. Redeploy setelah environment berubah.
5. Hapus connection string lama dari terminal history, notes, dan log yang bisa diakses orang lain.

Pastikan `.env` tetap lokal. Repository mengabaikan `.env`, `.env*.local`, dan seluruh folder `generated/`.

## 2. Siapkan Neon

Gunakan dua jenis connection string bila Neon menyediakannya:

- **Pooled URL** untuk `DATABASE_URL` runtime Vercel.
- **Direct/unpooled URL** sementara untuk `prisma migrate deploy`.

Contoh format, bukan credential asli:

```text
postgresql://ROLE:PASSWORD@HOST/DATABASE?sslmode=require
```

Sebelum migration, buat Neon branch, snapshot, atau backup yang dapat dipakai untuk recovery.

### Duplicate preflight

Migration beta membuat satu workspace per user dan satu Meta phone number ID per workspace. Jalankan query ini dari Neon SQL Editor:

```sql
SELECT "userId", COUNT(*) AS workspace_count
FROM "businesses"
GROUP BY "userId"
HAVING COUNT(*) > 1;

SELECT "phoneNumberId", COUNT(*) AS connection_count
FROM "whatsapp_settings"
WHERE "phoneNumberId" IS NOT NULL
GROUP BY "phoneNumberId"
HAVING COUNT(*) > 1;
```

Kedua query harus menghasilkan nol baris. Migration juga memiliki preflight transaction dan akan berhenti dengan pesan yang jelas jika duplikasi masih ada; tidak ada data yang dipilih atau dihapus otomatis.

Percakapan website lama dengan synthetic contact `web-*` atau `web:*` otomatis dibackfill sebagai channel website.

## 3. Siapkan Vercel

1. Import repository GitHub ke Vercel.
2. Gunakan framework preset Next.js.
3. Gunakan Node.js 22.
4. Biarkan build command memakai script repository:

```text
prisma generate && next build
```

5. Pilih Function region yang dekat dengan region Neon bila tersedia. Jarak region aplikasi dan database sangat memengaruhi latency setiap page/API yang membaca database.

### Required environment

Tambahkan ke Vercel Production sebelum deployment:

```env
DATABASE_URL="POOLED_NEON_URL"
DATABASE_POOL_MAX="5"
DATABASE_CONNECTION_TIMEOUT_MS="5000"
DATABASE_IDLE_TIMEOUT_MS="10000"

AUTH_SECRET="RANDOM_MINIMUM_32_BYTES"
WIDGET_SIGNING_SECRET="DIFFERENT_RANDOM_MINIMUM_32_BYTES"
DATA_ENCRYPTION_KEY="32_RANDOM_BYTES_AS_BASE64URL_OR_64_HEX"
CRON_SECRET="DIFFERENT_RANDOM_MINIMUM_32_BYTES"

NEXT_PUBLIC_APP_URL="https://app.example.com"
```

Buat nilai acak terpisah dengan Node, jangan memakai output yang sama untuk semua key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ketentuan penting:

- `AUTH_SECRET` dan `WIDGET_SIGNING_SECRET` minimal 32 byte dan harus berbeda.
- `DATA_ENCRYPTION_KEY` harus decode menjadi tepat 32 byte.
- `CRON_SECRET` harus sama dengan secret yang dipakai Vercel Cron untuk bearer authorization.
- `NEXT_PUBLIC_APP_URL` harus canonical HTTPS origin tanpa trailing path. Setelah custom domain berubah, update nilai ini lalu redeploy.
- Simpan backup aman `DATA_ENCRYPTION_KEY`. Jangan rotate langsung setelah credential terenkripsi tersimpan.

### Groq

```env
GROQ_API_KEY="YOUR_GROQ_KEY"
GROQ_MODEL="llama-3.1-8b-instant"
GROQ_VISION_MODEL="meta-llama/llama-4-scout-17b-16e-instruct"
```

Model availability dapat berubah. Pin model yang tersedia pada account Groq dan test text reply serta receipt extraction setelah setiap perubahan model.

### Vercel Blob

Hubungkan private Vercel Blob store ke project. Vercel akan menyediakan:

```env
BLOB_READ_WRITE_TOKEN="VERCEL_MANAGED_TOKEN"
```

Tanpa token ini, production masih dapat memproses buffer receipt dalam request yang sama, tetapi file tidak persisten setelah proses serverless selesai.

### WhatsApp Cloud API

Credential utama disarankan disimpan per workspace dari halaman `/integrations` setelah `DATA_ENCRYPTION_KEY` production aktif. Environment berikut dapat dipakai untuk bootstrap workspace awal:

```env
WHATSAPP_VERIFY_TOKEN=""
WHATSAPP_APP_SECRET=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_GRAPH_API_VERSION="v21.0"
WHATSAPP_GRAPH_API_BASE_URL="https://graph.facebook.com"
WHATSAPP_GRAPH_TIMEOUT_MS="10000"
WHATSAPP_MAX_MEDIA_BYTES="10485760"
WHATSAPP_DEFAULT_COUNTRY_CODE="62"
```

Pin Graph API version yang masih didukung oleh Meta. Jangan memakai custom Graph API base URL di production kecuali memang ada kebutuhan yang sudah direview.

### Telegram Bot API

Telegram dikonfigurasi per workspace dari `/integrations?platform=telegram`, bukan lewat shared Vercel environment variable:

1. Buat bot melalui akun resmi `@BotFather` dan ambil bot token.
2. Pastikan `NEXT_PUBLIC_APP_URL` menunjuk ke canonical HTTPS origin production dan `DATA_ENCRYPTION_KEY` sudah aktif.
3. Paste token hanya ke field rahasia di dashboard, lalu pilih hubungkan. Server memanggil `getMe` untuk validasi dan `setWebhook` untuk registrasi otomatis.
4. Webhook menggunakan path key acak dan secret header Telegram. Bot token tidak dimasukkan ke URL webhook, log, atau response aplikasi.

`TELEGRAM_API_TIMEOUT_MS` boleh diatur sebagai timeout request provider bersama (default `10000`, minimum efektif 1 detik, maksimum 30 detik). Variabel ini bukan tempat menyimpan bot token.

Endpoint yang diregistrasikan otomatis berbentuk:

```text
https://APP_DOMAIN/api/webhooks/telegram/OPAQUE_WEBHOOK_KEY
```

Scope beta adalah private DM teks. Update dari bot, group/channel, dan pesan nonteks diabaikan dengan aman. Memutus koneksi dari dashboard memanggil `deleteWebhook` dan menonaktifkan connector. Token tetap tersimpan terenkripsi serta hanya ditampilkan dalam bentuk masked agar reconnect tidak perlu paste ulang.

### Xendit

Xendit dikonfigurasi per workspace dari `/payments`. Masukkan secret key dan callback verification token milik workspace tersebut; aplikasi menyimpannya terenkripsi. Jangan menaruh credential tenant di shared Vercel environment.

Callback URL:

```text
https://APP_DOMAIN/api/webhooks/xendit
```

Mulai dari Xendit test/development mode. Buat payment link dan kirim test callback sebelum memakai production key.

## 4. Jalankan migration Neon

Lakukan ini dari checkout yang sudah berisi migration terbaru, sebelum push yang memicu auto-deploy:

```powershell
cd E:\Project\saas
$env:DATABASE_URL = Read-Host "Paste DIRECT Neon DATABASE_URL, lalu tekan Enter"
([uri]$env:DATABASE_URL).Host
npm.cmd run prisma:deploy
```

Perintah host check harus menampilkan hostname Neon, bukan `localhost`. Jangan menaruh URL database sebagai teks prompt `Read-Host`; paste URL setelah prompt muncul.

Migration tidak dijalankan otomatis dalam Vercel build agar beberapa deployment paralel tidak berebut schema lock.

Jika migration berhenti karena duplicate preflight, perbaiki data berdasarkan query di langkah 2 lalu jalankan lagi. Jangan memakai `prisma migrate dev` atau menghapus migration history pada database production.

## 5. Bootstrap atau promosikan owner

Seed production sekarang non-destruktif secara default:

- existing owner dipromosikan menjadi platform admin;
- existing password dipertahankan kecuali rotate diminta;
- existing business profile, knowledge, products, agent, dan WhatsApp settings dipertahankan;
- demo data dibuat otomatis hanya untuk workspace baru.

### Promosikan owner yang sudah ada

```powershell
$env:SEED_OWNER_EMAIL = Read-Host "Existing owner email"
$env:SEED_ROTATE_OWNER_PASSWORD = "false"
$env:SEED_REFRESH_DEMO_DATA = "false"
npm.cmd run seed
```

Untuk owner existing, password tidak perlu diberikan. Email harus sama persis dengan user yang akan dijadikan platform admin.

### Buat owner baru atau rotate password

Ambil password tanpa menaruh plaintext di command history:

```powershell
$env:SEED_OWNER_EMAIL = Read-Host "Owner email"
$securePassword = Read-Host "Strong owner password" -AsSecureString
$credential = New-Object System.Net.NetworkCredential("", $securePassword)
$env:SEED_OWNER_PASSWORD = $credential.Password
$env:SEED_ROTATE_OWNER_PASSWORD = "true"
$env:SEED_REFRESH_DEMO_DATA = "false"
npm.cmd run seed
```

Untuk database kosong, `SEED_OWNER_NAME` dan `SEED_BUSINESS_NAME` boleh diisi sebelum seed. Bila WhatsApp credential ikut dibootstrap pada database baru, shell lokal harus memakai `DATA_ENCRYPTION_KEY` yang sama dengan Vercel.

Hanya gunakan berikut jika memang ingin mengembalikan seeded business profile, knowledge, products, agent, dan WhatsApp bootstrap settings ke nilai demo:

```powershell
$env:SEED_REFRESH_DEMO_DATA = "true"
npm.cmd run seed
```

Sesudah selesai, bersihkan credential sementara dari process environment:

```powershell
Remove-Item Env:SEED_OWNER_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
```

## 6. Push dan deploy

Jalankan quality gate lokal terlebih dahulu:

```powershell
npm.cmd run prisma:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run audit:prod
npm.cmd run build
```

Lalu commit dan push:

```powershell
git status --short
git add .
git commit -m "prepare private beta release"
git push
```

`.env` dan generated Prisma client tidak boleh muncul di staged changes. Vercel akan melakukan generate Prisma client dan build; CI juga generate sebelum typecheck.

## 7. Hubungkan domain dan integration

### Custom app domain

1. Tambahkan app domain di Vercel.
2. Arahkan DNS sesuai record dari Vercel.
3. Tunggu TLS valid.
4. Update `NEXT_PUBLIC_APP_URL` ke domain tersebut.
5. Redeploy.

### Website widget

1. Masuk ke business profile dan simpan exact HTTPS origin portfolio, misalnya `https://portfolio.example.com`.
2. Buka `/integrations` dan salin snippet widget yang berisi workspace key.
3. Tempel sebelum `</body>` di website portfolio lalu upload ulang file.
4. Purge cache Cloudflare bila file lama masih disajikan.

Script widget boleh berada di website statis seperti InfinityFree. Yang wajib adalah HTTPS, origin yang cocok persis, dan request ke app domain tidak diblokir CSP/cache rule milik website.

### Meta webhook

Gunakan satu URL untuk verify dan event delivery:

```text
https://APP_DOMAIN/api/webhooks/whatsapp
```

Set verify token yang sama dengan workspace. Subscribe message dan delivery-status fields yang dibutuhkan, lalu kirim test message dari nomor customer. Owner finance commands hanya diproses dari nomor owner yang tersimpan di account/workspace.

### Telegram webhook

Tidak perlu menyalin URL webhook secara manual ke BotFather. Buka `/integrations?platform=telegram`, masukkan bot token, lalu hubungkan. Aplikasi memvalidasi bot, membuat webhook key serta secret, dan mendaftarkan URL HTTPS secara otomatis.

Sesudah tersambung, buka link username bot, tekan **Start**, dan kirim pesan teks lewat private DM. Satu bot hanya boleh terhubung ke satu workspace. Untuk memindahkannya, putuskan koneksi dari workspace lama terlebih dahulu agar webhook lama dihapus dengan benar.

### Background job cron

`vercel.json` menjadwalkan recovery job setiap hari pukul `03:00 UTC` (`11:00` Singapore). Request harus membawa `Authorization: Bearer CRON_SECRET`.

Normal web chat mencoba memproses lead refresh segera setelah response. Cron adalah recovery path dan saat ini mengambil maksimal 20 job per run; monitor backlog `background_jobs` selama beta.

## 8. Smoke test setelah deployment

Jangan membuka beta invite ke tester sebelum seluruh bagian penting di bawah lolos.

### Application dan database

- `GET https://APP_DOMAIN/api/health` menghasilkan HTTP 200, `status: ok`, dan database `ok`.
- Login owner berhasil dan session tetap aktif setelah navigasi.
- `/readiness` tidak menunjukkan required setup yang terlewat.
- Existing business profile, knowledge, products, dan agent tetap sama setelah seed promotion.

### Website AI dan human takeover

- Widget tampil dari exact allowed origin.
- Pesan visitor mendapat reply AI.
- Refresh browser menampilkan history sesi yang sama.
- Owner dapat membuka chat dan membalas dari `/conversations`.
- Human takeover menghentikan auto-reply sesuai state.
- Session visitor baru dimulai setelah token 24 jam berakhir.

### WhatsApp

- Meta webhook verification berhasil.
- Inbound message hanya tersimpan sekali saat webhook dikirim ulang.
- AI/owner outbound message mendapat provider message ID dan delivery state diperbarui.
- Nomor customer tidak dapat menjalankan finance commands.

### Telegram

- Panel Telegram di `/integrations?platform=telegram` berhasil memvalidasi bot dan menampilkan username bot yang benar tanpa pernah menampilkan kembali token tersimpan.
- `getWebhookInfo` tidak memiliki error terbaru dan pending update tidak terus bertambah.
- Private text DM muncul tepat sekali di `/conversations` walaupun update webhook dikirim ulang.
- AI dapat membalas, lalu human takeover menghentikan auto-reply dan owner dapat mengirim balasan manual.
- Group message, channel update, pesan dari bot, dan media/nonteks tidak membuat percakapan atau error berulang.
- Disconnect menghapus webhook Telegram dan menonaktifkan connector; pesan baru tidak lagi masuk ke workspace sementara token tetap terenkripsi serta masked untuk reconnect.

### Receipt dan AI

- Receipt JPEG/PNG/WebP di bawah 3 MB menghasilkan extraction atau review fallback yang jelas.
- Record media memiliki persistent Blob path/URL, bukan hanya process buffer.
- Knowledge edit memengaruhi reply baru tanpa restart aplikasi.

### Order, payment, dan proposal

- Product dapat dibuat dan order INCOME menggunakan total yang benar.
- Payment link test Xendit terbentuk.
- Test callback Xendit mengubah payment session dan order yang tepat.
- Proposal dapat diedit dan print view terbuka.

### Operations

- Vercel Function logs tidak menampilkan secret atau raw credential.
- Vercel Cron log menunjukkan HTTP 200, bukan 401.
- GitHub CI generate, typecheck, lint, semua test, audit, dan build berhasil.
- Tidak ada pending/failed migration di Neon.

## 9. Rollback dan recovery

- Untuk bug aplikasi, rollback deployment Vercel atau deploy commit perbaikan.
- Prisma migration production bersifat forward-only. Jangan menghapus folder migration yang sudah tercatat.
- Untuk kegagalan data, gunakan Neon branch/backup yang dibuat sebelum migration, kemudian arahkan environment dengan sengaja dan redeploy.
- Jika migration tercatat failed, inspeksi state database sebelum memakai `prisma migrate resolve`; jangan menandainya applied tanpa memastikan seluruh SQL benar-benar selesai.

## 10. Rotation runbook

- **Neon password:** rotate di Neon, update semua `DATABASE_URL`, kemudian redeploy.
- **AUTH_SECRET:** update lalu redeploy; seluruh login session lama akan invalid.
- **WIDGET_SIGNING_SECRET:** update lalu redeploy; widget session lama akan meminta session baru.
- **DATA_ENCRYPTION_KEY:** jangan ganti langsung. Decrypt dan re-encrypt semua stored integration credential dengan key baru melalui migration/script khusus lebih dulu.
- **Meta token/app secret:** update per workspace dan test signature serta outbound message.
- **Telegram bot token:** gunakan `/revoke` melalui `@BotFather`, lalu disconnect dan hubungkan kembali bot dari `/integrations?platform=telegram` dengan token baru agar webhook serta credential terenkripsi ikut diperbarui.
- **Xendit secret/callback token:** update per workspace dan kirim test callback.
- **CRON_SECRET:** update Vercel environment dan pastikan cron berikutnya kembali HTTP 200.
- **Seed password:** hapus dari local process dan jangan simpan di Vercel setelah bootstrap/rotation selesai.
