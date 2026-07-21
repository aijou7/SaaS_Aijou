import type { Instrumentation } from "next";
import {
  getErrorDigest,
  getRuntimeErrorCode,
  sanitizeErrorReference,
  sanitizeRuntimePath,
} from "@/lib/runtime-errors";

function sanitizeMethod(method: unknown) {
  return typeof method === "string" && /^[A-Z]{3,10}$/.test(method) ? method : "UNKNOWN";
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const release = sanitizeErrorReference(process.env.VERCEL_GIT_COMMIT_SHA);
  const route = sanitizeRuntimePath(context.routePath);

  console.error(
    JSON.stringify({
      event: "aijou.request_error",
      method: sanitizeMethod(request.method),
      path: route,
      errorCode: getRuntimeErrorCode(error),
      reference: getErrorDigest(error),
      release,
      renderSource: context.renderSource ?? "unknown",
      routeType: context.routeType,
      router: context.routerKind,
      timestamp: new Date().toISOString(),
    }),
  );
};
