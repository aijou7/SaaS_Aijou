import { lstat, realpath, unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export type PersistedReceiptMedia = {
  businessId: string;
  storagePath: string | null;
  fileUrl: string | null;
};

export type PersistedReceiptMediaSnapshot = PersistedReceiptMedia & {
  id: string;
};

export type ReceiptMediaCleanupPlan = {
  blobTargets: string[];
  localFiles: Array<{
    businessId: string;
    path: string;
    allowedDirectory: string;
  }>;
};

type CleanupOperations = {
  deleteBlobs: (targets: string[]) => Promise<void>;
  deleteLocalFile: (file: ReceiptMediaCleanupPlan["localFiles"][number]) => Promise<void>;
};

type CleanupOptions = {
  cwd?: string;
  abortSignal?: AbortSignal;
  operations?: Partial<CleanupOperations>;
};

const blobBatchSize = 100;

export function buildReceiptMediaCleanupPlan(
  media: readonly PersistedReceiptMedia[],
  cwd = process.cwd(),
): ReceiptMediaCleanupPlan {
  const blobTargets = new Set<string>();
  const localFiles = new Map<string, ReceiptMediaCleanupPlan["localFiles"][number]>();

  for (const item of media) {
    const allowedDirectory = resolve(
      /* turbopackIgnore: true */ cwd,
      "storage",
      "receipts",
      item.businessId,
    );
    const storagePath = item.storagePath?.trim() ?? "";

    if (storagePath) {
      if (isAbsolute(storagePath)) {
        const resolvedPath = resolve(storagePath);
        assertPathInsideDirectory(resolvedPath, allowedDirectory);
        localFiles.set(resolvedPath, {
          businessId: item.businessId,
          path: resolvedPath,
          allowedDirectory,
        });
      } else {
        assertBlobPathBelongsToBusiness(storagePath, item.businessId);
        blobTargets.add(storagePath);
      }
    }

    // New uploads persist both pathname and URL for the same blob. The pathname
    // is the least ambiguous delete target, so the URL is only needed for
    // legacy rows (or a separately persisted blob alongside a local file).
    if (item.fileUrl && (!storagePath || isAbsolute(storagePath))) {
      const target = verifiedBlobUrl(item.fileUrl, item.businessId);
      blobTargets.add(target);
    }
  }

  return {
    blobTargets: [...blobTargets],
    localFiles: [...localFiles.values()],
  };
}

export async function cleanupPersistedReceiptMedia(
  media: readonly PersistedReceiptMedia[],
  options: CleanupOptions = {},
) {
  const plan = buildReceiptMediaCleanupPlan(media, options.cwd);
  const deleteBlobs =
    options.operations?.deleteBlobs ??
    ((targets: string[]) => deleteVercelBlobs(targets, options.abortSignal));
  const deleteLocalFile = options.operations?.deleteLocalFile ?? deleteVerifiedLocalFile;

  for (let index = 0; index < plan.blobTargets.length; index += blobBatchSize) {
    options.abortSignal?.throwIfAborted();
    await deleteBlobs(plan.blobTargets.slice(index, index + blobBatchSize));
  }

  for (const file of plan.localFiles) {
    options.abortSignal?.throwIfAborted();
    await deleteLocalFile(file);
  }

  return {
    blobsDeleted: plan.blobTargets.length,
    localFilesDeleted: plan.localFiles.length,
  };
}

/**
 * The database rows are re-read under the final purge transaction. Requiring
 * an exact match with the already-cleaned snapshot prevents a late receipt
 * upload from being cascaded out of PostgreSQL before its external object was
 * deleted. The next cron invocation will clean the new snapshot instead.
 */
export function receiptMediaSnapshotsMatch(
  cleaned: readonly PersistedReceiptMediaSnapshot[],
  current: readonly PersistedReceiptMediaSnapshot[],
) {
  if (cleaned.length !== current.length) return false;

  const cleanedKeys = cleaned.map(receiptMediaSnapshotKey).sort();
  const currentKeys = current.map(receiptMediaSnapshotKey).sort();
  return cleanedKeys.every((key, index) => key === currentKeys[index]);
}

function receiptMediaSnapshotKey(item: PersistedReceiptMediaSnapshot) {
  return JSON.stringify([
    item.id,
    item.businessId,
    item.storagePath,
    item.fileUrl,
  ]);
}

async function deleteVercelBlobs(targets: string[], abortSignal?: AbortSignal) {
  if (!targets.length) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error("Receipt blob cleanup requires BLOB_READ_WRITE_TOKEN.");
  }

  const { del } = await import("@vercel/blob");
  await del(targets, { abortSignal });
}

async function deleteVerifiedLocalFile(
  file: ReceiptMediaCleanupPlan["localFiles"][number],
) {
  let fileInfo;
  try {
    fileInfo = await lstat(/* turbopackIgnore: true */ file.path);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }

  if (!fileInfo.isFile() && !fileInfo.isSymbolicLink()) {
    throw new Error("Persisted receipt path is not a file.");
  }

  const [realAllowedDirectory, realFile] = await Promise.all([
    realpath(/* turbopackIgnore: true */ file.allowedDirectory),
    realpath(/* turbopackIgnore: true */ file.path),
  ]);
  assertPathInsideDirectory(realFile, realAllowedDirectory);
  await unlink(/* turbopackIgnore: true */ file.path);
}

function assertBlobPathBelongsToBusiness(pathname: string, businessId: string) {
  const normalized = pathname.replaceAll("\\", "/").replace(/^\/+/, "");
  const expectedPrefix = `receipts/${businessId}/`;
  const parts = normalized.split("/");

  if (
    normalized !== pathname.replace(/^\/+/, "") ||
    !normalized.startsWith(expectedPrefix) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Persisted receipt blob path is outside the workspace prefix.");
  }
}

function verifiedBlobUrl(value: string, businessId: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Persisted receipt blob URL is invalid.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname.toLowerCase().endsWith(".blob.vercel-storage.com") ||
    url.username ||
    url.password ||
    decodeURIComponent(url.pathname) !== url.pathname
  ) {
    throw new Error("Persisted receipt blob URL is not a verified Vercel Blob URL.");
  }

  assertBlobPathBelongsToBusiness(url.pathname, businessId);
  return url.toString();
}

function assertPathInsideDirectory(path: string, directory: string) {
  const pathFromDirectory = relative(directory, path);
  if (
    !pathFromDirectory ||
    pathFromDirectory === ".." ||
    pathFromDirectory.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(pathFromDirectory)
  ) {
    throw new Error("Persisted receipt path is outside the workspace directory.");
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
