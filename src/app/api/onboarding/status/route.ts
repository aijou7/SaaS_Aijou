import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOnboardingGuideStatus } from "@/server/business/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sesi berakhir." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Onboarding belongs to the workspace owner, not to every invited account.
  // Members inherit the owner's configured workspace and must never receive a
  // fresh-business wizard after joining the team.
  if (session.role !== "OWNER") {
    return NextResponse.json(
      {
        onboardingCompleted: true,
        readyToComplete: true,
        completed: 0,
        total: 0,
        percent: 100,
        checks: [],
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  try {
    const page = await getOnboardingGuideStatus(session.userId);
    if (page.onboardingCompleted || !page.readiness) {
      return NextResponse.json(
        {
          onboardingCompleted: true,
          readyToComplete: true,
          completed: 0,
          total: 0,
          percent: 100,
          checks: [],
        },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    return NextResponse.json(
      {
        onboardingCompleted: false,
        readyToComplete: page.readiness.readyToComplete,
        completed: page.readiness.completed,
        total: page.readiness.total,
        percent: page.readiness.percent,
        checks: page.readiness.checks,
        profile: page.profile,
        agent: page.agent,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Status setup belum dapat dimuat." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
