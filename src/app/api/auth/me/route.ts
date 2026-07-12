import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/request-security";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401, headers: noStoreHeaders });
  }

  return NextResponse.json(
    {
      user: {
        id: session.userId,
        email: session.email,
      },
    },
    { headers: noStoreHeaders },
  );
}
