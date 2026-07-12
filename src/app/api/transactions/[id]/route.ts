import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  noStoreHeaders,
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
  validateMutationRequest,
} from "@/lib/request-security";
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
  const securityError = validateMutationRequest(request, "json");
  if (securityError) return securityError;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const raw = await readRequestBodyBuffer(request, 64 * 1024);
    const body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
    const input = parseTransactionJsonBody(body);
    const transaction = await updateTransaction(session.userId, id, input);

    return NextResponse.json({ transaction });
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

export async function DELETE(request: NextRequest, context: TransactionRouteContext) {
  const securityError = validateMutationRequest(request);
  if (securityError) return securityError;
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteTransaction(session.userId, id);

    return NextResponse.json({ deleted: true }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete transaction." },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
