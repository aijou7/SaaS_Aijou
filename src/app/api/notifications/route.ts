import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/request-security";
import { getSession } from "@/lib/session";
import { getNotificationCenter } from "@/server/notifications/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sesi tidak valid." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10);
  const center = await getNotificationCenter(session.userId, limit);
  return NextResponse.json(center, { headers: noStoreHeaders });
}
