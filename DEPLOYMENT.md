# Deployment Guide: Vercel + Neon

This project is easiest to test online with:

- Vercel for the Next.js app
- Neon for hosted PostgreSQL
- GitHub as the deployment source

## 1. Push Project To GitHub

```powershell
cd E:\Project\saas
git add .
git commit -m "prepare vercel neon deployment"
git push
```

## 2. Create Neon Database

1. Create a Neon project.
2. Copy the pooled PostgreSQL connection string.
3. Use it as `DATABASE_URL`.

The value should look roughly like:

```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
```

## 3. Create Vercel Project

1. Import the GitHub repository into Vercel.
2. Framework preset: Next.js.
3. Build command can stay default because `package.json` runs:

```bash
prisma generate && next build
```

## 4. Set Vercel Environment Variables

Required:

```env
DATABASE_URL="your-neon-postgres-url"
AUTH_SECRET="generate-a-long-random-string"
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
GROQ_API_KEY="your-groq-key"
GROQ_MODEL="llama-3.1-8b-instant"
```

Seed/demo user:

```env
SEED_OWNER_NAME="Owner"
SEED_OWNER_EMAIL="owner@example.com"
SEED_OWNER_PASSWORD="change-me-now"
SEED_BUSINESS_NAME="IT Consultant"
```

WhatsApp, optional until real integration:

```env
WHATSAPP_VERIFY_TOKEN=""
WHATSAPP_APP_SECRET=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
```

Xendit, optional until payment integration:

```env
XENDIT_SECRET_KEY=""
XENDIT_WEBHOOK_TOKEN=""
```

## 5. Run Migration Against Neon

In local PowerShell, temporarily point `DATABASE_URL` to Neon:

```powershell
$env:DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
npm.cmd run prisma:deploy
npm.cmd run seed
```

Use `prisma:deploy` for hosted databases. Use `prisma:migrate` only for local development.

## 6. Deploy

Push to GitHub. Vercel will build and deploy automatically:

```powershell
git add .
git commit -m "update app"
git push
```

## 7. Webhook URLs

After Vercel deploys, use:

```text
https://your-app.vercel.app/api/webhooks/whatsapp
```

Later, when Xendit is wired, use:

```text
https://your-app.vercel.app/api/webhooks/xendit
```

## Notes

- Do not use Docker Compose in Vercel. Docker is only for local PostgreSQL.
- Keep `.env` local only. Put production env values in Vercel.
- If the build fails with Prisma client errors, confirm Vercel is running the updated `build` script.
