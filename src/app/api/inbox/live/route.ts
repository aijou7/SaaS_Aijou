import { after, NextResponse } from "next/server";
import { emptyInboxLiveState } from "@/lib/inbox-live";
import { noStoreHeaders } from "@/lib/request-security";
import { getSession } from "@/lib/session";
import { getInboxLiveStateForBusiness } from "@/server/conversations-live";
import { runRequestDrivenJobTick } from "@/server/jobs/request-driven-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  const startedAt = performance.now();
  const workerDeadlineAt = Date.now() + 12_000;
  const session = await getSession();
  const authenticatedAt = performance.now();
  if (!session) {
    return NextResponse.json(
      { error: "Sesi tidak valid." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const state = session.business
    ? await getInboxLiveStateForBusiness(session.business.id)
    : { ...emptyInboxLiveState };
  const completedAt = performance.now();
  after(async () => {
    await runRequestDrivenJobTick({ deadlineAt: workerDeadlineAt });
  });
  return NextResponse.json(state, {
    headers: {
      ...noStoreHeaders,
      "Server-Timing": [
        `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
        `inbox;dur=${(completedAt - authenticatedAt).toFixed(1)}`,
        `total;dur=${(completedAt - startedAt).toFixed(1)}`,
      ].join(", "),
    },
  });
}
