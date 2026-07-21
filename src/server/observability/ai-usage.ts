import { Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";

export async function recordAiUsage(params: {
  businessId?: string | null;
  usageType: string;
  provider: string;
  model: string;
  requestId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs: number;
  status: "SUCCESS" | "FAILED" | "FALLBACK";
  errorCode?: string | null;
}) {
  if (!params.businessId) return;
  const estimatedCost = estimateCost(params.inputTokens, params.outputTokens);
  try {
    await prisma.usageLog.create({
      data: {
        businessId: params.businessId,
        usageType: params.usageType,
        provider: params.provider,
        totalMessages: 1,
        totalAiRequests: 1,
        estimatedCost,
        requestId: params.requestId?.slice(0, 200) || undefined,
        model: params.model.slice(0, 200),
        inputTokens: normalizeTokenCount(params.inputTokens),
        outputTokens: normalizeTokenCount(params.outputTokens),
        latencyMs: Math.max(0, Math.min(120_000, Math.round(params.latencyMs))),
        status: params.status,
        errorCode: params.errorCode?.slice(0, 160) || null,
      },
    });
  } catch (error) {
    // Usage telemetry must never break the customer reply path.
    console.error("AI usage log failed", error);
  }
}

function estimateCost(inputTokens?: number | null, outputTokens?: number | null) {
  const inputRate = Number(process.env.GROQ_INPUT_USD_PER_MILLION ?? "");
  const outputRate = Number(process.env.GROQ_OUTPUT_USD_PER_MILLION ?? "");
  if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || inputRate < 0 || outputRate < 0) {
    return undefined;
  }
  const value = ((inputTokens ?? 0) * inputRate + (outputTokens ?? 0) * outputRate) / 1_000_000;
  return new Prisma.Decimal(value.toFixed(6));
}

function normalizeTokenCount(value?: number | null) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

