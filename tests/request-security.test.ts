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
});
