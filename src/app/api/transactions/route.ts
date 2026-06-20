import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createManualTransaction,
  getTransactionsPage,
  parseTransactionFilters,
  parseTransactionJsonBody,
} from "@/server/finance/transactions";

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filters = parseTransactionFilters(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const transactions = await getTransactionsPage(session.userId, filters);

  return NextResponse.json(transactions);
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input = parseTransactionJsonBody(body);
    const transaction = await createManualTransaction(session.userId, input);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transaction payload." },
      { status: 400 },
    );
  }
}
