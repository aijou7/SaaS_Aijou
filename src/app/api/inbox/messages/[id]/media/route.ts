import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { workspaceAccessWhere } from "@/server/workspace-access";

type MessageMediaContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: MessageMediaContext) {
  const session = await getSession();
  if (!session) return notFound();
  const { id } = await context.params;
  const message = await prisma.whatsAppMessage.findFirst({
    where: {
      id,
      conversation: { business: workspaceAccessWhere(session.userId) },
    },
    select: {
      mediaFile: {
        select: {
          businessId: true,
          storagePath: true,
          fileUrl: true,
          mimeType: true,
        },
      },
    },
  });
  const media = message?.mediaFile;
  const contentType = safeImageContentType(media?.mimeType);
  if (!media || !contentType) return notFound();

  if (media.storagePath && !isAbsolute(media.storagePath)) {
    return streamPrivateBlob(media.storagePath, contentType);
  }
  if (
    media.fileUrl?.startsWith("https://") &&
    process.env.BLOB_READ_WRITE_TOKEN
  ) {
    return streamPrivateBlob(media.fileUrl, contentType);
  }
  if (!media.storagePath || !isAbsolute(media.storagePath)) return notFound();

  const allowedDirectory = resolve(
    process.cwd(),
    "storage",
    "receipts",
    media.businessId,
  );
  const resolvedFile = resolve(media.storagePath);
  const childPath = relative(allowedDirectory, resolvedFile);
  if (
    childPath.startsWith("..") ||
    isAbsolute(childPath) ||
    childPath === ""
  ) {
    return notFound();
  }

  try {
    const [buffer, fileInfo] = await Promise.all([
      readFile(resolvedFile),
      stat(resolvedFile),
    ]);
    return new Response(buffer, {
      headers: mediaHeaders(contentType, fileInfo.size),
    });
  } catch {
    return notFound();
  }
}

async function streamPrivateBlob(value: string, contentType: string) {
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(value, { access: "private", useCache: true });
    if (!result || result.statusCode !== 200) return notFound();
    return new Response(result.stream, {
      headers: mediaHeaders(contentType, result.blob.size),
    });
  } catch {
    return notFound();
  }
}

function safeImageContentType(value: string | null | undefined) {
  const normalized = value?.toLowerCase().split(";")[0].trim();
  return normalized &&
    ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalized)
    ? normalized
    : null;
}

function mediaHeaders(contentType: string, size: number) {
  return {
    "Cache-Control": "private, max-age=300, must-revalidate",
    "Content-Length": String(size),
    "Content-Type": contentType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
