# WhatsApp AI Assistant - MVP Execution PRD

## 1. Decision Summary

Dokumen PRD asli sudah kuat sebagai vision PRD, tetapi scope MVP terlalu luas jika langsung mencakup finance assistant, receipt OCR, dashboard, CS agent, knowledge base, lead inbox, dan human handoff dalam satu rilis.

MVP pertama akan difokuskan pada:

1. Mencatat pengeluaran melalui WhatsApp text.
2. Memproses foto nota dari WhatsApp sebagai transaksi pending.
3. Melakukan konfirmasi sebelum transaksi disimpan final.
4. Menampilkan dan mengelola transaksi di dashboard web.
5. Menampilkan ringkasan pengeluaran sederhana.

CS agent, lead inbox, dan knowledge base tetap penting, tetapi masuk fase setelah flow finance stabil.

## 2. Product Goal MVP

Membuktikan bahwa WhatsApp dapat menjadi interface utama yang nyaman untuk mencatat pengeluaran harian, baik melalui chat text maupun foto nota, dengan dashboard web sebagai pusat koreksi dan rekap.

## 3. Primary User MVP

Primary user:

Owner bisnis kecil, freelancer, atau individu yang ingin mencatat pengeluaran harian tanpa membuka aplikasi khusus.

Contoh user awal:

- Freelancer IT support.
- Owner IT consultant kecil.
- Solo founder.
- Individu yang ingin tracking pengeluaran pribadi dan project.

## 4. MVP Scope

### 4.1 In Scope

1. Login dashboard.
2. WhatsApp webhook untuk pesan text.
3. WhatsApp webhook untuk media gambar.
4. Conversation log dasar.
5. Intent detection untuk:
   - catat pengeluaran
   - konfirmasi transaksi
   - batal transaksi
   - tanya rekap sederhana
   - unknown
6. Transaction extraction dari pesan text.
7. Receipt image storage.
8. OCR atau AI vision extraction untuk nota.
9. Confirmation flow via WhatsApp.
10. Transaction dashboard.
11. Receipt review dashboard.
12. Edit, delete, dan filter transaksi.
13. Monthly summary sederhana.
14. Export transaksi ke CSV atau Excel.
15. Usage log dasar untuk message dan AI request.

### 4.2 Out of Scope for MVP

1. CS agent untuk customer.
2. Knowledge base bisnis.
3. Lead inbox.
4. Human handoff untuk customer support.
5. Multi-user team.
6. Multi-business active tenant.
7. Integrasi bank.
8. Integrasi POS.
9. Payment gateway.
10. Invoice generator.
11. Quotation generator.
12. Voice note processing.
13. Akuntansi lengkap dan pajak.

## 5. Core User Flows

### 5.1 Flow A - Catat Pengeluaran dari Text

User mengirim WhatsApp:

```text
Catat beli kabel LAN 2 roll 450 ribu buat project Kantor A
```

Sistem melakukan:

1. Terima webhook WhatsApp.
2. Simpan raw message.
3. Deteksi intent sebagai expense_create.
4. Extract structured transaction data.
5. Buat pending confirmation session.
6. Kirim ringkasan ke user.

Contoh response:

```text
Siap, saya baca ini sebagai pengeluaran Rp450.000 untuk kabel LAN 2 roll, project Kantor A, kategori perlengkapan project. Mau saya simpan?
```

User menjawab:

```text
Ya
```

Sistem melakukan:

1. Cocokkan jawaban dengan confirmation session aktif.
2. Simpan transaksi sebagai confirmed.
3. Kirim response sukses.
4. Tampilkan transaksi di dashboard.

### 5.2 Flow B - Batal Simpan Transaksi

Jika user menjawab:

```text
Batal
```

Sistem melakukan:

1. Tandai confirmation session sebagai cancelled.
2. Jangan simpan transaksi final.
3. Simpan log keputusan.
4. Kirim response pembatalan.

### 5.3 Flow C - Receipt from Image

User mengirim foto nota.

Sistem melakukan:

1. Terima webhook media image.
2. Simpan WhatsApp message ID.
3. Download image dari provider.
4. Simpan file ke object storage atau local storage MVP.
5. Jalankan OCR atau AI vision.
6. Extract merchant, date, total, item, tax, discount jika ada.
7. Hitung confidence score.
8. Buat transaction draft dengan status pending_confirmation atau needs_review.
9. Kirim ringkasan ke user.

Jika confidence cukup:

```text
Saya membaca nota ini sebagai transaksi Rp275.000 dari Toko Sinar Jaya pada 15 Juni 2026. Kategori sementara: perlengkapan kantor. Confidence 86%. Mau saya simpan?
```

Jika confidence rendah:

```text
Foto nota kurang jelas. Saya menemukan total sekitar Rp275.000, tapi beberapa item tidak terbaca. Saya tandai untuk review dulu di dashboard.
```

### 5.4 Flow D - Tanya Rekap Bulan Ini

User mengirim:

```text
Rekap pengeluaran bulan ini
```

Sistem melakukan:

1. Deteksi intent sebagai expense_summary.
2. Ambil transaksi confirmed pada bulan berjalan.
3. Hitung total dan kategori terbesar.
4. Kirim ringkasan.

Contoh response:

```text
Total pengeluaran bulan Juni 2026 saat ini Rp3.750.000. Kategori terbesar: perlengkapan project Rp1.850.000, transport Rp650.000, makan meeting Rp500.000.
```

## 6. Functional Requirements

### 6.1 WhatsApp Webhook

Requirements:

1. Sistem menerima webhook pesan masuk.
2. Sistem memverifikasi webhook dari provider WhatsApp.
3. Sistem menyimpan provider message ID.
4. Sistem mengabaikan duplicate webhook.
5. Sistem mendukung text message.
6. Sistem mendukung image message.
7. Sistem menyimpan raw payload untuk debugging terbatas.
8. Sistem mencatat status processing message.

Acceptance criteria:

1. Pesan text baru tersimpan satu kali di database.
2. Duplicate webhook dengan provider message ID yang sama tidak membuat message atau transaksi ganda.
3. Image message tersimpan sebagai media record.
4. Webhook invalid ditolak.

### 6.2 AI Intent Detection

Supported intents MVP:

- expense_create
- expense_confirm
- expense_cancel
- expense_summary
- correction_request
- unknown

Acceptance criteria:

1. "catat beli mouse 150 ribu" dikenali sebagai expense_create.
2. "ya", "simpan", "oke simpan" dikenali sebagai expense_confirm jika ada pending confirmation.
3. "batal", "jangan simpan" dikenali sebagai expense_cancel jika ada pending confirmation.
4. "pengeluaran bulan ini berapa?" dikenali sebagai expense_summary.
5. Pesan ambigu tidak langsung membuat transaksi final.

### 6.3 Transaction Extraction

Required extracted fields:

- transaction_type
- transaction_date
- merchant_name
- category_name
- project_name
- total_amount
- description
- confidence_score
- missing_fields

Acceptance criteria:

1. Sistem bisa mengambil nominal dari variasi "150 ribu", "150rb", "Rp150.000", dan "150.000".
2. Jika nominal tidak ditemukan, sistem meminta klarifikasi.
3. Jika tanggal tidak disebut, sistem memakai tanggal message sebagai default.
4. Jika project/client disebut, sistem menyimpan project_name draft.
5. Transaksi tidak menjadi confirmed tanpa konfirmasi user.

### 6.4 Receipt OCR

Acceptance criteria:

1. Foto nota yang jelas menghasilkan minimal merchant atau total.
2. Hasil OCR disimpan sebagai raw_ocr_text.
3. Hasil extraction disimpan sebagai extracted_json.
4. Confidence rendah membuat receipt masuk needs_review.
5. User atau owner bisa mengoreksi merchant, total, date, dan category.

### 6.5 Dashboard Transactions

Requirements:

1. List transaksi.
2. Filter tanggal.
3. Filter status.
4. Filter kategori.
5. Filter project/client.
6. Edit transaksi.
7. Delete transaksi.
8. Add manual transaction.
9. Export CSV atau Excel.

Acceptance criteria:

1. Transaksi confirmed dari WhatsApp muncul di dashboard.
2. Transaksi pending dan needs_review terlihat dengan status jelas.
3. Edit total_amount mengubah total summary.
4. Delete transaksi tidak menghapus conversation log.
5. Export menghasilkan file dengan tanggal, merchant, kategori, project, nominal, status, dan source.

### 6.6 Finance Summary

Requirements:

1. Total pengeluaran bulan berjalan.
2. Total per kategori.
3. Total per project/client.
4. Trend harian sederhana.
5. Summary via WhatsApp untuk bulan berjalan.

Acceptance criteria:

1. Dashboard menampilkan total bulan berjalan.
2. WhatsApp assistant menjawab total bulan berjalan dari data confirmed.
3. Pending atau rejected transaction tidak masuk total final.

## 7. AI Guardrails

Rules:

1. AI tidak boleh menyimpan transaksi tanpa konfirmasi eksplisit.
2. AI tidak boleh mengarang data nota yang tidak terbaca.
3. AI harus meminta klarifikasi jika nominal tidak ditemukan.
4. AI harus mengembalikan confidence_score.
5. AI harus mengisi missing_fields untuk data yang tidak ada.
6. AI harus memakai structured JSON output untuk extraction.
7. AI response ke user harus singkat dan langsung actionable.

Required AI extraction output:

```json
{
  "intent": "expense_create",
  "confidence_score": 0.91,
  "transaction": {
    "transaction_type": "expense",
    "transaction_date": "2026-06-15",
    "merchant_name": null,
    "category_name": "perlengkapan project",
    "project_name": "Kantor A",
    "total_amount": 450000,
    "description": "kabel LAN 2 roll"
  },
  "missing_fields": ["merchant_name"],
  "requires_confirmation": true,
  "suggested_reply": "Siap, saya baca ini sebagai pengeluaran Rp450.000 untuk kabel LAN 2 roll, project Kantor A, kategori perlengkapan project. Mau saya simpan?"
}
```

## 8. MVP Data Model

### 8.1 users

- id
- name
- email
- password_hash
- phone_number
- role
- created_at
- updated_at

### 8.2 businesses

- id
- user_id
- business_name
- business_type
- whatsapp_number
- created_at
- updated_at

### 8.3 contacts

- id
- business_id
- phone_number
- display_name
- contact_type
- created_at
- updated_at

### 8.4 whatsapp_conversations

- id
- business_id
- contact_id
- conversation_type
- status
- last_message_at
- created_at
- updated_at

### 8.5 whatsapp_messages

- id
- conversation_id
- provider_message_id
- sender_type
- message_type
- message_body
- media_file_id
- raw_payload
- intent
- processing_status
- created_at

Unique constraint:

- provider_message_id

### 8.6 media_files

- id
- business_id
- provider_media_id
- file_url
- file_type
- mime_type
- file_size
- storage_path
- created_at

### 8.7 transactions

- id
- business_id
- user_id
- conversation_id
- transaction_type
- transaction_date
- merchant_name
- category_id
- project_id
- total_amount
- currency
- description
- source
- status
- confidence_score
- created_at
- updated_at

Status values:

- draft
- pending_confirmation
- confirmed
- needs_review
- rejected
- cancelled

### 8.8 transaction_items

- id
- transaction_id
- item_name
- quantity
- unit_price
- subtotal
- created_at
- updated_at

### 8.9 categories

- id
- business_id
- name
- type
- created_at
- updated_at

### 8.10 projects

- id
- business_id
- project_name
- client_name
- status
- created_at
- updated_at

### 8.11 receipts

- id
- transaction_id
- media_file_id
- raw_ocr_text
- extracted_json
- confidence_score
- review_status
- created_at
- updated_at

### 8.12 confirmation_sessions

- id
- business_id
- conversation_id
- transaction_id
- status
- expires_at
- created_at
- updated_at

Status values:

- active
- confirmed
- cancelled
- expired

### 8.13 ai_logs

- id
- business_id
- conversation_id
- message_id
- input_text
- output_text
- structured_output
- intent
- confidence_score
- action_taken
- created_at

### 8.14 usage_logs

- id
- business_id
- usage_type
- provider
- total_messages
- total_ai_requests
- estimated_cost
- created_at

### 8.15 audit_logs

- id
- business_id
- actor_type
- actor_id
- entity_type
- entity_id
- action
- before_json
- after_json
- created_at

## 9. Suggested API Surface

### Auth

- POST /auth/login
- POST /auth/logout
- GET /auth/me

### WhatsApp

- GET /webhooks/whatsapp
- POST /webhooks/whatsapp

### Transactions

- GET /transactions
- POST /transactions
- GET /transactions/:id
- PATCH /transactions/:id
- DELETE /transactions/:id
- POST /transactions/:id/confirm
- POST /transactions/:id/reject
- GET /transactions/export

### Receipts

- GET /receipts
- GET /receipts/:id
- PATCH /receipts/:id/review

### Summary

- GET /summary/monthly
- GET /summary/categories
- GET /summary/projects

### Conversations

- GET /conversations
- GET /conversations/:id
- GET /conversations/:id/messages

### Usage

- GET /usage

## 10. Release Plan

### Phase 1 - Foundation

Deliverables:

1. Project setup.
2. Database schema.
3. Auth dashboard.
4. WhatsApp webhook verification.
5. Store incoming messages.
6. Send basic WhatsApp reply.
7. Idempotency using provider_message_id.

Exit criteria:

1. Incoming WhatsApp text appears in database.
2. Duplicate webhook does not duplicate message.
3. Dashboard login works.

### Phase 2 - Text Expense Assistant

Deliverables:

1. Intent detection.
2. Transaction extraction.
3. Pending transaction creation.
4. Confirmation session.
5. Confirm/cancel via WhatsApp.
6. Basic transaction dashboard.

Exit criteria:

1. User can create confirmed transaction from WhatsApp text.
2. Transaction appears in dashboard.
3. Cancelled transaction is not counted in summary.

### Phase 3 - Dashboard Finance

Deliverables:

1. Transaction filters.
2. Edit/delete transaction.
3. Category management minimal.
4. Project/client field support.
5. Monthly summary.
6. CSV or Excel export.

Exit criteria:

1. Owner can correct transaction data.
2. Monthly total updates after edit/delete.
3. Export file is usable.

### Phase 4 - Receipt OCR

Deliverables:

1. Image webhook handling.
2. Media download and storage.
3. OCR or AI vision extraction.
4. Receipt review page.
5. Save corrected receipt as transaction.

Exit criteria:

1. User can send receipt photo.
2. System creates transaction draft.
3. Low confidence receipt enters needs_review.
4. Owner can correct and confirm receipt from dashboard.

### Phase 5 - Stabilization

Deliverables:

1. Error handling.
2. Audit logs.
3. Usage monitoring.
4. Rate limiting.
5. Security hardening.
6. Backup plan.

Exit criteria:

1. Important actions have audit logs.
2. AI and WhatsApp usage are visible.
3. Webhook errors are observable.

## 11. Success Metrics MVP

Product metrics:

1. At least 80 percent of text expense examples produce a valid draft.
2. 0 confirmed transactions are saved without user confirmation.
3. Duplicate webhook creates 0 duplicate transactions.
4. User can complete text expense flow in less than 30 seconds.
5. Dashboard summary matches confirmed transaction total.

Quality metrics:

1. Intent detection accuracy for MVP examples >= 85 percent.
2. Receipt total extraction accuracy for clear receipts >= 75 percent.
3. Manual correction rate is tracked.
4. Failed webhook processing rate is tracked.

Business metrics:

1. Cost per active user per month.
2. Cost per AI request.
3. Cost per WhatsApp conversation.

## 12. Open Decisions

1. WhatsApp provider: Meta Cloud API directly or aggregator.
2. AI provider and model for text extraction.
3. OCR approach: vision LLM, OCR engine, or hybrid.
4. Storage: local storage for MVP or object storage from day one.
5. Database: PostgreSQL recommended.
6. Framework: Next.js full-stack or separate React plus NestJS/Express.
7. Export format: CSV first or Excel first.

## 13. Recommended Build Choice

Recommended default stack:

- Frontend: Next.js
- Styling: Tailwind CSS
- Backend: Next.js API routes for MVP or NestJS if expecting larger backend
- Database: PostgreSQL
- ORM: Prisma
- Queue: BullMQ or a simple database-backed job table for early MVP
- Storage: S3-compatible object storage
- AI: structured JSON extraction with strict schema validation

For fastest MVP, use Next.js plus Prisma plus PostgreSQL first. Split backend service later only if queue, webhook, and AI processing become heavy.

## 14. Next PRD Slice

After this MVP is stable, create a separate PRD for:

1. AI CS Agent.
2. Knowledge Base.
3. Lead Inbox.
4. Human Handoff.
5. Agent Customization.

Those features should not be mixed into the first MVP build unless the product direction changes to customer support first.
