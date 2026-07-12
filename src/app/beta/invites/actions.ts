"use server";

import { getSession } from "@/lib/session";
import {
  createBetaInvite,
  getSafeBetaInviteError,
} from "@/server/auth/beta-invites";

export type InviteActionState = {
  error?: string;
  inviteUrl?: string;
};

export async function createBetaInviteAction(
  _state: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesi login berakhir. Login ulang." };

  try {
    const result = await createBetaInvite(session.userId, {
      email: String(formData.get("email") ?? ""),
      businessName: String(formData.get("businessName") ?? ""),
      expiresInDays: Number(formData.get("expiresInDays") ?? 7),
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const inviteUrl = new URL("/signup", baseUrl);
    inviteUrl.searchParams.set("token", result.rawToken);
    return { inviteUrl: inviteUrl.toString() };
  } catch (error) {
    return { error: getSafeBetaInviteError(error, "Invite gagal dibuat. Coba lagi.") };
  }
}
