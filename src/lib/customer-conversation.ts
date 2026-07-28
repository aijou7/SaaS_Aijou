type ConversationTurn = { role: "customer" | "assistant"; text: string };

type ConversationFacts = {
  hasAssistantReply: boolean;
  latestAssistantMessage: string | null;
  project:
    | "website company profile"
    | "custom dashboard"
    | "WiFi/jaringan"
    | "software/aplikasi"
    | null;
  industry: string | null;
  wantsPreview: boolean;
  wantsBothWebsiteGoals: boolean;
  timeline: string | null;
};

export function buildDerivedConversationContext(
  message: string,
  conversationContext?: string,
) {
  const facts = deriveFacts(message, conversationContext);
  const knownFacts = [
    facts.project ? `Kebutuhan terbaru: ${facts.project}` : null,
    facts.industry ? `Industri: ${facts.industry}` : null,
    facts.wantsPreview ? "Meminta preview/arah desain awal" : null,
    facts.wantsBothWebsiteGoals
      ? "Website ditujukan untuk profil perusahaan sekaligus promosi produk/layanan"
      : null,
    facts.timeline ? `Target waktu: ${facts.timeline}` : null,
  ].filter(Boolean);

  return knownFacts.length
    ? knownFacts.join("\n")
    : "Belum ada fakta kebutuhan yang cukup spesifik.";
}

export function buildContextualCustomerReply(params: {
  message: string;
  conversationContext?: string;
  agentName: string;
}) {
  const normalized = normalize(params.message);
  const facts = deriveFacts(params.message, params.conversationContext);

  if (
    /(?:yang\s+)?(?:balas|jawab|ngobrol).*(?:ai|bot)|(?:ini|kamu|anda).*(?:ai|bot)/.test(
      normalized,
    )
  ) {
    return `Iya, saat ini kamu sedang ngobrol dengan ${params.agentName}, asisten AI. Saya bantu memahami kebutuhan awal dan menyiapkan konteksnya; kapan pun dibutuhkan, percakapan ini bisa diteruskan ke tim manusia.`;
  }

  if (
    /(?:aku|saya|kami|kita)?\s*(?:ga|gak|nggak|tidak|belum)\s*(?:punya|ada)\s*(?:ide|gambaran|bayangan)|bingung\s+(?:mulai|konsep)/.test(
      normalized,
    )
  ) {
    if (facts.project === "website company profile") {
      const industry = facts.industry
        ? ` untuk perusahaan ${facts.industry}`
        : "";
      return `Tidak masalah, konsepnya bisa kita mulai dari nol. Untuk website company profile${industry}, arah awal yang aman adalah beranda, profil perusahaan, produk atau layanan, keunggulan dan kredibilitas, lalu kontak. Setelah itu visualnya disesuaikan dengan karakter brand. Apakah perusahaan sudah punya logo dan panduan warna?`;
    }
    if (facts.project === "custom dashboard") {
      return "Tidak masalah, kita bisa mulai dari nol. Langkah pertama cukup tentukan siapa yang memakai dashboard dan keputusan apa yang perlu mereka ambil; dari situ data, tampilan, dan fitur prioritasnya bisa dipetakan. Siapa pengguna utamanya: owner, manajemen, atau tim operasional?";
    }
    return "Tidak masalah, kita bisa mulai dari nol. Ceritakan hasil akhir yang ingin dicapai atau masalah yang paling mengganggu sekarang; dari situ saya bantu susun pilihan yang masuk akal.";
  }

  if (
    /^(?:ingin\s+)?(?:dua[- ]duanya|keduanya|semuanya|dua[- ]dua nya)(?:\s+(?:aja|deh))?$/.test(
      normalized,
    ) &&
    facts.latestAssistantMessage?.includes("?")
  ) {
    if (facts.project === "website company profile") {
      const industry = facts.industry ? ` ${facts.industry}` : "";
      return `Siap, berarti websitenya perlu menjalankan dua fungsi: membangun profil dan kredibilitas perusahaan${industry} sekaligus memperkenalkan produk atau layanan. Arah awalnya bisa mencakup beranda, profil, layanan, keunggulan, insight, dan kontak. Berikutnya kita tinggal menentukan prioritas konten dan gaya visualnya.`;
    }
    return "Siap, keduanya saya catat. Dua kebutuhan itu tetap menjadi satu scope, lalu kita prioritaskan bagian yang wajib masuk versi awal supaya pembahasannya tidak kembali dari nol.";
  }

  const asksOneMonth =
    /(?:bisa|cukup|selesai|jadi).*(?:1|satu)\s*bulan|(?:1|satu)\s*bulan.*(?:bisa|cukup|selesai|jadi)/.test(
      normalized,
    );
  if (asksOneMonth && facts.project) {
    const project =
      facts.project === "website company profile"
        ? "website company profile versi fokus"
        : facts.project;
    return `Target satu bulan cukup realistis untuk ${project}, selama scope, materi, dan keputusan desain dikunci sejak awal. Preview desain bisa diprioritaskan di minggu pertama, lalu pengerjaan dan revisi berjalan setelah arahnya disetujui. Estimasi final tetap perlu dikonfirmasi tim setelah scope-nya lengkap.`;
  }

  if (
    /^(?:target(?:nya)?\s+)?bulan\s+depan(?:\s+(?:bisa|ya))?$/.test(
      normalized,
    ) &&
    facts.project
  ) {
    return "Oke, targetnya bulan depan sudah saya catat. Supaya waktunya aman, scope inti dan materi sebaiknya dikunci lebih dulu, kemudian preview desain dikerjakan sebagai tahap pertama. Tim tetap perlu mengonfirmasi tanggal mulai dan kapasitas sebelum memberi komitmen final.";
  }

  return null;
}

export function buildContextAwareFallback(params: {
  message: string;
  conversationContext?: string;
  agentName: string;
}) {
  const contextualReply = buildContextualCustomerReply(params);
  if (contextualReply) return contextualReply;

  const facts = deriveFacts(params.message, params.conversationContext);
  if (/(harga|biaya|budget|quotation|penawaran)/.test(normalize(params.message))) {
    return facts.project
      ? `Untuk ${facts.project}, estimasi final mengikuti scope yang dipilih. Konteks yang sudah kamu sampaikan tetap saya catat; fitur atau hasil apa yang paling wajib masuk?`
      : "Untuk memberi estimasi yang masuk akal, saya perlu tahu layanan dan scope yang dimaksud. Kebutuhan utamanya apa?";
  }

  if (facts.project) {
    const details = [
      facts.industry ? `untuk perusahaan ${facts.industry}` : null,
      facts.wantsPreview ? "dengan preview desain sebagai tahap awal" : null,
      facts.timeline ? `dan target ${facts.timeline}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return `Oke, konteks ${facts.project}${details ? ` ${details}` : ""} sudah saya catat. Kita lanjut dari informasi itu, bukan mengulang dari awal. Bagian mana yang ingin kamu pastikan berikutnya: scope, proses pengerjaan, atau estimasi?`;
  }
  return facts.hasAssistantReply
    ? "Oke, jawabanmu sudah saya catat. Bisa tambahkan sedikit detail tentang bagian yang paling penting supaya saya melanjutkan dari konteks yang sama?"
    : "Ceritakan kebutuhan utama atau masalah yang ingin diselesaikan, nanti saya bantu petakan langkah yang paling masuk akal.";
}

export function polishCustomerReply(params: {
  reply: string;
  conversationContext?: string;
  fallback: string;
}) {
  const previous = parseConversation(params.conversationContext)
    .filter((turn) => turn.role === "assistant")
    .map((turn) => turn.text);
  let reply = params.reply.trim();

  if (previous.length) {
    reply = reply
      .replace(
        /^(?:(?:halo|hai|hi|selamat\s+(?:datang|pagi|siang|sore|malam))[\s!,.:-]*)+/i,
        "",
      )
      .replace(/^[a-z]/, (letter) => letter.toUpperCase())
      .trim();
    const questions = previous.flatMap(extractQuestions);
    reply = reply
      .split(/(?<=[.!?])\s+/)
      .filter(
        (sentence) =>
          !sentence.includes("?") ||
          !questions.some((question) => similarity(question, sentence) >= 0.72),
      )
      .join(" ")
      .trim();
  }

  return !reply || previous.some((text) => similarity(text, reply) >= 0.88)
    ? params.fallback
    : reply;
}

function deriveFacts(
  message: string,
  conversationContext?: string,
): ConversationFacts {
  const turns = parseConversation(conversationContext);
  const customerTexts = turns
    .filter((turn) => turn.role === "customer")
    .map((turn) => turn.text);
  if (normalize(customerTexts.at(-1) ?? "") !== normalize(message)) {
    customerTexts.push(message);
  }

  let project: ConversationFacts["project"] = null;
  let industry: string | null = null;
  let wantsPreview = false;
  let wantsBothWebsiteGoals = false;
  let timeline: string | null = null;

  for (const rawText of customerTexts) {
    const text = normalize(rawText);
    if (
      /(company|corporate|business|perusahaan)\s*profile|website\s*(?:profil|profile)/.test(
        text,
      )
    ) {
      project = "website company profile";
    } else if (/custom\s*dashboard|dashboard\s*(?:custom|khusus)?/.test(text)) {
      project = "custom dashboard";
    } else if (
      /(?:pasang|instalasi|setup|bangun).*(?:wifi|wi-fi|jaringan)|(?:wifi|wi-fi|jaringan).*(?:villa|kantor|gedung|bangunan)/.test(
        text,
      )
    ) {
      project = "WiFi/jaringan";
    } else if (/(?:software|aplikasi|automation|otomasi)/.test(text)) {
      project = "software/aplikasi";
    }
    if (/\b(?:perbankan|bank|finansial|keuangan)\b/.test(text)) {
      industry = "perbankan";
    }
    wantsPreview ||= /\b(?:preview|mockup|desain awal|design awal|contoh desain)\b/.test(
      text,
    );
    wantsBothWebsiteGoals ||=
      /^(?:ingin\s+)?(?:dua[- ]duanya|keduanya|semuanya|dua[- ]dua nya)/.test(
        text,
      );
    if (/\b(?:1|satu)\s*bulan\b/.test(text)) timeline = "satu bulan";
    else if (/\bbulan\s+depan\b/.test(text)) timeline = "bulan depan";
  }

  const assistantTurns = turns.filter((turn) => turn.role === "assistant");
  return {
    hasAssistantReply: assistantTurns.length > 0,
    latestAssistantMessage: assistantTurns.at(-1)?.text ?? null,
    project,
    industry,
    wantsPreview,
    wantsBothWebsiteGoals,
    timeline,
  };
}

function parseConversation(context?: string) {
  if (!context?.trim()) return [] as ConversationTurn[];
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | null = null;
  for (const line of context.split(/\r?\n/)) {
    const match = line.match(
      /^(Customer|User|AI|Aijou|Assistant|Agent|Bot)\s*:\s*(.*)$/i,
    );
    if (match) {
      if (current) turns.push(current);
      current = {
        role: /^(customer|user)$/i.test(match[1]) ? "customer" : "assistant",
        text: match[2].trim(),
      };
    } else if (current && line.trim()) {
      current.text = `${current.text}\n${line.trim()}`.trim();
    }
  }
  if (current) turns.push(current);
  return turns;
}

function extractQuestions(text: string) {
  return text
    .split(/(?<=\?)\s+/)
    .filter((sentence) => sentence.includes("?"));
}

function similarity(left: string, right: string) {
  const a = new Set(normalize(left).split(" ").filter(Boolean));
  const b = new Set(normalize(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
