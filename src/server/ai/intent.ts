import { z } from "zod";

export const intentResultSchema = z.object({
  intent: z.enum([
    "expense_create",
    "expense_confirm",
    "expense_cancel",
    "expense_summary",
    "correction_request",
    "unknown",
  ]),
  confidenceScore: z.number().min(0).max(1),
});

export type IntentResult = z.infer<typeof intentResultSchema>;

export function detectIntentFromText(message: string): IntentResult {
  const normalized = message.toLowerCase().trim();

  if (/^(ya|iya|ok|oke|simpan|lanjut|betul)\b/.test(normalized)) {
    return { intent: "expense_confirm", confidenceScore: 0.86 };
  }

  if (/^(batal|cancel|jangan|hapus draft)\b/.test(normalized)) {
    return { intent: "expense_cancel", confidenceScore: 0.86 };
  }

  if (/(rekap|summary|total|pengeluaran).*(bulan|minggu|hari|ini)/.test(normalized)) {
    return { intent: "expense_summary", confidenceScore: 0.82 };
  }

  if (/(catat|beli|bayar|expense|pengeluaran|nota|bon)/.test(normalized)) {
    return { intent: "expense_create", confidenceScore: 0.78 };
  }

  if (/(ubah|koreksi|salah|ganti)/.test(normalized)) {
    return { intent: "correction_request", confidenceScore: 0.72 };
  }

  return { intent: "unknown", confidenceScore: 0.4 };
}

export const expenseExtractionSchema = z.object({
  transactionType: z.literal("expense"),
  transactionDate: z.string(),
  merchantName: z.string().nullable(),
  categoryName: z.string().nullable(),
  projectName: z.string().nullable(),
  totalAmount: z.number().nullable(),
  description: z.string(),
  confidenceScore: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
});

export type ExpenseExtraction = z.infer<typeof expenseExtractionSchema>;

export function extractExpenseFromText(message: string, now = new Date()): ExpenseExtraction {
  const amount = extractIndonesianAmount(message);
  const missingFields: string[] = [];

  if (amount === null) {
    missingFields.push("total_amount");
  }

  return {
    transactionType: "expense",
    transactionDate: now.toISOString().slice(0, 10),
    merchantName: null,
    categoryName: inferCategory(message),
    projectName: inferProject(message),
    totalAmount: amount,
    description: message.trim(),
    confidenceScore: amount === null ? 0.46 : 0.76,
    missingFields,
  };
}

function extractIndonesianAmount(message: string) {
  const normalized = message.toLowerCase().replace(/\s+/g, " ");
  const matches = Array.from(
    normalized.matchAll(/(rp\s*)?(\d+(?:[.,]\d{3})*|\d+)(?:\s*(ribu|rb|juta|jt))?/g),
  );

  if (matches.length === 0) {
    return null;
  }

  const scoredMatches = matches.map((match, index) => {
    const hasCurrency = Boolean(match[1]);
    const rawNumber = match[2];
    const suffix = match[3];
    const hasThousandsSeparator = /[.,]/.test(rawNumber);
    const score =
      (hasCurrency ? 4 : 0) +
      (suffix ? 4 : 0) +
      (hasThousandsSeparator ? 2 : 0) +
      index / 100;

    return {
      rawNumber,
      suffix,
      score,
    };
  });

  scoredMatches.sort((a, b) => b.score - a.score);

  const selected = scoredMatches[0];
  const rawNumber = selected.rawNumber.replace(/[.,]/g, "");
  const baseAmount = Number(rawNumber);

  if (!Number.isFinite(baseAmount)) {
    return null;
  }

  const suffix = selected.suffix;

  if (suffix === "ribu" || suffix === "rb") {
    return baseAmount * 1000;
  }

  if (suffix === "juta" || suffix === "jt") {
    return baseAmount * 1000000;
  }

  return baseAmount;
}

function inferCategory(message: string) {
  const normalized = message.toLowerCase();

  if (/(kabel|mouse|keyboard|router|lan|switch|alat|perlengkapan)/.test(normalized)) {
    return "perlengkapan project";
  }

  if (/(grab|gojek|bensin|tol|parkir|transport)/.test(normalized)) {
    return "transport";
  }

  if (/(makan|kopi|meeting|lunch|dinner)/.test(normalized)) {
    return "makan meeting";
  }

  return null;
}

function inferProject(message: string) {
  const match = message.match(/\b(?:project|client|buat)\s+([A-Za-z0-9 ._-]{2,40})/i);

  return match?.[1]?.replace(/^(project|client)\s+/i, "").trim() ?? null;
}
