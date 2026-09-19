import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsAppPhone } from "@/server/whatsapp/phone";

test("normalizes common Indonesian WhatsApp phone formats", () => {
  assert.equal(normalizeWhatsAppPhone("0812 3456 7890"), "6281234567890");
  assert.equal(normalizeWhatsAppPhone("+62 812-3456-7890"), "6281234567890");
  assert.equal(normalizeWhatsAppPhone("6281234567890"), "6281234567890");
  assert.equal(normalizeWhatsAppPhone("0062 812 3456 7890"), "6281234567890");
});
