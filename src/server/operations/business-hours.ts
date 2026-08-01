export type BusinessDaySchedule = {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
};

export type BusinessHoursDecision = {
  isOpen: boolean;
  enabled: boolean;
  reason: "disabled" | "open" | "closed" | "invalid_timezone";
};

import { Prisma, WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { invalidateTtlCache } from "@/lib/ttl-cache";
import { requireWorkspaceAccess } from "@/server/workspace-access";

export const defaultBusinessHours: BusinessDaySchedule[] = Array.from(
  { length: 7 },
  (_, day) => ({ day, enabled: true, start: "00:00", end: "23:59" }),
);

export function normalizeBusinessHours(value: unknown): BusinessDaySchedule[] {
  const source = Array.isArray(value) ? value : [];
  return defaultBusinessHours.map((fallback) => {
    const candidate = source.find(
      (item) => item && typeof item === "object" && "day" in item && Number(item.day) === fallback.day,
    ) as Record<string, unknown> | undefined;
    return {
      day: fallback.day,
      enabled: candidate ? candidate.enabled !== false : fallback.enabled,
      start: normalizeTime(candidate?.start, fallback.start),
      end: normalizeTime(candidate?.end, fallback.end),
    };
  });
}

export function evaluateBusinessHours(params: {
  enabled: boolean;
  schedule: unknown;
  timeZone: string;
  at?: Date;
}): BusinessHoursDecision {
  if (!params.enabled) return { enabled: false, isOpen: true, reason: "disabled" };

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: params.timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(params.at ?? new Date());
  } catch {
    return { enabled: true, isOpen: false, reason: "invalid_timezone" };
  }

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const schedule = normalizeBusinessHours(params.schedule);
  const nowMinutes = hour * 60 + minute;
  const today = schedule[day];
  const previous = schedule[(day + 6) % 7];
  const startMinutes = today ? timeToMinutes(today.start) : 0;
  const endMinutes = today ? timeToMinutes(today.end) : 0;
  const previousStart = previous ? timeToMinutes(previous.start) : 0;
  const previousEnd = previous ? timeToMinutes(previous.end) : 0;
  const openToday = Boolean(
    today?.enabled &&
      (startMinutes <= endMinutes
        ? nowMinutes >= startMinutes && nowMinutes <= endMinutes
        : nowMinutes >= startMinutes),
  );
  const carriedFromPreviousDay = Boolean(
    previous?.enabled && previousStart > previousEnd && nowMinutes <= previousEnd,
  );
  const isOpen = openToday || carriedFromPreviousDay;
  return { enabled: true, isOpen, reason: isOpen ? "open" : "closed" };
}

export function parseBusinessHoursForm(formData: FormData) {
  return Array.from({ length: 7 }, (_, day) => ({
    day,
    enabled: formData.get(`hours_${day}_enabled`) === "on",
    start: normalizeTime(formData.get(`hours_${day}_start`), "08:00"),
    end: normalizeTime(formData.get(`hours_${day}_end`), "17:00"),
  }));
}

export async function getBusinessHoursPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const settings = await prisma.agentSettings.findUnique({
    where: { businessId: access.businessId },
    select: {
      businessHoursEnabled: true,
      businessHours: true,
      timeZone: true,
      afterHoursMode: true,
      afterHoursMessage: true,
    },
  });
  return {
    businessId: access.businessId,
    businessName: access.businessName,
    settings: {
      businessHoursEnabled: settings?.businessHoursEnabled ?? false,
      businessHours: normalizeBusinessHours(settings?.businessHours),
      timeZone: settings?.timeZone ?? "Asia/Makassar",
      afterHoursMode: settings?.afterHoursMode ?? "HANDOFF",
      afterHoursMessage: settings?.afterHoursMessage ?? "Pesanmu sudah masuk. Tim kami akan melanjutkan saat jam operasional berikutnya.",
    },
  };
}

export async function updateBusinessHours(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const timeZone = normalizeTimeZone(String(formData.get("timeZone") ?? "Asia/Makassar"));
  const afterHoursMode = ["HANDOFF", "AUTO_REPLY", "PAUSE_AI"].includes(String(formData.get("afterHoursMode")))
    ? String(formData.get("afterHoursMode"))
    : "HANDOFF";
  const afterHoursMessage = String(formData.get("afterHoursMessage") ?? "").trim().slice(0, 1_000) || null;
  const businessHours = parseBusinessHoursForm(formData);
  await prisma.agentSettings.upsert({
    where: { businessId: access.businessId },
    update: {
      businessHoursEnabled: formData.get("businessHoursEnabled") === "on",
      businessHours: businessHours as unknown as Prisma.InputJsonValue,
      timeZone,
      afterHoursMode,
      afterHoursMessage,
    },
    create: {
      businessId: access.businessId,
      businessHoursEnabled: formData.get("businessHoursEnabled") === "on",
      businessHours: businessHours as unknown as Prisma.InputJsonValue,
      timeZone,
      afterHoursMode,
      afterHoursMessage,
    },
  });
  invalidateTtlCache(`agent-runtime:${access.businessId}`);
}

function normalizeTime(value: unknown, fallback: string) {
  const cleaned = typeof value === "string" ? value.trim() : "";
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cleaned) ? cleaned : fallback;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeTimeZone(value: string) {
  const cleaned = value.trim().slice(0, 80) || "Asia/Makassar";
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: cleaned }).format();
    return cleaned;
  } catch {
    return "Asia/Makassar";
  }
}
