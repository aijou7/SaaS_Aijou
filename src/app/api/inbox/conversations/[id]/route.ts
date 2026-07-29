import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/request-security";
import { getSession } from "@/lib/session";
import { getConversationDetailForBusiness } from "@/server/conversations/conversations";

type ConversationDetailRouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: ConversationDetailRouteContext,
) {
  const session = await getSession();
  if (!session?.business) {
    return NextResponse.json(
      { error: "Sesi atau workspace tidak valid." },
      { status: 401, headers: noStoreHeaders },
    );
  }
  const { id } = await context.params;
  const history = Math.min(
    500,
    Math.max(50, Number(request.nextUrl.searchParams.get("history") ?? 50) || 50),
  );
  const detail = await getConversationDetailForBusiness(
    session.business.id,
    id,
    history,
  );
  if (!detail) {
    return NextResponse.json(
      { error: "Percakapan tidak ditemukan." },
      { status: 404, headers: noStoreHeaders },
    );
  }
  return NextResponse.json(detail, { headers: noStoreHeaders });
}
