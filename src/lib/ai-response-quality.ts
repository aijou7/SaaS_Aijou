export type AiResponseQuality = {
  score: number;
  passed: boolean;
  violations: string[];
  wordCount: number;
  questionCount: number;
};

const genericFillerPatterns = [
  /membuat .{0,80} adalah langkah yang tepat/i,
  /meningkatkan (?:visibilitas|efisiensi|produktivitas) bisnis/i,
  /\bsaya paham\b/i,
  /\btentu saja\b/i,
  /boleh ceritakan kebutuhan, target/i,
  /jawabanmu sudah saya catat.*tambahkan sedikit detail/i,
];

const unsupportedCapabilityPatterns = [
  /\b(?:bisa|dapat) (?:membantu )?(?:memeriksa|mengecek|mengakses) (?:router|perangkat|jaringan|komputer|server) (?:anda|kamu).*(?:secara )?(?:online|langsung|remote)\b/i,
  /\bsaya (?:akan|bisa|dapat) (?:login|masuk) ke (?:router|perangkat|sistem) (?:anda|kamu)\b/i,
];

export function evaluateAiResponseQuality(params: {
  reply: string;
  conversationContext?: string | null;
}) {
  const reply = params.reply.trim();
  const words = reply.match(/\S+/g) ?? [];
  const questionCount = (reply.match(/\?/g) ?? []).length;
  const violations: string[] = [];

  if (!reply) violations.push("empty_reply");
  if (words.length > 90) violations.push("too_long");
  if (questionCount > 1) violations.push("too_many_questions");
  if (genericFillerPatterns.some((pattern) => pattern.test(reply))) {
    violations.push("generic_filler");
  }
  if (unsupportedCapabilityPatterns.some((pattern) => pattern.test(reply))) {
    violations.push("unsupported_remote_access");
  }

  const hasPriorAssistant = /(?:^|\n)(?:Assistant|AI):\s*\S/i.test(
    params.conversationContext ?? "",
  );
  if (hasPriorAssistant && /^(?:halo|hai|selamat datang)\b[!,.:\s-]*/i.test(reply)) {
    violations.push("repeated_greeting");
  }

  const replyQuestion = lastQuestion(reply);
  if (
    replyQuestion &&
    extractAssistantQuestions(params.conversationContext).some(
      (question) => similarity(question, replyQuestion) >= 0.78,
    )
  ) {
    violations.push("repeated_question");
  }

  const deductions: Record<string, number> = {
    empty_reply: 100,
    too_long: 20,
    too_many_questions: 20,
    generic_filler: 35,
    repeated_greeting: 25,
    repeated_question: 45,
    unsupported_remote_access: 60,
  };
  const score = Math.max(
    0,
    100 -
      violations.reduce(
        (total, violation) => total + (deductions[violation] ?? 10),
        0,
      ),
  );

  return {
    score,
    passed: score >= 70,
    violations,
    wordCount: words.length,
    questionCount,
  } satisfies AiResponseQuality;
}

function extractAssistantQuestions(context?: string | null) {
  if (!context) return [];
  return context
    .split(/\r?\n/)
    .filter((line) => /^(?:Assistant|AI):/i.test(line))
    .flatMap((line) => line.match(/[^?.!]*\?/g) ?? [])
    .map(normalize)
    .filter(Boolean);
}

function lastQuestion(value: string) {
  const questions = value.match(/[^?.!]*\?/g) ?? [];
  return normalize(questions.at(-1) ?? "");
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left: string, right: string) {
  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return shared / Math.max(leftWords.size, rightWords.size);
}
