import { after, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/request-security";
import { getSession } from "@/lib/session";
import { getInboxLiveState } from "@/server/conversations-live";
import { runRequestDrivenJobTick } from "@/server/jobs/request-driven-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  const workerDeadlineAt = Date.now() + 12_000;
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sesi tidak valid." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const state = await getInboxLiveState(session.userId);
  after(async () => {
    await runRequestDrivenJobTick({ deadlineAt: workerDeadlineAt });
  });
  return NextResponse.json(state, { headers: noStoreHeaders });
}
