import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("account verification safety", () => {
  test("public signup waits for email verification instead of issuing a session", async () => {
    const actions = await source("../src/app/signup/actions.ts");
    const publicAction = actions.slice(
      actions.indexOf("export async function signupPublicBetaAction"),
      actions.indexOf("export async function signupWithInviteAction"),
    );

    assert.doesNotMatch(publicAction, /createSessionCookie/);
    assert.match(publicAction, /sendVerificationEmailForUser/);
    assert.match(publicAction, /discardFailedPublicSignup/);
    assert.match(publicAction, /redirect\("\/verify-email\?sent=1"\)/);
  });

  test("both cookie sessions and password login require a verified email", async () => {
    const [session, login] = await Promise.all([
      source("../src/lib/session.ts"),
      source("../src/app/api/auth/login/route.ts"),
    ]);

    assert.match(session, /emailVerifiedAt:\s*true/);
    assert.match(session, /!user\.emailVerifiedAt/);
    assert.match(login, /emailVerifiedAt:\s*true/);
    assert.match(login, /!user\.emailVerifiedAt/);
  });

  test("email verification replaces the provisional password atomically", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    const verification = lifecycle.slice(
      lifecycle.indexOf("export async function verifyEmailWithToken"),
      lifecycle.indexOf("export async function requestAccountDeletion"),
    );

    assert.match(verification, /verifyEmailWithToken\(tokenValue: string, newPassword: string\)/);
    assert.match(verification, /validatePasswordStrength\(newPassword, token\.user\.email\)/);
    assert.match(verification, /data:\s*\{ emailVerifiedAt: now, passwordHash \}/);
    assert.match(verification, /purpose:\s*AuthTokenPurpose\.EMAIL_VERIFICATION/);
  });

  test("failed delivery deletes only the newly-issued token", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    const issue = lifecycle.slice(
      lifecycle.indexOf("async function issueToken"),
      lifecycle.indexOf("async function deliverIssuedTokenEmail"),
    );
    const settlement = lifecycle.slice(
      lifecycle.indexOf("async function settleIssuedTokenDelivery"),
      lifecycle.indexOf("function hashToken"),
    );

    assert.doesNotMatch(issue, /authToken\.deleteMany/);
    assert.match(issue, /previousTokenIds/);
    assert.match(settlement, /if \(!sent\)[\s\S]*id: token\.id[\s\S]*authToken\.updateMany/);
    assert.match(settlement, /id:\s*\{ in: token\.previousTokenIds \}/);
  });

  test("trusted invite and password reset paths establish verified ownership", async () => {
    const [invite, lifecycle] = await Promise.all([
      source("../src/server/auth/beta-invites.ts"),
      source("../src/server/auth/account-lifecycle.ts"),
    ]);

    assert.match(invite, /emailVerifiedAt:\s*claimedAt/);
    const reset = lifecycle.slice(
      lifecycle.indexOf("export async function resetPasswordWithToken"),
      lifecycle.indexOf("export async function sendVerificationEmailForUser"),
    );
    assert.match(reset, /emailVerifiedAt:\s*now/);
  });
});
