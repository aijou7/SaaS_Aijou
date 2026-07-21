"use server";

import { redirect } from "next/navigation";
import { createSessionCookie, getSession } from "@/lib/session";
import { isTeamManagementEnabled } from "@/lib/team-feature";
import {
  acceptTeamInvite,
  getSafeTeamAccessError,
  inspectTeamInvite,
} from "@/server/team-access";

export type TeamAcceptActionState = {
  error?: string;
};

export async function acceptTeamInviteAction(
  _state: TeamAcceptActionState,
  formData: FormData,
): Promise<TeamAcceptActionState> {
  if (!isTeamManagementEnabled()) {
    return { error: "Penerimaan undangan tim belum diaktifkan untuk beta ini." };
  }

  const token = String(formData.get("token") ?? "");
  const session = await getSession();
  const password = String(formData.get("password") ?? "");

  if (!session && password !== String(formData.get("confirmPassword") ?? "")) {
    return { error: "Konfirmasi password tidak sama." };
  }

  let invite: Awaited<ReturnType<typeof inspectTeamInvite>>;
  try {
    invite = await inspectTeamInvite(token);
  } catch {
    return { error: "Undangan belum dapat diperiksa. Coba lagi beberapa saat." };
  }

  if (!invite) {
    return { error: "Undangan tidak valid, sudah dipakai, dicabut, atau kedaluwarsa." };
  }
  if (!session && invite.existingAccount) {
    return { error: "Akun untuk email ini sudah ada. Masuk dulu sebelum menerima undangan." };
  }

  let accepted: Awaited<ReturnType<typeof acceptTeamInvite>>;
  try {
    accepted = await acceptTeamInvite(
      {
        token,
        name: String(formData.get("name") ?? ""),
        password,
      },
      session?.userId,
    );
  } catch (error) {
    return { error: getSafeTeamAccessError(error) };
  }

  if (accepted.createdUser) {
    if (!accepted.passwordHash) {
      return { error: "Akun sudah dibuat. Silakan masuk menggunakan email undangan." };
    }

    let sessionCreated = true;
    try {
      await createSessionCookie({
        userId: accepted.userId,
        passwordHash: accepted.passwordHash,
      });
    } catch {
      sessionCreated = false;
    }
    if (!sessionCreated) redirect("/login?teamJoined=1");
  } else if (!session) {
    // The account may have been created after page inspection. Membership is
    // already safely attached, but only a real login may create its session.
    redirect("/login?teamJoined=1");
  }

  redirect("/dashboard?teamJoined=1");
}
