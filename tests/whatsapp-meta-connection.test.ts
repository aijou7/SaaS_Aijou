import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import { whatsAppGraphApiUrl } from "../src/server/whatsapp/graph-api";
import { connectWhatsAppCloudApi } from "../src/server/whatsapp/meta-connection";
import { resolveWhatsAppVerifyToken } from "../src/server/whatsapp/verify-token";

const originalFetch = globalThis.fetch;
const originalGraphVersion = process.env.WHATSAPP_GRAPH_API_VERSION;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("WHATSAPP_GRAPH_API_VERSION", originalGraphVersion);
});

describe("WhatsApp verify token migration", () => {
  test("rotates a short legacy token when activating with blank input", () => {
    let generated = 0;
    const token = resolveWhatsAppVerifyToken({
      existing: "verify-me",
      incoming: "",
      isActive: true,
      generate: () => {
        generated += 1;
        return "generated-secure-verify-token";
      },
    });

    assert.equal(token, "generated-secure-verify-token");
    assert.equal(generated, 1);
  });

  test("preserves valid stored and explicitly supplied tokens", () => {
    const neverGenerate = () => {
      throw new Error("generator should not run");
    };

    assert.equal(
      resolveWhatsAppVerifyToken({
        existing: "existing-secure-verify-token",
        incoming: "",
        isActive: true,
        generate: neverGenerate,
      }),
      "existing-secure-verify-token",
    );
    assert.equal(
      resolveWhatsAppVerifyToken({
        existing: "verify-me",
        incoming: "customer-supplied-token",
        isActive: true,
        generate: neverGenerate,
      }),
      "customer-supplied-token",
    );
    assert.equal(
      resolveWhatsAppVerifyToken({
        existing: "existing-secure-verify-token",
        incoming: "short",
        isActive: true,
        generate: neverGenerate,
      }),
      "short",
    );
  });

  test("drops a short legacy token from an inactive draft", () => {
    assert.equal(
      resolveWhatsAppVerifyToken({
        existing: "change-me",
        incoming: "",
        isActive: false,
      }),
      null,
    );
  });

  test("keeps Verify Token optional across every settings form", async () => {
    const sources = [
      new URL("../src/app/whatsapp/page.tsx", import.meta.url),
      new URL("../src/app/integrations/page.tsx", import.meta.url),
      new URL("../src/app/conversations/page.tsx", import.meta.url),
    ];

    for (const file of sources) {
      const source = await readFile(file, "utf8");
      const input = source.match(/name="verifyToken"[\s\S]{0,500}?\/>/);

      assert.ok(input, `Verify Token input missing in ${file.pathname}`);
      assert.doesNotMatch(input[0], /\brequired=/);
    }
  });

  test("classifies incomplete credentials before access-token errors", async () => {
    const source = await readFile(new URL("../src/app/whatsapp/actions.ts", import.meta.url), "utf8");
    const incomplete = source.indexOf('message.includes("lengkapi")');
    const invalidToken = source.indexOf('message.includes("meta_invalid_token")');
    assert.ok(incomplete >= 0);
    assert.ok(invalidToken > incomplete);
  });
});

describe("WhatsApp Meta connection", () => {
  test("uses the current pinned Graph API version by default", () => {
    delete process.env.WHATSAPP_GRAPH_API_VERSION;
    assert.match(whatsAppGraphApiUrl("123/messages"), /\/v25\.0\/123\/messages$/);
  });

  test("validates WABA ownership and installs the workspace webhook", async () => {
    process.env.WHATSAPP_GRAPH_API_VERSION = "25.0";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url.includes("/phone_numbers?")) {
        return jsonResponse({
          data: [
            {
              id: "222222",
              display_phone_number: "+62 812-0000-0000",
              verified_name: "Aijou",
              quality_rating: "GREEN",
            },
          ],
        });
      }

      return jsonResponse({
        data: [
          {
            override_callback_uri:
              "https://saa-s-aijou.vercel.app/api/webhooks/whatsapp",
          },
        ],
      });
    };

    const result = await connectWhatsAppCloudApi({
      accessToken: "permanent-system-user-token",
      appSecret: "matching-app-secret",
      wabaId: "111111",
      phoneNumberId: "222222",
      webhookUrl: "https://saa-s-aijou.vercel.app/api/webhooks/whatsapp",
      verifyToken: "generated-verify-token",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.phone.verifiedName, "Aijou");
    assert.equal(requests.length, 3);
    assert.match(requests[0].url, /\/v25\.0\/111111\/phone_numbers\?/);
    const expectedProof = createHmac("sha256", "matching-app-secret")
      .update("permanent-system-user-token")
      .digest("hex");
    assert.equal(
      new URL(requests[0].url).searchParams.get("appsecret_proof"),
      expectedProof,
    );
    assert.match(
      requests[1].url,
      new RegExp(`/v25\\.0/111111/subscribed_apps\\?appsecret_proof=${expectedProof}$`),
    );
    assert.equal(requests[1].init?.method, "POST");
    assert.equal(requests[1].init?.body, undefined);
    assert.match(
      requests[2].url,
      new RegExp(`/v25\\.0/111111/subscribed_apps\\?appsecret_proof=${expectedProof}$`),
    );
    assert.equal(requests[2].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[2].init?.body)), {
      override_callback_uri: "https://saa-s-aijou.vercel.app/api/webhooks/whatsapp",
      verify_token: "generated-verify-token",
    });
  });

  test("rejects a token Meta marks invalid without attempting subscription", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse({ error: { code: 190, message: "Invalid OAuth access token" } }, 401);
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_invalid_token",
      status: 401,
    });
    assert.equal(calls, 1);
  });

  test("rejects a Phone Number ID that does not belong to the WABA", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse({ data: [{ id: "different-phone-id" }] });
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, { ok: false, reason: "meta_phone_number_mismatch" });
    assert.equal(calls, 1);
  });

  test("keeps the connection inactive when webhook subscription lacks permission", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ data: [{ id: "222222" }] });
      }
      return jsonResponse({ error: { code: 10, message: "Permission denied" } }, 403);
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_permission_missing",
      status: 403,
    });
    assert.equal(calls, 2);
  });

  test("identifies missing WhatsApp scopes when Meta hides the WABA", async () => {
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          { error: { code: 100, message: "Unsupported get request" } },
          400,
        );
      }

      assert.match(String(input), /\/me\/permissions\?/);
      return jsonResponse({
        data: [
          { permission: "whatsapp_business_management", status: "declined" },
          { permission: "whatsapp_business_messaging", status: "granted" },
        ],
      });
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_permission_missing",
      status: 400,
    });
    assert.equal(calls, 2);
  });

  test("preserves WABA diagnosis when required token scopes are granted", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(
          { error: { code: 100, message: "Unsupported get request" } },
          400,
        );
      }

      return jsonResponse({
        data: [
          { permission: "whatsapp_business_management", status: "granted" },
          { permission: "whatsapp_business_messaging", status: "granted" },
        ],
      });
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_waba_not_found",
      status: 400,
    });
    assert.equal(calls, 2);
  });

  test("sends App Secret Proof while reading WABA phone numbers", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse(
        { error: { code: 100, message: "Invalid appsecret_proof provided" } },
        400,
      );
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_app_secret_mismatch",
      status: 400,
    });
    assert.equal(calls, 1);
  });

  test("does not report WABA missing when callback override returns code 100", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ data: [{ id: "222222" }] });
      }
      if (calls === 2) {
        return jsonResponse({ success: true });
      }
      return jsonResponse(
        {
          error: {
            code: 100,
            message: "Before override the current callback uri, your app must be subscribed",
          },
        },
        400,
      );
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_webhook_subscription_failed",
      status: 400,
    });
    assert.equal(calls, 3);
  });

  test("rejects an App Secret that does not match the token's Meta app", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ data: [{ id: "222222" }] });
      }
      return jsonResponse({ error: { code: 190, message: "Invalid appsecret_proof" } }, 401);
    };

    const result = await connectWhatsAppCloudApi(validConnectionInput());

    assert.deepEqual(result, {
      ok: false,
      reason: "meta_app_secret_mismatch",
      status: 401,
    });
    assert.equal(calls, 2);
  });
});

function validConnectionInput() {
  return {
    accessToken: "permanent-system-user-token",
    appSecret: "matching-app-secret",
    wabaId: "111111",
    phoneNumberId: "222222",
    webhookUrl: "https://saa-s-aijou.vercel.app/api/webhooks/whatsapp",
    verifyToken: "generated-verify-token",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
