export type NewWorkspaceAgentSettings = {
  agentName: string;
  tone: string;
  language: string;
  openingMessage: string | null;
  closingMessage: string | null;
  businessDescription: string | null;
  handoffRules: string | null;
  systemInstruction: string | null;
  isActive: boolean;
};

/**
 * A newly-created workspace starts in preview mode. The owner must finish the
 * readiness checklist and explicitly activate automatic replies before the
 * agent is allowed to answer a real channel.
 */
export function newWorkspaceAgentDefaults(
  businessName = "",
): NewWorkspaceAgentSettings {
  const normalizedBusinessName = businessName.trim().slice(0, 58);
  return {
    agentName: normalizedBusinessName
      ? `${normalizedBusinessName} AI`
      : "AI Assistant",
    tone: "friendly, helpful, concise",
    language: "id",
    openingMessage: null,
    closingMessage: null,
    businessDescription: null,
    // The owner must review these fields during onboarding. Keeping them empty
    // prevents a fresh workspace from being marked configured automatically.
    handoffRules: null,
    systemInstruction: null,
    isActive: false,
  };
}
