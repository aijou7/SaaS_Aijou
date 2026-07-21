import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";

export const dynamic = "force-dynamic";

// Keep the in-memory beta export bounded. Every collection reports truncation
// explicitly, so a future paginated export can extend this without silently
// claiming completeness.
const collectionLimit = 500;
const maxExportBytes = 8 * 1024 * 1024;
const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: responseHeaders },
    );
  }

  const exportLimit = await consumeDurableRateLimit(session.userId, [
    { scope: "account-export:user:1h", max: 5, windowMs: 60 * 60_000 },
  ]);
  if (!exportLimit.allowed) {
    return Response.json(
      { error: "Terlalu banyak permintaan export. Coba lagi nanti." },
      {
        status: 429,
        headers: {
          ...responseHeaders,
          "Retry-After": String(exportLimit.retryAfterSeconds),
        },
      },
    );
  }

  const [user, ownedWorkspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.business.findFirst({
      where: { userId: session.userId },
      select: {
        id: true,
        businessName: true,
        businessType: true,
        whatsappNumber: true,
        serviceArea: true,
        operatingHours: true,
        mainServices: true,
        websiteUrl: true,
        widgetAllowedOrigin: true,
        address: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true,
        agentSettings: {
          select: {
            agentName: true,
            tone: true,
            language: true,
            openingMessage: true,
            closingMessage: true,
            businessDescription: true,
            handoffRules: true,
            systemInstruction: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        knowledgeBase: {
          orderBy: { createdAt: "asc" },
          take: collectionLimit + 1,
          select: {
            id: true,
            title: true,
            content: true,
            category: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        products: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: collectionLimit + 1,
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            currency: true,
            isActive: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        quickReplies: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: collectionLimit + 1,
          select: {
            id: true,
            name: true,
            content: true,
            shortcut: true,
            category: true,
            isPrivate: true,
            isActive: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        categories: {
          orderBy: { createdAt: "asc" },
          take: collectionLimit + 1,
          select: {
            id: true,
            name: true,
            type: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        projects: {
          orderBy: { createdAt: "asc" },
          take: collectionLimit + 1,
          select: {
            id: true,
            projectName: true,
            clientName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  if (!user) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401, headers: responseHeaders },
    );
  }

  const exportDocument = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: "account-and-owned-workspace-configuration",
    exclusions: [
      "password hashes and authentication tokens",
      "integration and payment credentials",
      "raw provider or webhook payloads",
      "customer conversations and customer contact data",
      "workspaces where this account is not the owner",
    ],
    account: user,
    ownedWorkspace: ownedWorkspace
      ? {
          profile: {
            id: ownedWorkspace.id,
            businessName: ownedWorkspace.businessName,
            businessType: ownedWorkspace.businessType,
            whatsappNumber: ownedWorkspace.whatsappNumber,
            serviceArea: ownedWorkspace.serviceArea,
            operatingHours: ownedWorkspace.operatingHours,
            mainServices: ownedWorkspace.mainServices,
            websiteUrl: ownedWorkspace.websiteUrl,
            widgetAllowedOrigin: ownedWorkspace.widgetAllowedOrigin,
            address: ownedWorkspace.address,
            onboardingCompleted: ownedWorkspace.onboardingCompleted,
            createdAt: ownedWorkspace.createdAt,
            updatedAt: ownedWorkspace.updatedAt,
          },
          agentSettings: ownedWorkspace.agentSettings,
          knowledgeBase: boundedCollection(ownedWorkspace.knowledgeBase),
          products: boundedCollection(
            ownedWorkspace.products.map((product) => ({
              ...product,
              price: product.price.toString(),
            })),
          ),
          quickReplies: boundedCollection(ownedWorkspace.quickReplies),
          categories: boundedCollection(ownedWorkspace.categories),
          projects: boundedCollection(ownedWorkspace.projects),
        }
      : null,
  };

  const serialized = JSON.stringify(exportDocument, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > maxExportBytes) {
    return Response.json(
      {
        error:
          "Export terlalu besar untuk dibuat sekaligus. Kurangi data lama atau hubungi support untuk export bertahap.",
      },
      { status: 413, headers: responseHeaders },
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(serialized, {
    status: 200,
    headers: {
      ...responseHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="aijou-account-export-${date}.json"`,
    },
  });
}

function boundedCollection<T>(items: T[]) {
  return {
    items: items.slice(0, collectionLimit),
    truncated: items.length > collectionLimit,
    limit: collectionLimit,
  };
}
