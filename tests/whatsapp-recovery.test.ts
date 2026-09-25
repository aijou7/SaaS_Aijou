import assert from "node:assert/strict";
import { test } from "node:test";
import { hasVerifiedRecoveryPhone } from "@/server/auth/recovery-phone";

const verifiedAt = new Date("2026-09-25T09:00:00.000Z");
const issuedAt = new Date("2026-09-25T09:01:00.000Z");
const user = {
  phoneNumber: "6281234567890",
  recoveryPhoneVerifiedAt: verifiedAt,
  emailVerifiedAt: verifiedAt,
};

test("WhatsApp recovery requires the verified current phone and email", () => {
  assert.equal(hasVerifiedRecoveryPhone(user, user.phoneNumber, issuedAt), true);
  assert.equal(hasVerifiedRecoveryPhone({ ...user, recoveryPhoneVerifiedAt: null }, user.phoneNumber, issuedAt), false);
  assert.equal(hasVerifiedRecoveryPhone({ ...user, emailVerifiedAt: null }, user.phoneNumber, issuedAt), false);
  assert.equal(hasVerifiedRecoveryPhone({ ...user, phoneNumber: "6289999999999" }, user.phoneNumber, issuedAt), false);
});

test("reverification after code issuance invalidates that code", () => {
  const reverifiedAt = new Date("2026-09-25T09:02:00.000Z");
  assert.equal(hasVerifiedRecoveryPhone({ ...user, recoveryPhoneVerifiedAt: reverifiedAt }, user.phoneNumber, issuedAt), false);
});
