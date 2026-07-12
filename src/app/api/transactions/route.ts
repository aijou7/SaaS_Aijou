import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  noStoreHeaders,
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
  validateMutationRequest,
} from "@/lib/request-security";
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

  return NextResponse.json(transactions, { headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  const securityError = validateMutationRequest(request, "json");
  if (securityError) return securityError;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await readRequestBodyBuffer(request, 64 * 1024);
    const body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    const input = parseTransactionJsonBody(body);
    const transaction = await createManualTransaction(session.userId, input);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Transaction payload terlalu besar." },
        { status: 413, headers: noStoreHeaders },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid transaction payload." },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
