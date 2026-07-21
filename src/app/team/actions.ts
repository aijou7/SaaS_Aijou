"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isTeamManagementEnabled } from "@/lib/team-feature";
import {
  createTeamInvite,
  getSafeTeamAccessError,
  revokeTeamInvite,
} from "@/server/team-access";

export type TeamInviteActionState = {
  error?: string;
  inviteUrl?: string;
  deliveryMessage?: string;
};

export async function createTeamInviteAction(
  _state: TeamInviteActionState,
  formData: FormData,
): Promise<TeamInviteActionState> {
  if (!isTeamManagementEnabled()) {
    return { error: "Pengelolaan tim belum diaktifkan untuk beta ini." };
  }

  const session = await getSession();
  if (!session) return { error: "Sesi login berakhir. Silakan masuk kembali." };

  try {
    const result = await createTeamInvite(session.userId, {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? ""),
    });
    revalidatePath("/team");

    return {
      inviteUrl: result.inviteUrl,
      deliveryMessage: result.delivery.sent
        ? "Email undangan sudah dikirim. Link juga tersedia untuk dibagikan secara manual."
        : result.delivery.configured
          ? "Undangan dibuat, tetapi email belum berhasil dikirim. Salin link di bawah dengan aman."
          : "Undangan dibuat. Email belum dikonfigurasi, jadi bagikan link di bawah secara manual.",
    };
  } catch (error) {
    return { error: getSafeTeamAccessError(error) };
  }
}

export async function revokeTeamInviteAction(formData: FormData) {
  if (!isTeamManagementEnabled()) redirect("/dashboard");

  const session = await getSession();
  if (!session) redirect("/login");

  try {
    await revokeTeamInvite(session.userId, String(formData.get("inviteId") ?? ""));
  } catch (error) {
    redirect(`/team?error=${encodeURIComponent(getSafeTeamAccessError(error))}`);
  }

  revalidatePath("/team");
  redirect("/team?revoked=1");
}
