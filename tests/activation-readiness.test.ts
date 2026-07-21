import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { newWorkspaceAgentDefaults } from "../src/server/agent/defaults";
import {
  buildActivationReadiness,
  isBusinessProfileComplete,
} from "../src/server/business/activation-readiness";

const readyInput = {
  businessProfileComplete: true,
  agentConfigured: true,
  agentActive: false,
  activeKnowledgeCount: 3,
  simulatorTested: true,
  groqConfigured: true,
  channels: {
    webConfigured: true,
    webDetected: true,
    telegram: false,
    whatsapp: false,
  },
};

describe("workspace activation readiness", () => {
  test("keeps a newly-created workspace agent inactive", () => {
    const defaults = newWorkspaceAgentDefaults("Aijou Studio");

    assert.equal(defaults.businessDescription, "Aijou Studio");
    assert.equal(defaults.isActive, false);
  });

  test("does not treat the signup placeholder as a completed business profile", () => {
    assert.equal(
      isBusinessProfileComplete({
        businessName: "Aijou Studio",
        businessType: "Belum diisi",
        mainServices: "Web development",
        serviceArea: "Jakarta",
        operatingHours: "Senin-Jumat",
      }),
      false,
    );
  });

  test("requires a real widget message instead of only a configured origin", () => {
    const readiness = buildActivationReadiness({
      ...readyInput,
      channels: {
        ...readyInput.channels,
        webDetected: false,
      },
    });
    const channel = readiness.checks.find((check) => check.key === "channel");

    assert.equal(channel?.done, false);
    assert.match(channel?.description ?? "", /belum terdeteksi/i);
    assert.equal(readiness.canActivateAgent, false);
  });

  test("allows explicit activation only after every prerequisite is real", () => {
    const beforeActivation = buildActivationReadiness(readyInput);
    const afterActivation = buildActivationReadiness({ ...readyInput, agentActive: true });

    assert.equal(beforeActivation.canActivateAgent, true);
    assert.equal(beforeActivation.readyToComplete, false);
    assert.deepEqual(
      beforeActivation.missingBeforeCompletion.map((check) => check.key),
      ["agent-active"],
    );
    assert.equal(afterActivation.readyToComplete, true);
    assert.equal(afterActivation.percent, 100);
  });

  test("accepts Telegram as the first live channel without requiring WhatsApp", () => {
    const readiness = buildActivationReadiness({
      ...readyInput,
      channels: {
        webConfigured: false,
        webDetected: false,
        telegram: true,
        whatsapp: false,
      },
    });

    assert.equal(readiness.canActivateAgent, true);
    assert.equal(readiness.channels.telegram, true);
  });
});
