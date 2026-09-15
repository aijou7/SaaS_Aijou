"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createMessageTemplate } from "@/server/message-templates/message-templates";

export async function createMessageTemplateAction(formData: FormData) {
  const session = await getSession();

  if (!session) redirect("/login");

  await createMessageTemplate(session.userId, formData);
  revalidatePath("/message-templates");
  revalidatePath("/broadcasts");
  redirect("/message-templates?created=1");
}
