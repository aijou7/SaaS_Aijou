type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqChatCompletionResponse = {
  id?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

import { recordAiUsage } from "@/server/observability/ai-usage";

export async function callGroqJson<T>(params: {
  system: string;
  user: string;
  fallback: T;
  businessId?: string;
  usageType?: string;
}) {
  const apiKey = process.env.GROQ_API_KEY;
  const startedAt = performance.now();
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!apiKey) {
    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CHAT_JSON", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FALLBACK", errorCode: "not_configured" });
    return {
      ok: false,
      source: "fallback" as const,
      data: params.fallback,
      error: "GROQ_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ] satisfies GroqMessage[],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CHAT_JSON", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FAILED", errorCode: `http_${response.status}` });
      return {
        ok: false,
        source: "fallback" as const,
        data: params.fallback,
        error: `Groq request failed with status ${response.status}.`,
      };
    }

    const body = (await response.json()) as GroqChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;

    if (!content) {
      await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CHAT_JSON", provider: "GROQ", model, requestId: body.id, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, latencyMs: performance.now() - startedAt, status: "FAILED", errorCode: "empty_response" });
      return {
        ok: false,
        source: "fallback" as const,
        data: params.fallback,
        error: "Groq response content is empty.",
      };
    }

    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CHAT_JSON", provider: "GROQ", model, requestId: body.id, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, latencyMs: performance.now() - startedAt, status: "SUCCESS" });
    return {
      ok: true,
      source: "groq" as const,
      data: JSON.parse(content) as T,
      error: null,
    };
  } catch (error) {
    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CHAT_JSON", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FAILED", errorCode: error instanceof Error ? error.name : "request_failed" });
    return {
      ok: false,
      source: "fallback" as const,
      data: params.fallback,
      error: error instanceof Error ? error.message : "Groq request failed.",
    };
  }
}

export async function callGroqText(params: {
  system: string;
  user: string;
  fallback: string;
  businessId?: string;
  usageType?: string;
}) {
  const apiKey = process.env.GROQ_API_KEY;
  const startedAt = performance.now();
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!apiKey) {
    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CUSTOMER_REPLY", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FALLBACK", errorCode: "not_configured" });
    return {
      ok: false,
      source: "fallback" as const,
      text: params.fallback,
      error: "GROQ_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ] satisfies GroqMessage[],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CUSTOMER_REPLY", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FAILED", errorCode: `http_${response.status}` });
      return {
        ok: false,
        source: "fallback" as const,
        text: params.fallback,
        error: `Groq request failed with status ${response.status}.`,
      };
    }

    const body = (await response.json()) as GroqChatCompletionResponse;
    const text = body.choices?.[0]?.message?.content?.trim();

    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CUSTOMER_REPLY", provider: "GROQ", model, requestId: body.id, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens, latencyMs: performance.now() - startedAt, status: text ? "SUCCESS" : "FAILED", errorCode: text ? null : "empty_response" });

    return {
      ok: Boolean(text),
      source: text ? ("groq" as const) : ("fallback" as const),
      text: text || params.fallback,
      error: text ? null : "Groq response content is empty.",
    };
  } catch (error) {
    await recordAiUsage({ businessId: params.businessId, usageType: params.usageType ?? "CUSTOMER_REPLY", provider: "GROQ", model, latencyMs: performance.now() - startedAt, status: "FAILED", errorCode: error instanceof Error ? error.name : "request_failed" });
    return {
      ok: false,
      source: "fallback" as const,
      text: params.fallback,
      error: error instanceof Error ? error.message : "Groq request failed.",
    };
  }
}
