type ConversationTurn = { role: "customer" | "assistant"; text: string };

type ConversationFacts = {
  hasAssistantReply: boolean;
  latestAssistantMessage: string | null;
  project:
    | "website"
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
    /^(?:halo|hai|hi|hello|pagi|siang|sore|malam)(?:\s+(?:bro|kak|min|admin))?$/.test(
      normalized,
    )
  ) {
    return "Halo, ada yang bisa saya bantu?";
  }

  if (
    /(?:yang\s+)?(?:balas|jawab|ngobrol).*(?:ai|bot)|(?:ini|kamu|anda).*(?:ai|bot)/.test(
      normalized,
    )
  ) {
    return `Iya, saat ini kamu sedang ngobrol dengan ${params.agentName}, asisten AI. Saya bantu memahami kebutuhan awal dan menyiapkan konteksnya; kapan pun dibutuhkan, percakapan ini bisa diteruskan ke tim manusia.`;
  }

  if (isShortAffirmative(normalized) && facts.latestAssistantMessage) {
    const previous = normalize(facts.latestAssistantMessage);
    if (
      /\b(?:router(?:nya)?|wifi(?:nya)?|wi fi|firmware(?:nya)?|access point|jaringan)\b/.test(
        previous,
      ) &&
      /\b(?:bisa bantu|memeriksa|mengecek|kirim|share|model|status|system information|jika anda mau|kalau kamu mau)\b/.test(
        previous,
      )
    ) {
      return "Siap. Kirim merek dan model router—biasanya tertulis di stiker bawah atau belakang perangkat—atau foto halaman Status/System Information. Dari situ saya bantu identifikasi jenis WiFi, versi firmware, dan langkah update yang sesuai. Jangan kirim password WiFi atau login admin.";
    }
    if (
      /\b(?:kirim|share|unggah|upload)\b.*\b(?:foto|screenshot|model|tipe|dokumen|materi|logo)\b/.test(
        previous,
      )
    ) {
      return "Silakan kirim data atau file yang tadi disebutkan. Setelah itu saya lanjut cek dan beri langkah berikutnya tanpa mengulang pembahasan.";
    }
    if (
      /\b(?:saya|kami) bisa bantu\b|\b(?:kalau|jika) (?:kamu|anda) mau\b|\bmau saya bantu\b/.test(
        previous,
      )
    ) {
      return "Siap, kita lanjut. Kirim informasi yang diminta pada langkah terakhir; setelah itu saya beri arahan yang spesifik dari konteks tersebut.";
    }
  }

  if (
    /\b(?:router(?:nya)?|wifi(?:nya)?|wi fi|firmware(?:nya)?)\b/.test(
      normalized,
    ) &&
    /\b(?:jenis|tipe|versi|update|upgrade|firmware|wifi [4567])\b/.test(
      normalized,
    )
  ) {
    return "Jenis WiFi dan firmware belum bisa dipastikan tanpa model perangkat. Cek stiker bawah atau belakang router untuk merek, model, dan hardware revision; bisa juga kirim foto halaman Status/System Information. Untuk update, gunakan firmware resmi yang tepat untuk model dan revision tersebut—jangan kirim password WiFi atau login admin.";
  }

  if (
    /\b(?:router|wifi|wi fi|firmware)\b/.test(normalized) &&
    /\b(?:jenis|tipe|versi|update|upgrade|firmware|wifi [4567])\b/.test(
      normalized,
    )
  ) {
    return "Jenis WiFi dan firmware belum bisa dipastikan tanpa model perangkat. Cek stiker bawah atau belakang router untuk merek, model, dan hardware revision; bisa juga kirim foto halaman Status/System Information. Untuk update, gunakan firmware resmi yang tepat untuk model dan revision tersebut—jangan kirim password WiFi atau login admin.";
  }

  if (
    /(?:aku|saya|kami|kita)?\s*(?:ga|gak|nggak|tidak|belum)\s*(?:punya|ada)\s*(?:ide|gambaran|bayangan)|bingung\s+(?:mulai|konsep)/.test(
      normalized,
    )
  ) {
    if (
      facts.project === "website" ||
      facts.project === "website company profile"
    ) {
      const industry = facts.industry
        ? ` untuk perusahaan ${facts.industry}`
        : "";
      return `Tidak masalah. Untuk versi awal${industry}, saya sarankan website responsif berisi Beranda, Profil, Produk atau Layanan, Portofolio atau Kredibilitas, dan Kontak/WhatsApp. Apakah logo dan materi profil perusahaannya sudah siap?`;
    }
    if (facts.project === "custom dashboard") {
      return "Tidak masalah, kita bisa mulai dari nol. Langkah pertama cukup tentukan siapa yang memakai dashboard dan keputusan apa yang perlu mereka ambil; dari situ data, tampilan, dan fitur prioritasnya bisa dipetakan. Siapa pengguna utamanya: owner, manajemen, atau tim operasional?";
    }
    return "Tidak masalah, kita bisa mulai dari nol. Ceritakan hasil akhir yang ingin dicapai atau masalah yang paling mengganggu sekarang; dari situ saya bantu susun pilihan yang masuk akal.";
  }

  if (
    /^(?:(?:saya|aku|kami)\s+)?(?:mau|ingin|butuh|perlu)\s+(?:buat|bikin|bangun|membuat|membangun)\s+(?:(?:sebuah|satu)\s+)?(?:website|web)\b/.test(
      normalized,
    )
  ) {
    if (/(?:toko\s*online|e-?commerce|jualan|checkout)/.test(normalized)) {
      return "Bisa. Untuk versi awal, saya sarankan katalog, detail produk, keranjang/checkout, pembayaran, pengelolaan pesanan, dan notifikasi WhatsApp. Produk dan stoknya sekarang dicatat di mana?";
    }
    if (facts.project === "website company profile") {
      return "Bisa. Untuk versi awal, saya sarankan website responsif dengan Beranda, Profil Perusahaan, Produk atau Layanan, Kredibilitas, dan Kontak/WhatsApp. Apakah logo dan materi profil perusahaannya sudah siap?";
    }
    return "Bisa. Untuk versi awal, saya sarankan website responsif yang ringan, mudah dikelola, dan punya jalur kontak yang jelas. Tujuan utamanya company profile, penjualan, atau portal internal?";
  }

  if (
    /^(?:(?:saya|aku|kami)\s+)?(?:mau|ingin|butuh|perlu)\s+(?:(?:buat|bikin|bangun|membuat|membangun)\s+)?(?:custom\s+)?dashboard\b/.test(
      normalized,
    )
  ) {
    return "Bisa. Untuk MVP, saya sarankan mulai dari KPI utama, filter laporan, role-based access, export, dan satu integrasi data paling penting. Datanya sekarang tersimpan di Excel, database, atau aplikasi lain?";
  }

  if (
    /^(?:ingin\s+)?(?:dua[- ]duanya|keduanya|semuanya|dua[- ]dua nya)(?:\s+(?:aja|deh))?$/.test(
      normalized,
    ) &&
    facts.latestAssistantMessage?.includes("?")
  ) {
    const previousQuestion = normalize(
      extractQuestions(facts.latestAssistantMessage).at(-1) ??
        facts.latestAssistantMessage,
    );
    if (
      facts.project === "website company profile" &&
      isWebsiteGoalQuestion(previousQuestion)
    ) {
      const industry = facts.industry ? ` ${facts.industry}` : "";
      return `Siap, berarti websitenya perlu menjalankan dua fungsi: membangun profil dan kredibilitas perusahaan${industry} sekaligus memperkenalkan produk atau layanan. Arah awalnya bisa mencakup beranda, profil, layanan, keunggulan, insight, dan kontak. Berikutnya kita tinggal menentukan prioritas konten dan gaya visualnya.`;
    }

    if (/logo.*warna|warna.*logo/.test(previousQuestion)) {
      return "Siap, berarti logo dan panduan warna sudah ada. Itu cukup untuk mulai menyusun arah visual; berikutnya materi profil perusahaan dan daftar produk atau layanan bisa disiapkan untuk preview.";
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
        : facts.project === "website"
          ? "website versi fokus"
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
    ? "Biar tidak salah arah, sebutkan perangkat atau layanan yang dimaksud dan kendala utamanya dalam satu kalimat."
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

  reply = removeLowValueLead(reply);
  reply = compactReply(reply);

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
  let timeline: string | null = null;

  for (const rawText of customerTexts) {
    const text = normalize(rawText);
    if (
      /(company|corporate|business|perusahaan)\s*profile|website\s*(?:profil|profile)/.test(
        text,
      )
    ) {
      project = "website company profile";
    } else if (/\b(?:website|web)\b/.test(text)) {
      project = "website";
    } else if (/custom\s*dashboard|dashboard\s*(?:custom|khusus)?/.test(text)) {
      project = "custom dashboard";
    } else if (
      /\b(?:wifi(?:nya)?|wi fi|router(?:nya)?|firmware(?:nya)?|access point|jaringan)\b/.test(
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
    if (/\b(?:1|satu)\s*bulan\b/.test(text)) timeline = "satu bulan";
    else if (/\bbulan\s+depan\b/.test(text)) timeline = "bulan depan";
  }

  const assistantTurns = turns.filter((turn) => turn.role === "assistant");
  const latestAssistantMessage = assistantTurns.at(-1)?.text ?? null;
  const contextualTurns = [...turns];
  if (normalize(contextualTurns.at(-1)?.text ?? "") !== normalize(message)) {
    contextualTurns.push({ role: "customer", text: message });
  }
  const wantsBothWebsiteGoals = contextualTurns.some((turn, index) => {
    if (turn.role !== "customer" || !isBothAnswer(turn.text)) return false;
    const previousTurn = contextualTurns[index - 1];
    return (
      previousTurn?.role === "assistant" &&
      isWebsiteGoalQuestion(
        normalize(extractQuestions(previousTurn.text).at(-1) ?? previousTurn.text),
      )
    );
  });
  return {
    hasAssistantReply: assistantTurns.length > 0,
    latestAssistantMessage,
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

function isBothAnswer(text: string) {
  return /^(?:ingin\s+)?(?:dua[- ]duanya|keduanya|semuanya|dua[- ]dua nya)(?:\s+(?:aja|deh))?$/.test(
    normalize(text),
  );
}

function isShortAffirmative(text: string) {
  return /^(?:ya|iya|boleh|oke|ok|siap|lanjut|gas|gass|silakan|ayo)(?:\s+(?:deh|dong|ya|aja|gan|kak|bro))?$/.test(
    text,
  );
}

function isWebsiteGoalQuestion(text: string) {
  const mentionsProfile = /\b(?:informasi|profil|profile|kredibilitas)\b/.test(
    text,
  );
  const mentionsPromotion =
    /\b(?:promosi|mempromosikan|produk|layanan|marketing)\b/.test(text);
  return mentionsProfile && mentionsPromotion;
}

function extractQuestions(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.includes("?"));
}

function removeLowValueLead(value: string) {
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  let removed = 0;
  while (
    sentences.length > 0 &&
    removed < 2 &&
    isLowValueLeadSentence(sentences[0])
  ) {
    sentences.shift();
    removed += 1;
  }
  return sentences.join(" ").trim();
}

function isLowValueLeadSentence(sentence: string) {
  const text = normalize(sentence);
  return (
    /^(?:tentu|baik|oke|siap)$/.test(text) ||
    /^(?:saya|kami) (?:paham|mengerti)(?: bahwa)?\b/.test(text) ||
    /^(?:membuat|membangun|memiliki) (?:sebuah )?(?:website|web|dashboard|aplikasi|software)\b.*\b(?:adalah|merupakan) (?:sebuah )?(?:langkah|pilihan) (?:yang )?(?:tepat|baik|bagus)\b/.test(
      text,
    ) ||
    /^(?:website|web|dashboard|aplikasi|software|hal ini) .*\b(?:dapat|bisa) membantu (?:meningkatkan|memperkuat|mengembangkan)\b/.test(
      text,
    )
  );
}

function compactReply(value: string) {
  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept: string[] = [];
  let wordCount = 0;
  let hasQuestion = false;

  for (const sentence of sentences) {
    const isQuestion = sentence.includes("?");
    if (isQuestion && hasQuestion) continue;

    const sentenceWords = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (kept.length >= 4 || (kept.length > 0 && wordCount + sentenceWords > 90)) {
      break;
    }

    kept.push(sentence.trim());
    wordCount += sentenceWords;
    hasQuestion ||= isQuestion;
  }

  return kept.join(" ").trim();
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
