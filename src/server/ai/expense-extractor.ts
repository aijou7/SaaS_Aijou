import {
  expenseExtractionSchema,
  extractExpenseFromText,
  type ExpenseExtraction,
} from "@/server/ai/intent";
import { callGroqJson } from "@/server/ai/groq";

export async function extractExpenseFromTextAi(message: string, now = new Date()) {
  const fallback = extractExpenseFromText(message, now);
  const result = await callGroqJson<ExpenseExtraction>({
    fallback,
    system: [
      "You extract Indonesian expense transactions from WhatsApp messages.",
      "Return only valid JSON. Do not include markdown.",
      "Schema:",
      "{",
      '  "transactionType": "expense",',
      '  "transactionDate": "YYYY-MM-DD",',
      '  "merchantName": string or null,',
      '  "categoryName": string or null,',
      '  "projectName": string or null,',
      '  "totalAmount": number or null,',
      '  "description": string,',
      '  "confidenceScore": number between 0 and 1,',
      '  "missingFields": string[]',
      "}",
      "Rules:",
      "- Use today's date if no date is mentioned.",
      "- Convert Indonesian amounts such as 450 ribu, 150rb, Rp150.000, 2 juta.",
      "- Do not invent unreadable or missing data.",
      "- totalAmount must be null if no amount is found.",
    ].join("\n"),
    user: JSON.stringify({
      today: now.toISOString().slice(0, 10),
      message,
    }),
  });

  const parsed = expenseExtractionSchema.safeParse(result.data);

  if (!parsed.success) {
    return fallback;
  }

  return {
    ...parsed.data,
    transactionType: "expense" as const,
    confidenceScore: result.source === "groq" ? parsed.data.confidenceScore : fallback.confidenceScore,
  };
}
