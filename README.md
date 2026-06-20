# WhatsApp AI Assistant MVP

Foundation app for the WhatsApp-first AI assistant MVP.

## Stack

- Next.js
- Prisma 7
- PostgreSQL
- TypeScript

## Local Setup

1. Copy environment values:

```bash
cp .env.example .env
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run database migration:

```bash
npm run prisma:migrate
```

5. Seed the first owner and business:

```bash
npm run seed
```

6. Start the app:

```bash
npm run dev
```

Dashboard: http://localhost:3000

## Groq AI Setup

The app can use Groq for:

- expense extraction from WhatsApp text
- customer-service AI replies

Set these values in `.env`:

```bash
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="llama-3.1-8b-instant"
```

If `GROQ_API_KEY` is empty or Groq fails, the app falls back to the rule-based local logic so the demo keeps working.

## WhatsApp Webhook Setup

Required env values for real WhatsApp Cloud API traffic:

```bash
WHATSAPP_VERIFY_TOKEN="your-meta-webhook-verify-token"
WHATSAPP_APP_SECRET="your-meta-app-secret"
WHATSAPP_ACCESS_TOKEN="your-whatsapp-cloud-api-token"
WHATSAPP_PHONE_NUMBER_ID="your-phone-number-id"
```

Behavior:

- `GET /api/webhooks/whatsapp` verifies the Meta webhook challenge.
- `POST /api/webhooks/whatsapp` verifies `x-hub-signature-256` when `WHATSAPP_APP_SECRET` is set.
- Text replies are sent through the WhatsApp Cloud API when access token and phone number ID are configured.
- Receipt images are downloaded to `storage/receipts/:businessId` when media credentials are configured.
- If credentials are missing, the app still processes/stores the webhook and marks the external send/download as skipped.

## Current Phase

Phase 1 foundation is scaffolded:

- Dashboard login and signed session cookie.
- Prisma schema for the MVP data model.
- WhatsApp webhook verification route.
- Incoming message processor with intent detection placeholder.
- Database storage path for WhatsApp contact, conversation, message log, and idempotency.

Phase 2 text expense assistant is scaffolded:

- Text expense extraction for Indonesian amount formats such as `150 ribu`, `150rb`, and `Rp150.000`.
- Pending transaction creation from WhatsApp text.
- Category and project upsert from extracted text.
- Confirmation session with 30 minute expiry.
- Confirm/cancel flow from WhatsApp replies such as `ya`, `simpan`, `batal`.
- AI log records for finance actions.
- Dashboard metrics and recent transactions read from the database.

Phase 3 dashboard finance is scaffolded:

- `/transactions` page with filters for status, category, project, date range, and search text.
- Manual transaction creation from the dashboard.
- Inline transaction edit and delete actions.
- Monthly summary cards for confirmed, pending, and needs-review transactions.
- CSV export at `/api/transactions/export`.
- JSON transaction API at `/api/transactions` and `/api/transactions/:id`.

Phase 4 receipt OCR/review is scaffolded:

- WhatsApp image webhook creates a receipt draft linked to a media file.
- WhatsApp media download stores receipt images under `storage/receipts/:businessId` when credentials are configured.
- OCR adapter placeholder stores low-confidence extraction output for later provider integration.
- Receipt drafts become `NEEDS_REVIEW` transactions.
- `/receipts` page supports receipt correction, confirm, and reject.
- Confirmed receipts update the linked transaction as `CONFIRMED`.
- Receipt APIs are available at `/api/receipts` and `/api/receipts/:id/review`.

Integration hardening included:

- WhatsApp webhook signature verification.
- WhatsApp text reply sender.
- Local receipt media storage.

Demo and human takeover loop:

- `/simulator` can create finance-assistant and customer-service messages without Meta setup.
- `/conversations` shows WhatsApp-style inbox and chat detail.
- Owner can click Take over to set a conversation to `HUMAN_NEEDED`.
- While `HUMAN_NEEDED`, the simulator stops AI auto-replies for that customer conversation.
- Owner replies are stored in the conversation log as manual human messages.
- When Groq is configured, simulator AI replies and expense extraction use Groq before falling back locally.

Knowledge base and lead summary:

- `/knowledge` manages active business knowledge for the AI customer-service agent.
- Seed data includes IT consultant services, pricing guardrails, and handoff rules.
- Customer-service replies use active knowledge base content as business context.
- `/leads` shows auto-generated lead summaries from customer conversations.
- Leads include customer, need summary, service interest, location, budget, urgency, status, and owner notes.

Agent customization:

- `/agent` controls agent name, language, tone, business description, handoff rules, system instruction, and active/inactive state.
- Customer-service replies use agent settings plus active knowledge base content.
- If the agent is inactive, new simulated customer chats move into `HUMAN_NEEDED` without AI auto-reply.

AI observability:

- `/ai-activity` shows recent AI logs, confidence scores, input, output, structured JSON, and related conversations.
- Dashboard includes an Action Queue for pending transactions, receipt review, human-needed chats, and new leads.
- Dashboard also shows latest AI actions for quick debugging.

## Useful Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Free Testing Deployment

Recommended stack for online testing:

- Vercel for the Next.js app
- Neon for PostgreSQL
- GitHub push for automatic deploys

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the exact steps, environment variables, migration command, and webhook URLs.
