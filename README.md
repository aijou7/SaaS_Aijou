# Aijou AI Workspace

Aijou adalah workspace AI untuk menangani percakapan customer dari website, WhatsApp, dan Telegram, membantu owner melakukan human takeover, mengelola lead, membuat proposal, mencatat transaksi, membaca receipt, dan membuat payment link.

Status proyek saat ini adalah **beta terbatas dengan pendaftaran mandiri** melalui `/signup`. Widget website dan bot Telegram dapat dipakai tanpa menunggu verifikasi Meta; WhatsApp Cloud API baru aktif setelah credential dan webhook Meta siap.

## Fitur utama

- AI customer-service dengan agent name, tone, instruction, knowledge base, dan product context yang dapat dikustomisasi.
- Widget chat lintas domain dengan exact-origin allowlist, workspace key, signed session, history saat refresh, dan reset konteks setelah sesi 24 jam berakhir.
- Inbox gabungan untuk website, WhatsApp, dan Telegram, unread state, quick replies, owner reply, serta human takeover.
- WhatsApp Cloud API inbound/outbound, webhook signature verification, delivery status, idempotency, media validation, dan owner-only finance commands.
- Telegram Bot API untuk private text chat, automatic HTTPS webhook registration, AI reply, serta human takeover dari inbox yang sama.
- Lead qualification, follow-up state, background lead refresh, proposal draft, editor, dan print view.
- Orders/transaksi, katalog produk, CSV export, receipt review, serta OCR vision untuk JPEG, PNG, dan WebP.
- Xendit payment sessions yang dikonfigurasi terpisah untuk setiap workspace.
- Pendaftaran beta mandiri yang tetap kompatibel dengan invite, account/profile, password rotation, encrypted integration credentials, security headers, health check, dan CI checks.

Chat widget memulai identitas sesi baru setelah 24 jam. Percakapan lama tetap tersimpan di dashboard untuk histori owner; yang di-reset adalah session dan konteks pengunjung, bukan penghapusan record database.

## Stack

- Next.js 16 dan React 19
- TypeScript
- Prisma 7
- PostgreSQL
- Groq untuk text AI dan receipt vision
- Vercel Blob untuk receipt media production
- Vercel + Neon untuk deployment beta

## Kebutuhan lokal

- Node.js 22
- npm 10 atau lebih baru
- Docker Desktop, atau PostgreSQL yang sudah berjalan

## Menjalankan secara lokal

1. Install dependency:

```powershell
cd E:\Project\saas
npm.cmd install
```

2. Buat file environment lokal:

```powershell
Copy-Item .env.example .env
```

3. Ganti minimal `AUTH_SECRET`, `WIDGET_SIGNING_SECRET`, dan `DATA_ENCRYPTION_KEY`. Secret acak dapat dibuat dengan Node:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Gunakan nilai berbeda untuk setiap secret. Jangan commit atau mengirim isi `.env` lewat chat.

4. Jalankan PostgreSQL lokal:

```powershell
docker compose up -d
```

5. Generate Prisma client, jalankan migration, lalu buat workspace awal:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run seed
```

6. Jalankan aplikasi:

```powershell
npm.cmd run dev
```

Buka [http://localhost:3000](http://localhost:3000).

Folder `generated/` tidak disimpan di Git. Jalankan `npm run prisma:generate` setelah clone, setelah schema berubah, atau setelah pindah branch yang mengubah Prisma schema.

## Environment

Salin `.env.example` sebagai sumber daftar lengkap. Kelompok pentingnya:

- Database: `DATABASE_URL` dan opsi pool/timeout.
- Security: `AUTH_SECRET`, `WIDGET_SIGNING_SECRET`, `DATA_ENCRYPTION_KEY`, dan `CRON_SECRET`.
- Canonical URL: `NEXT_PUBLIC_APP_URL`.
- Bootstrap: `SEED_OWNER_*`, `SEED_BUSINESS_NAME`, `SEED_ROTATE_OWNER_PASSWORD`, dan `SEED_REFRESH_DEMO_DATA`.
- AI: `GROQ_API_KEY`, `GROQ_MODEL`, dan `GROQ_VISION_MODEL`.
- Receipt storage: `BLOB_READ_WRITE_TOKEN` untuk production.
- WhatsApp: token Meta, phone number ID, Graph API version, timeout, dan media limit.
- Telegram: hanya timeout request provider; bot token disimpan per workspace dari dashboard.

`DATA_ENCRYPTION_KEY` harus decode menjadi tepat 32 byte. Simpan backup aman atas key ini. Jangan menggantinya setelah credential terenkripsi tersimpan sebelum ada proses re-encryption.

Telegram dan Xendit dikonfigurasi per workspace dari dashboard. Bot token Telegram dan credential Xendit tidak perlu dan tidak boleh ditaruh dalam shared environment variable.

`NEXT_PUBLIC_APP_URL` wajib berupa canonical HTTPS origin agar aplikasi dapat mendaftarkan webhook Telegram yang dapat dijangkau Telegram. Untuk lokal tanpa HTTPS publik, UI dan data dapat diuji tetapi webhook Telegram tidak akan menerima update dari internet.

## Seed yang aman

Seed dapat dijalankan ulang untuk mempromosikan owner lama menjadi platform admin tanpa mengubah password atau konfigurasi workspace.

Default untuk database yang sudah memiliki owner/workspace:

- Existing password dipertahankan.
- Business profile, knowledge base, products, agent settings, dan WhatsApp settings dipertahankan.
- `isPlatformAdmin` diaktifkan untuk email owner yang dipilih.

Gunakan flag berikut hanya untuk tindakan yang memang disengaja:

```env
SEED_ROTATE_OWNER_PASSWORD="true"
SEED_REFRESH_DEMO_DATA="true"
```

`SEED_ROTATE_OWNER_PASSWORD=true` membutuhkan `SEED_OWNER_PASSWORD` eksplisit. `SEED_REFRESH_DEMO_DATA=true` menimpa kembali data demo bawaan yang memiliki key/ID sama; jangan aktifkan pada workspace production yang sudah dikustomisasi.

## AI dan receipt

Tanpa `GROQ_API_KEY`, aplikasi memakai fallback rule-based untuk alur yang didukung. Dengan Groq aktif, customer reply dan extraction memakai model yang dikonfigurasi.

OCR vision berjalan ketika media:

- bertipe JPEG, PNG, atau WebP;
- berukuran maksimal 3 MB untuk request vision; dan
- `GROQ_API_KEY` tersedia.

Media WhatsApp dapat diterima sampai batas `WHATSAPP_MAX_MEDIA_BYTES`. Di production, `BLOB_READ_WRITE_TOKEN` dibutuhkan agar file receipt tetap tersimpan setelah request selesai.

## Website widget

1. Isi exact HTTPS origin website di business profile, misalnya `https://example.com` tanpa path tambahan.
2. Buka `/integrations` dan salin snippet yang sudah berisi app URL serta workspace key.
3. Tempel snippet sebelum `</body>` pada website statis.
4. Test kirim pesan, refresh browser, lalu balas dari `/conversations`.

InfinityFree, Hostinger DNS, atau Cloudflare tidak menghalangi JavaScript widget selama file script bisa dimuat lewat HTTPS, origin yang didaftarkan tepat, dan Cloudflare tidak memodifikasi atau memblokir request API.

## Telegram bot

1. Buka chat resmi `@BotFather` di Telegram, buat bot dengan `/newbot`, lalu salin bot token yang diberikan.
2. Pastikan `NEXT_PUBLIC_APP_URL` deployment adalah origin HTTPS yang benar dan `DATA_ENCRYPTION_KEY` production sudah tersimpan permanen.
3. Buka `/integrations?platform=telegram`, paste token ke field rahasia, lalu hubungkan bot. Aplikasi memvalidasi identitas bot dan mendaftarkan webhook HTTPS secara otomatis.
4. Buka username bot dari hasil koneksi, tekan **Start**, lalu kirim private text message.
5. Pastikan pesan muncul di `/conversations`, AI dapat membalas, dan owner dapat mengambil alih serta mengirim balasan manual.

Scope private beta Telegram saat ini adalah private DM berbentuk teks. Group, channel, media, command khusus, dan inline bot tetap di luar scope. Bot token disimpan terenkripsi per workspace; jangan memasukkannya ke environment variable bersama, URL webhook, screenshot, log, atau repository.

## Webhook

Endpoint production:

```text
GET/POST https://APP_DOMAIN/api/webhooks/whatsapp
POST     https://APP_DOMAIN/api/webhooks/telegram/OPAQUE_WEBHOOK_KEY
POST     https://APP_DOMAIN/api/webhooks/xendit
GET      https://APP_DOMAIN/api/health
```

URL Telegram dibuat dan didaftarkan otomatis oleh dashboard. `OPAQUE_WEBHOOK_KEY` bukan bot token dan tidak perlu ditempel manual. WhatsApp credential dapat dimasukkan per workspace dari halaman integrations. Xendit credential dan callback token dimasukkan per workspace dari `/payments`.

## Quality checks

```powershell
npm.cmd run prisma:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run audit:prod
npm.cmd run build
```

CI menjalankan generate, typecheck, lint, semua `tests/*.test.ts`, production dependency audit untuk severity high ke atas, dan production build.

## Perintah berguna

```powershell
npm.cmd run dev
npm.cmd run check
npm.cmd run prisma:migrate
npm.cmd run prisma:deploy
npm.cmd run prisma:studio
npm.cmd run seed
```

Untuk deployment production, migration preflight, seed owner yang aman, smoke test, dan credential rotation, ikuti [DEPLOYMENT.md](./DEPLOYMENT.md).
