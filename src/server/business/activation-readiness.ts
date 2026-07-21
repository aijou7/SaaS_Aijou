export type ActivationReadinessInput = {
  businessProfileComplete: boolean;
  agentConfigured: boolean;
  agentActive: boolean;
  activeKnowledgeCount: number;
  simulatorTested: boolean;
  groqConfigured: boolean;
  channels: {
    webConfigured: boolean;
    webDetected: boolean;
    telegram: boolean;
    whatsapp: boolean;
  };
};

export type ActivationReadinessCheck = {
  key:
    | "business-profile"
    | "agent-config"
    | "knowledge"
    | "simulator"
    | "groq"
    | "channel"
    | "agent-active";
  label: string;
  description: string;
  done: boolean;
  href: "/business" | "/agent" | "/knowledge" | "/simulator" | "/readiness" | "/integrations";
  requiredBeforeActivation: boolean;
};

export function buildActivationReadiness(input: ActivationReadinessInput) {
  const liveChannelReady =
    input.channels.webDetected || input.channels.telegram || input.channels.whatsapp;
  const checks: ActivationReadinessCheck[] = [
    {
      key: "business-profile",
      label: "Profil bisnis lengkap",
      description: "Nama, jenis bisnis, layanan, area, dan jam operasional sudah terisi.",
      done: input.businessProfileComplete,
      href: "/business",
      requiredBeforeActivation: true,
    },
    {
      key: "agent-config",
      label: "Suara dan batasan Aijou siap",
      description: "Nama agent, instruksi, dan aturan handoff sudah ditinjau owner.",
      done: input.agentConfigured,
      href: "/agent",
      requiredBeforeActivation: true,
    },
    {
      key: "knowledge",
      label: "Knowledge base aktif",
      description: "Minimal 3 knowledge aktif supaya jawaban tidak mengandalkan tebakan.",
      done: input.activeKnowledgeCount >= 3,
      href: "/knowledge",
      requiredBeforeActivation: true,
    },
    {
      key: "simulator",
      label: "Simulator sudah dicoba",
      description: "Kirim sedikitnya satu simulasi untuk memeriksa alur dan handoff.",
      done: input.simulatorTested,
      href: "/simulator",
      requiredBeforeActivation: true,
    },
    {
      key: "groq",
      label: "Provider AI tersedia",
      description: "Provider AI workspace sudah tersedia di environment aplikasi.",
      done: input.groqConfigured,
      href: "/readiness",
      requiredBeforeActivation: true,
    },
    {
      key: "channel",
      label: "Minimal satu channel sudah terbukti masuk",
      description: input.channels.webConfigured && !input.channels.webDetected
        ? "Domain web sudah disimpan, tetapi widget belum terdeteksi. Pasang snippet lalu kirim satu chat percobaan."
        : "Gunakan Web Live Chat yang sudah dites, Telegram, atau WhatsApp.",
      done: liveChannelReady,
      href: "/integrations",
      requiredBeforeActivation: true,
    },
    {
      key: "agent-active",
      label: "Auto-reply diaktifkan owner",
      description: "Aktifkan Aijou secara eksplisit setelah semua pemeriksaan di atas siap.",
      done: input.agentActive,
      href: "/agent",
      requiredBeforeActivation: false,
    },
  ];

  const activationChecks = checks.filter((check) => check.requiredBeforeActivation);
  const completed = checks.filter((check) => check.done).length;

  return {
    checks,
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    canActivateAgent: activationChecks.every((check) => check.done),
    readyToComplete: checks.every((check) => check.done),
    missingBeforeActivation: activationChecks.filter((check) => !check.done),
    missingBeforeCompletion: checks.filter((check) => !check.done),
    activeKnowledgeCount: input.activeKnowledgeCount,
    simulatorTested: input.simulatorTested,
    channels: {
      web: input.channels.webDetected,
      webConfigured: input.channels.webConfigured,
      webDetected: input.channels.webDetected,
      telegram: input.channels.telegram,
      whatsapp: input.channels.whatsapp,
    },
  };
}

export function isBusinessProfileComplete(business: {
  businessName?: string | null;
  businessType?: string | null;
  mainServices?: string | null;
  serviceArea?: string | null;
  operatingHours?: string | null;
} | null) {
  return Boolean(
    business?.businessName &&
      business.businessType &&
      business.businessType !== "Belum diisi" &&
      business.mainServices &&
      business.serviceArea &&
      business.operatingHours,
  );
}

export function isAgentConfigurationComplete(settings: {
  agentName?: string | null;
  handoffRules?: string | null;
  systemInstruction?: string | null;
} | null) {
  return Boolean(settings?.agentName && settings.handoffRules && settings.systemInstruction);
}
