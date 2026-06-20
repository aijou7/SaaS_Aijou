import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  deleteTransaction,
  parseTransactionJsonBody,
  updateTransaction,
} from "@/server/finance/transactions";

type TransactionRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: TransactionRouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseTransactionJsonBody(body);
    const transaction = await updateTransaction(session.userId, id, input);

    return NextResponse.json({ transaction });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transaction payload." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: TransactionRouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteTransaction(session.userId, id);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete transaction." },
      { status: 400 },
    );
  }
}
