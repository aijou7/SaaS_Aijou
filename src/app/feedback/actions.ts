"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createFeedback } from "@/server/feedback";
import {
  getSafeFeedbackSubmissionMessage,
  isSafeFeedbackSubmissionError,
} from "@/server/feedback-errors";

export async function submitFeedbackAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const requestHeaders = await headers();
  try {
    await createFeedback(session.userId, {
      category: String(formData.get("category") ?? "OTHER"),
      title: String(formData.get("title") ?? ""),
      message: String(formData.get("message") ?? ""),
      rating: Number(formData.get("rating") ?? 0) || null,
      pageUrl: String(formData.get("pageUrl") ?? ""),
      userAgent: requestHeaders.get("user-agent"),
    });
  } catch (error) {
    if (!isSafeFeedbackSubmissionError(error)) {
      console.error("feedback_submission_failed", error);
    }
    const message = getSafeFeedbackSubmissionMessage(error);
    redirect(`/feedback?error=${encodeURIComponent(message)}`);
  }
  redirect("/feedback?saved=1");
}
