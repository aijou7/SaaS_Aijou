import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  confirmReceiptReview,
  rejectReceiptReview,
} from "@/server/receipts/receipt-flow";

type ReceiptReviewRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: ReceiptReviewRouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "confirm";

  try {
    if (action === "reject") {
      const result = await rejectReceiptReview(session.userId, id);
      return NextResponse.json(result);
    }

    const totalAmount = Number(body.totalAmount);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json({ error: "totalAmount must be greater than 0." }, { status: 400 });
    }

    const result = await confirmReceiptReview(session.userId, id, {
      transactionDate: String(body.transactionDate ?? ""),
      merchantName: typeof body.merchantName === "string" ? body.merchantName : "",
      categoryName: typeof body.categoryName === "string" ? body.categoryName : "",
      projectName: typeof body.projectName === "string" ? body.projectName : "",
      totalAmount,
      description: typeof body.description === "string" ? body.description : "",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review receipt." },
      { status: 400 },
    );
  }
}
