import "dotenv/config";
import { UserRole } from "../generated/prisma-beta/client";
import { encryptSecret } from "../src/lib/secret-encryption";
import { prisma } from "../src/lib/prisma";
import { hashPassword, validatePasswordStrength } from "../src/lib/password";

async function main() {
  const isLocalDatabase = databaseIsLocal(process.env.DATABASE_URL);
  const configuredName = process.env.SEED_OWNER_NAME?.trim();
  const configuredEmail = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const configuredPassword = process.env.SEED_OWNER_PASSWORD;
  const name = configuredName || "Owner";
  const email = configuredEmail || "owner@example.com";
  const password = configuredPassword || "change-me-now";
  const rotatePassword = process.env.SEED_ROTATE_OWNER_PASSWORD === "true";
  const refreshDemoData = process.env.SEED_REFRESH_DEMO_DATA === "true";
  const businessName = process.env.SEED_BUSINESS_NAME?.trim() || "IT Consultant";
  const whatsappNumber = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;
  const whatsAppAccessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || null;
  const whatsAppVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null;
  const whatsAppAppSecret = process.env.WHATSAPP_APP_SECRET?.trim() || null;
  const whatsAppReady = Boolean(
    whatsappNumber && whatsAppAccessToken && whatsAppVerifyToken && whatsAppAppSecret,
  );

  if (!isLocalDatabase && !configuredEmail) {
    throw new Error("SEED_OWNER_EMAIL must be explicitly set for a non-local database.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (!existingUser && !isLocalDatabase && !configuredPassword) {
    throw new Error(
      "SEED_OWNER_PASSWORD must be explicitly set when creating an owner on a non-local database.",
    );
  }

  if (rotatePassword && !configuredPassword) {
    throw new Error(
      "SEED_OWNER_PASSWORD must be explicitly set when SEED_ROTATE_OWNER_PASSWORD=true.",
    );
  }

  const shouldWritePassword = !existingUser || rotatePassword;
  if (shouldWritePassword) {
    const passwordError = validatePasswordStrength(password, email);
    if ((!isLocalDatabase || rotatePassword) && passwordError) {
      throw new Error(`SEED_OWNER_PASSWORD is not strong enough: ${passwordError}`);
    }
  }

  const passwordHash = shouldWritePassword ? await hashPassword(password) : null;
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          isPlatformAdmin: true,
          ...(refreshDemoData && configuredName ? { name: configuredName } : {}),
          ...(rotatePassword && passwordHash ? { passwordHash } : {}),
        },
      })
    : await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: passwordHash!,
          role: UserRole.OWNER,
          isPlatformAdmin: true,
        },
      });

  const existingBusiness = await prisma.business.findUnique({
    where: { userId: user.id },
  });
  const businessDefaults = {
    businessName,
    businessType: "IT consultant",
    serviceArea: "Jakarta, Depok, Tangerang, dan remote support",
    operatingHours: "Senin-Sabtu 09.00-18.00",
    mainServices:
      "Instalasi jaringan LAN/WiFi, setup router, troubleshooting jaringan, IT support, setup server ringan, dan konsultasi infrastruktur IT.",
    address: "Jakarta area",
  };
  const business = existingBusiness
    ? refreshDemoData
      ? await prisma.business.update({
          where: { id: existingBusiness.id },
          data: {
            ...businessDefaults,
            ...(whatsappNumber ? { whatsappNumber } : {}),
          },
        })
      : existingBusiness
    : await prisma.business.create({
        data: {
          id: `${user.id}:default`,
          userId: user.id,
          ...businessDefaults,
          whatsappNumber,
        },
      });

  const shouldSeedDemoData = !existingBusiness || refreshDemoData;
  if (shouldSeedDemoData) {
    await seedKnowledgeBase(business.id);
    await seedProducts(business.id);
    await seedAgentSettings(business.id);
    await seedWhatsAppSettings({
      businessId: business.id,
      whatsappNumber,
      accessToken: whatsAppAccessToken,
      verifyToken: whatsAppVerifyToken,
      appSecret: whatsAppAppSecret,
      isReady: whatsAppReady,
    });
  }

  console.log(
    `${existingUser ? "Updated" : "Seeded"} platform owner ${email}; password ${rotatePassword || !existingUser ? "written" : "preserved"}.`,
  );
  console.log(
    existingBusiness && !refreshDemoData
      ? `Preserved existing workspace ${existingBusiness.businessName} and its demo/configuration data.`
      : `${refreshDemoData ? "Refreshed" : "Seeded"} demo data for workspace ${business.businessName}.`,
  );

  if (existingBusiness && !refreshDemoData) {
    console.log(
      "Set SEED_REFRESH_DEMO_DATA=true only when you intentionally want to overwrite the seeded business profile, knowledge, products, agent, and WhatsApp bootstrap settings.",
    );
  }
}

async function seedKnowledgeBase(businessId: string) {
  const entries = [
    {
      title: "Layanan IT Consultant",
      category: "services",
      content:
        "Melayani instalasi jaringan LAN/WiFi kantor, setup router, troubleshooting jaringan, IT support, setup server ringan, dan konsultasi infrastruktur IT untuk bisnis kecil.",
    },
    {
      title: "Aturan Harga",
      category: "pricing",
      content:
        "AI tidak boleh memberikan harga final. Untuk estimasi awal, kumpulkan lokasi, jumlah titik/perangkat, kondisi existing, deadline, dan budget. Owner akan follow-up untuk quotation final.",
    },
    {
      title: "Handoff Rules",
      category: "handoff",
      content:
        "Handoff ke owner jika customer meminta admin/manusia, meminta harga final, komplain, marah, atau kebutuhan terlalu teknis/detail.",
    },
  ];

  for (const entry of entries) {
    await prisma.knowledgeBase.upsert({
      where: { id: `${businessId}:${entry.category}` },
      update: { ...entry, isActive: true },
      create: { id: `${businessId}:${entry.category}`, businessId, ...entry, isActive: true },
    });
  }
}

async function seedProducts(businessId: string) {
  const products = [
    {
      name: "IT Support Visit",
      description: "Kunjungan teknisi untuk troubleshooting jaringan atau perangkat.",
      price: 350000,
    },
    {
      name: "WiFi Router Setup",
      description: "Setup router, SSID, password, keamanan dasar, dan pengujian koneksi.",
      price: 500000,
    },
    {
      name: "Instalasi Kabel LAN",
      description: "Instalasi kabel LAN per titik; kebutuhan material khusus dihitung setelah survei.",
      price: 150000,
    },
    {
      name: "Maintenance IT Bulanan",
      description: "Dukungan bulanan untuk kantor kecil, termasuk remote support dan visit ringan.",
      price: 1500000,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { businessId_name: { businessId, name: product.name } },
      update: { description: product.description, price: product.price, isActive: true },
      create: { businessId, ...product, isActive: true },
    });
  }
}

async function seedAgentSettings(businessId: string) {
  const defaults = {
    agentName: "Aijou",
    tone: "friendly, helpful, concise",
    language: "id",
    businessDescription:
      "Aijou Teknologi Digital membantu bisnis membangun website, software, automation, AI agent, dan infrastruktur jaringan yang stabil.",
    handoffRules:
      "Handoff ke owner jika customer meminta manusia/admin, meminta harga final, komplain, marah, atau kebutuhan terlalu teknis.",
    systemInstruction:
      "Kumpulkan kebutuhan customer secara natural. Jangan memberi harga final. Minta lokasi, scope, jumlah perangkat/titik, urgency, dan budget jika relevan. Untuk project besar, arahkan ke discovery atau survey.",
    isActive: true,
  };

  await prisma.agentSettings.upsert({
    where: { businessId },
    update: defaults,
    create: { businessId, ...defaults },
  });
}

async function seedWhatsAppSettings(params: {
  businessId: string;
  whatsappNumber?: string;
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  isReady: boolean;
}) {
  const encrypted = {
    ...(params.whatsappNumber ? { phoneNumberId: params.whatsappNumber } : {}),
    ...(params.accessToken
      ? {
          accessToken: encryptSecret(
            params.accessToken,
            whatsAppSecretContext(params.businessId, "accessToken"),
          ),
        }
      : {}),
    ...(params.verifyToken
      ? {
          verifyToken: encryptSecret(
            params.verifyToken,
            whatsAppSecretContext(params.businessId, "verifyToken"),
          ),
        }
      : {}),
    ...(params.appSecret
      ? {
          appSecret: encryptSecret(
            params.appSecret,
            whatsAppSecretContext(params.businessId, "appSecret"),
          ),
        }
      : {}),
    ...(params.isReady ? { isActive: true } : {}),
  };

  await prisma.whatsAppSettings.upsert({
    where: { businessId: params.businessId },
    update: encrypted,
    create: {
      businessId: params.businessId,
      phoneNumberId: params.whatsappNumber ?? null,
      accessToken: encryptSecret(
        params.accessToken,
        whatsAppSecretContext(params.businessId, "accessToken"),
      ),
      verifyToken: encryptSecret(
        params.verifyToken,
        whatsAppSecretContext(params.businessId, "verifyToken"),
      ),
      appSecret: encryptSecret(
        params.appSecret,
        whatsAppSecretContext(params.businessId, "appSecret"),
      ),
      isActive: params.isReady,
    },
  });
}

function databaseIsLocal(databaseUrl?: string) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the seed.");
  }

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }
}

function whatsAppSecretContext(businessId: string, field: string) {
  return `aijou:whatsapp:${businessId}:${field}`;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
