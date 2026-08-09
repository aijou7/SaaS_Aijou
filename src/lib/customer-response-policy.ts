export type CustomerResponsePolicy = {
  maxWords: number;
  instruction: string;
};

export function buildCustomerResponsePolicy(message: string): CustomerResponsePolicy {
  const normalized = message.toLowerCase();
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  const technical =
    wordCount >= 28 ||
    message.length >= 220 ||
    /\b(?:api|database|server|network|jaringan|wifi|router|firewall|vlan|vpn|dns|cloud|hosting|deployment|integrasi|webhook|security|keamanan|arsitektur|infrastruktur|framework|software|aplikasi|dashboard|automation|otomasi|error|log|firmware|bandwidth|latency|topologi)\b/i.test(
      normalized,
    );

  if (technical) {
    return {
      maxWords: 140,
      instruction: [
        "Final response contract for this technical or multi-part request:",
        "- Start with the direct conclusion, diagnosis, or recommendation; no preamble.",
        "- Include only details that help the customer decide or act.",
        "- Use 2-5 short numbered steps or bullets when they make the answer easier to scan.",
        "- Explain unavoidable technical terms in plain Indonesian.",
        "- Stay under 140 words, ask at most one high-impact question, and omit a closing summary.",
        "- Never repeat the customer's question, known facts, greetings, generic benefits, or marketing filler.",
      ].join("\n"),
    };
  }

  return {
    maxWords: 75,
    instruction:
      "Final response contract: answer directly in 1-3 short sentences and stay under 75 words. Ask at most one necessary question. Do not use headings, bullet points, repeated greetings, canned phrases, conclusions, or generic marketing claims.",
  };
}
