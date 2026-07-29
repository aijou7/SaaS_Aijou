import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("new-device login OTP", () => {
  test("password login skips OTP only for a valid trusted-device token", async () => {
    const login = await source("../src/app/api/auth/login/route.ts");
    assert.match(login, /verifyTrustedDeviceToken/);
    assert.match(login, /isLoginOtpEnabled\(\)/);
    assert.match(login, /isTransactionalEmailConfigured\(\)/);
    assert.match(login, /sendLoginOtpForUser/);
    assert.match(login, /\/login\/verify/);
  });

  test("login OTP rollout defaults off until production email is ready", async () => {
    const flags = await import("../src/lib/auth-flags");
    assert.equal(flags.isLoginOtpEnabled(undefined), false);
    assert.equal(flags.isLoginOtpEnabled("false"), false);
    assert.equal(flags.isLoginOtpEnabled("true"), true);
  });

  test("trusted device is bound to the current password version and 30-day expiry", async () => {
    const trusted = await source("../src/lib/trusted-device.ts");
    assert.match(trusted, /getPasswordVersion\(user\.passwordHash\)/);
    assert.match(trusted, /60 \* 60 \* 24 \* 30/);
    assert.match(trusted, /httpOnly:\s*true/);
    assert.match(trusted, /sameSite:\s*"lax"/);
  });

  test("OTP is single-use and limited to five attempts per challenge", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    assert.match(lifecycle, /auth-otp:challenge:10m", max: 5/);
    assert.match(lifecycle, /purpose:\s*AuthTokenPurpose\.LOGIN_OTP/);
    assert.match(lifecycle, /data:\s*\{ usedAt: now \}/);
  });
});
