import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getReceiptReviewPage } from "@/server/receipts/receipt-flow";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const receipts = await getReceiptReviewPage(session.userId);

  return NextResponse.json(receipts);
}
