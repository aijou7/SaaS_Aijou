import { z } from "zod";

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  transactionDate: z.string().nullable(),
  totalAmount: z.number().nullable(),
  categoryName: z.string().nullable(),
  rawText: z.string().nullable(),
  confidenceScore: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export async function extractReceiptFromMedia(params: {
  providerMediaId?: string | null;
  mimeType?: string | null;
}): Promise<ReceiptExtraction> {
  return {
    merchantName: null,
    transactionDate: null,
    totalAmount: null,
    categoryName: null,
    rawText: params.providerMediaId
      ? `OCR provider belum dikonfigurasi. Media ID: ${params.providerMediaId}`
      : "OCR provider belum dikonfigurasi.",
    confidenceScore: 0.2,
    missingFields: ["merchant_name", "transaction_date", "total_amount"],
  };
}
