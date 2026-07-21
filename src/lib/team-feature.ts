export function isTeamManagementEnabled(
  value = process.env.TEAM_MANAGEMENT_ENABLED,
) {
  return value?.trim().toLowerCase() === "true";
}
