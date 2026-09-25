import assert from "node:assert/strict";
import test from "node:test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/aijou_test";

test("business hours use Lombok timezone and support overnight schedules", async () => {
  const { evaluateBusinessHours, normalizeBusinessHours } = await import("@/server/operations/business-hours");
  const schedule = normalizeBusinessHours([]).map((day) => ({ ...day, enabled: false }));
  schedule[1] = { day: 1, enabled: true, start: "09:00", end: "17:00" };
  schedule[5] = { day: 5, enabled: true, start: "22:00", end: "02:00" };
  assert.equal(evaluateBusinessHours({ enabled: true, schedule, timeZone: "Asia/Makassar", at: new Date("2026-08-03T02:00:00Z") }).isOpen, true);
  assert.equal(evaluateBusinessHours({ enabled: true, schedule, timeZone: "Asia/Makassar", at: new Date("2026-08-03T11:00:00Z") }).isOpen, false);
  assert.equal(evaluateBusinessHours({ enabled: true, schedule, timeZone: "Asia/Makassar", at: new Date("2026-08-07T17:00:00Z") }).isOpen, true);
});

test("disabled business hours preserve 24/7 behavior", async () => {
  const { evaluateBusinessHours } = await import("@/server/operations/business-hours");
  const result = evaluateBusinessHours({ enabled: false, schedule: [], timeZone: "Invalid/Zone" });
  assert.deepEqual(result, { enabled: false, isOpen: true, reason: "disabled" });
});

test("broadcast requires current opt-in and rejects opted-out contacts", async () => {
  const {
    isMarketingContactCooldownElapsed,
    isMarketingContactEligible,
    isMarketingContactSendable,
    isMetaBroadcastThrottleError,
    parseBroadcastAudience,
    shouldReactivateBroadcastConversation,
  } = await import("@/server/operations/broadcasts");
  const optIn = new Date("2026-01-01T00:00:00Z");
  assert.equal(isMarketingContactEligible({ phoneNumber: "628123", marketingOptInAt: optIn, marketingOptOutAt: null }), true);
  assert.equal(isMarketingContactEligible({ phoneNumber: "628123", marketingOptInAt: optIn, marketingOptOutAt: new Date("2026-02-01T00:00:00Z") }), false);
  assert.equal(isMarketingContactEligible({ phoneNumber: "", marketingOptInAt: optIn, marketingOptOutAt: null }), false);
  const now = new Date("2026-09-20T00:00:00Z");
  assert.equal(isMarketingContactCooldownElapsed(new Date("2026-09-13T00:00:01Z"), now), false);
  assert.equal(isMarketingContactSendable({ phoneNumber: "628123", marketingOptInAt: optIn, marketingOptOutAt: null, lastContactedAt: null }, now), true);
  assert.equal(isMetaBroadcastThrottleError("131048"), true);
  assert.equal(isMetaBroadcastThrottleError("131026"), false);
  assert.equal(parseBroadcastAudience("all_opt_in"), "all_opt_in");
  assert.equal(parseBroadcastAudience("unexpected"), "manual");
  assert.equal(shouldReactivateBroadcastConversation("HUMAN_NEEDED", "handoff_request"), true);
  assert.equal(shouldReactivateBroadcastConversation("HUMAN_NEEDED", "human_takeover_enabled"), false);
  assert.equal(shouldReactivateBroadcastConversation("OPEN", null), false);
});

test("normalizes Markdown strong text into WhatsApp bold pairs", async () => {
  const { normalizeWhatsAppFormatting } = await import("@/lib/whatsapp-format");
  assert.equal(
    normalizeWhatsAppFormatting("**Khusus 20 pendaftar pertama, nikmati promo.**"),
    "*Khusus 20 pendaftar pertama, nikmati promo.*",
  );
  assert.equal(
    normalizeWhatsAppFormatting("Mulai **sekarang.\nJangan lewatkan!** ya."),
    "Mulai *sekarang.\nJangan lewatkan!* ya.",
  );
  assert.equal(normalizeWhatsAppFormatting("*Sudah benar.*"), "*Sudah benar.*");
});

test("only the connected WABA number can enter the internal WhatsApp path", async () => {
  const { isAuthorizedBusinessNumberMessage } = await import("@/server/whatsapp/authorization");
  assert.equal(isAuthorizedBusinessNumberMessage("088229080443", "+62 882 2908 0443"), true);
  assert.equal(isAuthorizedBusinessNumberMessage("088229080443", "+62 812 0000 0000"), false);
  assert.equal(isAuthorizedBusinessNumberMessage("628229080443", undefined), false);
});

test("recognizes explicit marketing opt-out messages", async () => {
  const { isMarketingOptOutMessage } = await import("@/server/operations/marketing-consent");
  assert.equal(isMarketingOptOutMessage("STOP"), true);
  assert.equal(isMarketingOptOutMessage(" berhenti! "), true);
  assert.equal(isMarketingOptOutMessage("tolong stop promo"), false);
});

test("shipping quote applies base price and rounded-up kilogram charge", async () => {
  const { calculateShippingQuotes } = await import("@/server/operations/shipping");
  const quotes = calculateShippingQuotes([{ id: "rate", zoneName: "Lombok Tengah", serviceName: "Regular", minWeightGrams: 0, maxWeightGrams: null, basePrice: 10_000, pricePerKg: 5_000, estimatedDays: "1-2 hari" }], "lombok tengah", 1_200);
  assert.equal(quotes[0]?.price, 20_000);
});

test("workflow builder drops excess steps and normalizes unsafe actions", async () => {
  const { normalizeWorkflowSteps } = await import("@/server/operations/workflows");
  const steps = normalizeWorkflowSteps(Array.from({ length: 12 }, (_, index) => ({ type: index === 0 ? "ADD_CONTACT_TAG" : "INVALID", value: `value-${index}` })));
  assert.equal(steps.length, 10);
  assert.equal(steps[0]?.type, "ADD_CONTACT_TAG");
  assert.equal(steps[1]?.type, "NOTIFY_TEAM");
});
