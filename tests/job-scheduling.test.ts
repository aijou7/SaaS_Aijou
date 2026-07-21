import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLeadRefreshRerun,
  hasLeadRefreshRerun,
  markLeadRefreshRerun,
  orderTenantFairCandidates,
  reserveRequestDrivenTick,
} from "../src/server/jobs/job-scheduling";

test("lead refresh rerun marker preserves the newest payload and is removable", () => {
  const newest = markLeadRefreshRerun({
    conversationId: "conversation-1",
    source: "WEB_CHAT",
  });

  assert.equal(hasLeadRefreshRerun(newest), true);
  assert.deepEqual(clearLeadRefreshRerun(newest), {
    conversationId: "conversation-1",
    source: "WEB_CHAT",
  });
  assert.equal(hasLeadRefreshRerun(clearLeadRefreshRerun(newest)), false);
});

test("tenant fair ordering gives every workspace a turn before spare capacity", () => {
  const jobs = [
    job("a-1", "workspace-a", 1),
    job("a-2", "workspace-a", 2),
    job("a-3", "workspace-a", 3),
    job("b-1", "workspace-b", 4),
    job("c-1", "workspace-c", 5),
  ];

  assert.deepEqual(
    orderTenantFairCandidates(jobs, 5).map((candidate) => candidate.id),
    ["a-1", "b-1", "c-1", "a-2", "a-3"],
  );
});

test("request-driven tick lease suppresses repeated inbox polls without a DB lease", () => {
  const first = reserveRequestDrivenTick({
    nowMs: 100_000,
    nextEligibleAtMs: 0,
    intervalMs: 30_000,
  });
  assert.deepEqual(first, { reserved: true, nextEligibleAtMs: 130_000 });

  const early = reserveRequestDrivenTick({
    nowMs: 110_000,
    nextEligibleAtMs: first.nextEligibleAtMs,
    intervalMs: 30_000,
  });
  assert.deepEqual(early, { reserved: false, nextEligibleAtMs: 130_000 });

  const due = reserveRequestDrivenTick({
    nowMs: 130_000,
    nextEligibleAtMs: early.nextEligibleAtMs,
    intervalMs: 30_000,
  });
  assert.deepEqual(due, { reserved: true, nextEligibleAtMs: 160_000 });
});

function job(id: string, businessId: string, order: number) {
  return {
    id,
    businessId,
    runAfter: new Date(order * 1_000),
    createdAt: new Date(order * 1_000),
  };
}
