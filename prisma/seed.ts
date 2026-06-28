import "dotenv/config";
import { UserRole } from "../generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

async function main() {
  const name = process.env.SEED_OWNER_NAME ?? "Owner";
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const password = process.env.SEED_OWNER_PASSWORD ?? "change-me-now";
  const businessName = process.env.SEED_BUSINESS_NAME ?? "IT Consultant";
  const whatsappNumber = process.env.WHATSAPP_PHONE_NUMBER_ID || undefined;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
    },
    create: {
      name,
      email,
      passwordHash: hashPassword(password),
      role: UserRole.OWNER,
    },
  });

  const business = await prisma.business.upsert({
    where: {
      id: `${user.id}:default`,
    },
    update: {
      businessName,
      whatsappNumber,
      serviceArea: "Jakarta, Depok, Tangerang, dan remote support",
      operatingHours: "Senin-Sabtu 09.00-18.00",
      mainServices:
        "Instalasi jaringan LAN/WiFi, setup router, troubleshooting jaringan, IT support, setup server ringan, dan konsultasi infrastruktur IT.",
      address: "Jakarta area",
    },
    create: {
      id: `${user.id}:default`,
      userId: user.id,
      businessName,
      businessType: "IT consultant",
      whatsappNumber,
      serviceArea: "Jakarta, Depok, Tangerang, dan remote support",
      operatingHours: "Senin-Sabtu 09.00-18.00",
      mainServices:
        "Instalasi jaringan LAN/WiFi, setup router, troubleshooting jaringan, IT support, setup server ringan, dan konsultasi infrastruktur IT.",
      address: "Jakarta area",
    },
  });

  const defaultKnowledge = [
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

  for (const entry of defaultKnowledge) {
    await prisma.knowledgeBase.upsert({
      where: {
        id: `${business.id}:${entry.category}`,
      },
      update: {
        title: entry.title,
        content: entry.content,
        category: entry.category,
        isActive: true,
      },
      create: {
        id: `${business.id}:${entry.category}`,
        businessId: business.id,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        isActive: true,
      },
    });
  }

  const defaultProducts = [
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

  for (const product of defaultProducts) {
    await prisma.product.upsert({
      where: { businessId_name: { businessId: business.id, name: product.name } },
      update: { description: product.description, price: product.price, isActive: true },
      create: { businessId: business.id, ...product, isActive: true },
    });
  }

  await prisma.agentSettings.upsert({
    where: {
      businessId: business.id,
    },
    update: {
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
    },
    create: {
      businessId: business.id,
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
    },
  });

  await prisma.whatsAppSettings.upsert({
    where: {
      businessId: business.id,
    },
    update: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
      appSecret: process.env.WHATSAPP_APP_SECRET || null,
      isActive: Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_VERIFY_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_APP_SECRET,
      ),
    },
    create: {
      businessId: business.id,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
      appSecret: process.env.WHATSAPP_APP_SECRET || null,
      isActive: Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_VERIFY_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_APP_SECRET,
      ),
    },
  });

  console.log(`Seeded owner ${email} and business ${businessName}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
