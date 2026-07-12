import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type ReceiptMediaRouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: ReceiptMediaRouteContext) {
  const session = await getSession();
  if (!session) return notFound();

  const { id } = await context.params;
  const receipt = await prisma.receipt.findFirst({
    where: {
      id,
      transaction: { business: { userId: session.userId } },
    },
    select: {
      mediaFile: {
        select: {
          businessId: true,
          storagePath: true,
          fileUrl: true,
          mimeType: true,
          fileSize: true,
        },
      },
    },
  });

  if (!receipt) return notFound();
  const media = receipt.mediaFile;
  const contentType = safeImageContentType(media.mimeType);
  if (!contentType) return notFound();

  if (media.storagePath && !isAbsolute(media.storagePath)) {
    try {
      const { get } = await import("@vercel/blob");
      const result = await get(media.storagePath, { access: "private", useCache: true });
      if (!result || result.statusCode !== 200) return notFound();

      return new Response(result.stream, {
        headers: responseHeaders(contentType, result.blob.size),
      });
    } catch {
      return notFound();
    }
  }

  if (media.fileUrl?.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = await import("@vercel/blob");
      const result = await get(media.fileUrl, { access: "private", useCache: true });
      if (!result || result.statusCode !== 200) return notFound();

      return new Response(result.stream, {
        headers: responseHeaders(contentType, result.blob.size),
      });
    } catch {
      return notFound();
    }
  }

  if (!media.storagePath || !isAbsolute(media.storagePath)) return notFound();
  const allowedDirectory = resolve(process.cwd(), "storage", "receipts", media.businessId);
  const resolvedFile = resolve(media.storagePath);
  const pathFromAllowedDirectory = relative(allowedDirectory, resolvedFile);
  if (
    pathFromAllowedDirectory.startsWith("..") ||
    isAbsolute(pathFromAllowedDirectory) ||
    pathFromAllowedDirectory === ""
  ) {
    return notFound();
  }

  try {
    const [buffer, fileInfo] = await Promise.all([readFile(resolvedFile), stat(resolvedFile)]);
    return new Response(buffer, {
      headers: responseHeaders(contentType, fileInfo.size),
    });
  } catch {
    return notFound();
  }
}

function responseHeaders(contentType: string, size: number) {
  return {
    "Cache-Control": "private, max-age=300, must-revalidate",
    "Content-Length": String(size),
    "Content-Type": contentType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  };
}

function safeImageContentType(value: string | null) {
  const normalized = value?.toLowerCase().split(";")[0].trim();
  return normalized && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalized)
    ? normalized
    : null;
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
