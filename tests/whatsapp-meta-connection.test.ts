import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, test } from "node:test";
import { whatsAppGraphApiUrl } from "../src/server/whatsapp/graph-api";
import { connectWhatsAppCloudApi } from "../src/server/whatsapp/meta-connection";

const originalFetch = globalThis.fetch;
const originalGraphVersion = process.env.WHATSAPP_GRAPH_API_VERSION;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("WHATSAPP_GRAPH_API_VERSION", originalGraphVersion);
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
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /\/v25\.0\/111111\/phone_numbers\?/);
    const expectedProof = createHmac("sha256", "matching-app-secret")
      .update("permanent-system-user-token")
      .digest("hex");
    assert.match(
      requests[1].url,
      new RegExp(`/v25\\.0/111111/subscribed_apps\\?appsecret_proof=${expectedProof}$`),
    );
    assert.equal(requests[1].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
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
