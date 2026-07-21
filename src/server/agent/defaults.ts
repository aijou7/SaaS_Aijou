export type NewWorkspaceAgentSettings = {
  agentName: string;
  tone: string;
  language: string;
  openingMessage: string | null;
  closingMessage: string | null;
  businessDescription: string;
  handoffRules: string;
  systemInstruction: string;
  isActive: boolean;
};

/**
 * A newly-created workspace starts in preview mode. The owner must finish the
 * readiness checklist and explicitly activate automatic replies before the
 * agent is allowed to answer a real channel.
 */
export function newWorkspaceAgentDefaults(
  businessDescription =
    "Aijou membantu bisnis menjawab pelanggan, merapikan follow-up, dan menjaga kendali tetap di tim.",
): NewWorkspaceAgentSettings {
  return {
    agentName: "Aijou",
    tone: "friendly, helpful, concise",
    language: "id",
    openingMessage: null,
    closingMessage: null,
    businessDescription,
    handoffRules:
      "Handoff jika customer meminta manusia, meminta harga final, komplain, atau kebutuhan perlu keputusan owner.",
    systemInstruction:
      "Pahami kebutuhan secara natural, gunakan knowledge bisnis, jangan mengarang harga, dan arahkan ke langkah berikutnya.",
    isActive: false,
  };
}
