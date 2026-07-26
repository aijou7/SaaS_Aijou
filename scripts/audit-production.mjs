import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const DEFAULT_ENDPOINT =
  "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function packageNameFromLockPath(lockPath) {
  const normalized = lockPath.replaceAll("\\", "/");
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);
  const name =
    markerIndex >= 0
      ? normalized.slice(markerIndex + marker.length)
      : normalized.replace(/^node_modules\//, "");

  return name || null;
}

export function buildProductionAuditPayload(lockfile) {
  if (!lockfile || typeof lockfile !== "object" || !lockfile.packages) {
    throw new Error("package-lock.json does not contain a packages map");
  }

  const versionsByPackage = new Map();

  for (const [lockPath, metadata] of Object.entries(lockfile.packages)) {
    if (
      !lockPath ||
      !metadata ||
      typeof metadata !== "object" ||
      metadata.dev === true ||
      typeof metadata.version !== "string"
    ) {
      continue;
    }

    const packageName =
      typeof metadata.name === "string"
        ? metadata.name
        : packageNameFromLockPath(lockPath);

    if (!packageName) {
      continue;
    }

    const versions = versionsByPackage.get(packageName) ?? new Set();
    versions.add(metadata.version);
    versionsByPackage.set(packageName, versions);
  }

  return Object.fromEntries(
    [...versionsByPackage.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

export function decodeAuditBody(body, contentEncoding = "") {
  const isGzip =
    contentEncoding.toLowerCase().includes("gzip") ||
    (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b);

  return isGzip ? gunzipSync(body).toString("utf8") : body.toString("utf8");
}

export function findBlockingAdvisories(report, minimumSeverity = "high") {
  const minimumRank = SEVERITY_RANK[minimumSeverity];

  if (minimumRank === undefined || !report || typeof report !== "object") {
    throw new Error("npm advisory response is invalid");
  }

  return Object.entries(report)
    .flatMap(([packageName, advisories]) =>
      Array.isArray(advisories)
        ? advisories.map((advisory) => ({ packageName, ...advisory }))
        : [],
    )
    .filter(
      (advisory) =>
        SEVERITY_RANK[String(advisory.severity).toLowerCase()] >= minimumRank,
    )
    .sort(
      (left, right) =>
        SEVERITY_RANK[String(right.severity).toLowerCase()] -
          SEVERITY_RANK[String(left.severity).toLowerCase()] ||
        left.packageName.localeCompare(right.packageName),
    );
}

async function requestAdvisories(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "accept-encoding": "identity",
      "content-type": "application/json",
      "user-agent": "SaaS-Aijou-production-audit/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = Buffer.from(await response.arrayBuffer());
  const decoded = decodeAuditBody(
    body,
    response.headers.get("content-encoding") ?? "",
  );

  if (!response.ok) {
    throw new Error(`npm advisory endpoint returned HTTP ${response.status}`);
  }

  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error("npm advisory endpoint returned invalid JSON");
  }
}

async function loadAdvisoriesWithRetry(endpoint, payload) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestAdvisories(endpoint, payload);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 1_000),
        );
      }
    }
  }

  throw lastError;
}

export async function runProductionAudit({
  lockfilePath = resolve("package-lock.json"),
  endpoint = process.env.NPM_AUDIT_ENDPOINT ?? DEFAULT_ENDPOINT,
  minimumSeverity = process.env.NPM_AUDIT_LEVEL ?? "high",
} = {}) {
  const lockfile = JSON.parse(await readFile(lockfilePath, "utf8"));
  const payload = buildProductionAuditPayload(lockfile);
  const packageCount = Object.keys(payload).length;

  if (packageCount === 0) {
    throw new Error("no production dependencies were found in package-lock.json");
  }

  const report = await loadAdvisoriesWithRetry(endpoint, payload);
  const blocking = findBlockingAdvisories(report, minimumSeverity);

  if (blocking.length > 0) {
    console.error(
      `Found ${blocking.length} production advisory item(s) at ${minimumSeverity} severity or above:`,
    );
    for (const advisory of blocking) {
      console.error(
        `- ${advisory.packageName}: ${advisory.severity} — ${advisory.title ?? "untitled advisory"}`,
      );
      if (advisory.url) {
        console.error(`  ${advisory.url}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production audit passed: ${packageCount} packages checked, no ${minimumSeverity}/critical advisories.`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  runProductionAudit().catch((error) => {
    console.error(
      `Production audit could not complete: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    process.exitCode = 2;
  });
}
