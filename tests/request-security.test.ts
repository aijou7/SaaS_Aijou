import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { validateMutationRequest } from "../src/lib/request-security";

function loginRequest(origin: string) {
  return new NextRequest("https://saa-s-aijou.vercel.app/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
      "sec-fetch-site": "cross-site",
    },
  });
}

function proxiedCustomDomainRequest(origin: string, forwardedHost = "aijou.site") {
  return new NextRequest("https://saa-s-aijou.vercel.app/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: "saa-s-aijou.vercel.app",
      origin,
      "sec-fetch-site": "same-origin",
      "x-forwarded-host": forwardedHost,
      "x-forwarded-proto": "https",
    },
  });
}

describe("mutation request origin validation", () => {
  test("allows an explicitly trusted app origin even when the browser labels it cross-site", () => {
    const response = validateMutationRequest(
      loginRequest("https://saa-s-aijou.vercel.app"),
      "urlencoded",
    );

    assert.equal(response, null);
  });

  test("still rejects an untrusted cross-site origin", async () => {
    const response = validateMutationRequest(
      loginRequest("https://attacker.example"),
      "urlencoded",
    );

    assert.ok(response);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "Cross-site request ditolak.",
    });
  });

  test("accepts the public custom domain forwarded by the trusted deployment proxy", () => {
    const response = validateMutationRequest(
      proxiedCustomDomainRequest("https://aijou.site"),
      "form",
    );

    assert.equal(response, null);
  });

  test("does not confuse a forwarded custom host with an arbitrary browser origin", async () => {
    const response = validateMutationRequest(
      proxiedCustomDomainRequest("https://attacker.example"),
      "form",
    );

    assert.ok(response);
    assert.equal(response.status, 403);
  });

  test("rejects malformed forwarded hosts instead of widening the trusted origin set", async () => {
    const response = validateMutationRequest(
      proxiedCustomDomainRequest("https://aijou.site", "aijou.site/attacker.example"),
      "form",
    );

    assert.ok(response);
    assert.equal(response.status, 403);
  });
});
