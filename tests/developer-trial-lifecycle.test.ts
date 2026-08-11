import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("public trial quota is atomic and capped at 100 verified workspaces", () => {
  const subscriptions = read("src/server/subscriptions/subscriptions.ts");
  const signup = read("src/server/auth/public-signup.ts");
  const migration = read(
    "prisma/migrations/20260811180000_add_developer_console_trial_lifecycle/migration.sql",
  );

  assert.match(subscriptions, /PUBLIC_TRIAL_LIMIT\s*=\s*100/);
  assert.match(subscriptions, /ON CONFLICT \("key"\) DO UPDATE/);
  assert.match(subscriptions, /WHERE "platform_counters"\."value" < \$\{PUBLIC_TRIAL_LIMIT\}/);
  assert.match(subscriptions, /claimPublicTrialSlot\(tx\)/);
  assert.doesNotMatch(signup, /claimPublicTrialSlot/);
  assert.match(migration, /UNIQUE INDEX "workspace_subscriptions_trialClaimNumber_key"/);
  assert.match(migration, /ranked\.claim_number <= 100/);
});

test("trial lifecycle expires only auto reply and sends idempotent reminders", () => {
  const lifecycle = read("src/server/subscriptions/trial-lifecycle.ts");
  const cron = read("src/app/api/cron/maintenance/route.ts");
  const conversation = read("src/server/conversations/conversations.ts");

  assert.match(lifecycle, /"D7" \| "D3" \| "D1" \| "EXPIRED"/);
  assert.match(lifecycle, /status: WorkspaceSubscriptionStatus\.EXPIRED/);
  assert.match(lifecycle, /idempotencyKey: `trial-\$\{input\.subscriptionId\}-\$\{input\.stage\.toLowerCase\(\)\}`/);
  assert.match(cron, /\["trial_lifecycle", \(\) => processTrialLifecycle\(\)\]/);
  assert.match(conversation, /Pesan tetap tersimpan untuk ditangani tim/);
});

test("developer mutations require platform access, confirmation, reason, and audit", () => {
  const actions = read("src/app/developer/actions.ts");
  const service = read("src/server/admin-cockpit.ts");
  const page = read("src/app/developer/page.tsx");

  assert.match(actions, /await requirePlatformAdmin\(session\.userId\)/);
  assert.match(actions, /formData\.get\("confirmed"\) !== "yes"/);
  assert.match(service, /reason\.length < 8/);
  assert.match(service, /tx\.platformAuditLog\.create/g);
  assert.match(service, /Workspace ini bukan penerima kuota 100 trial pertama/);
  assert.doesNotMatch(page, /accessToken|serverKey|appSecret|snapToken/);
});

test("public pricing explains that the first 100 verified workspaces receive trial", () => {
  const pricing = read("src/components/marketing-pricing.tsx");
  const signup = read("src/app/signup/page.tsx");

  assert.match(pricing, /workspace terverifikasi pertama/);
  assert.match(pricing, /Slot diklaim setelah OTP email berhasil/);
  assert.match(signup, /selectedPlanHasTrial/);
});

test("developer route preserves its login destination and distinguishes platform access", () => {
  const session = read("src/lib/session.ts");
  const page = read("src/app/developer/page.tsx");
  const migration = read(
    "prisma/migrations/20260811190000_assign_contact_platform_admin/migration.sql",
  );

  assert.match(session, /isPlatformAdmin: true/);
  assert.match(session, /isPlatformAdmin: user\.isPlatformAdmin/);
  assert.match(page, /redirect\("\/login\?next=%2Fdeveloper"\)/);
  assert.match(page, /if \(!session\.isPlatformAdmin\) return <DeveloperAccessDenied \/>/);
  assert.doesNotMatch(page, /catch \{\s*redirect\("\/dashboard"\)/);
  assert.match(migration, /LOWER\("email"\) = 'contact@aijoutek\.pro'/);
  assert.doesNotMatch(migration, /"role"\s*=|businessName|LIMIT 1/);
});
