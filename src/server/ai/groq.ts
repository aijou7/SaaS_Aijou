type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export async function callGroqJson<T>(params: {
  system: string;
  user: string;
  fallback: T;
}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
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
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
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
      return {
        ok: false,
        source: "fallback" as const,
        data: params.fallback,
        error: "Groq response content is empty.",
      };
    }

    return {
      ok: true,
      source: "groq" as const,
      data: JSON.parse(content) as T,
      error: null,
    };
  } catch (error) {
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
}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
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
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        temperature: 0.3,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ] satisfies GroqMessage[],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return {
        ok: false,
        source: "fallback" as const,
        text: params.fallback,
        error: `Groq request failed with status ${response.status}.`,
      };
    }

    const body = (await response.json()) as GroqChatCompletionResponse;
    const text = body.choices?.[0]?.message?.content?.trim();

    return {
      ok: Boolean(text),
      source: text ? ("groq" as const) : ("fallback" as const),
      text: text || params.fallback,
      error: text ? null : "Groq response content is empty.",
    };
  } catch (error) {
    return {
      ok: false,
      source: "fallback" as const,
      text: params.fallback,
      error: error instanceof Error ? error.message : "Groq request failed.",
    };
  }
}
