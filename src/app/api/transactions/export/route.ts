import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildTransactionsCsv, parseTransactionFilters } from "@/server/finance/transactions";

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filters = parseTransactionFilters(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const csv = await buildTransactionsCsv(session.userId, filters);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
