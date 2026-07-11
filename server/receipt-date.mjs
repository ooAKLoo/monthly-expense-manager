import { getMonthDateRange } from "./bill-schema.mjs";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeReferenceDate(value, month, now = new Date()) {
  if (isValidIsoDate(value) && value.slice(0, 7) === month) {
    return value;
  }

  const today = getShanghaiDate(now);
  return today.slice(0, 7) === month ? today : "";
}

export function getReceiptFallbackDate(month, rangeEnd, referenceDate) {
  const monthRange = getMonthDateRange(month);
  if (isValidIsoDate(referenceDate) && referenceDate.slice(0, 7) === month) {
    return referenceDate;
  }
  if (
    isValidIsoDate(rangeEnd) &&
    rangeEnd.slice(0, 7) === month &&
    rangeEnd >= monthRange.start &&
    rangeEnd <= monthRange.end
  ) {
    return rangeEnd;
  }
  return monthRange.end;
}

export function normalizeRecognizedReceiptDate(value, {
  month,
  fallbackDate,
  referenceDate,
}) {
  const normalized = typeof value === "string" ? value.replaceAll("/", "-") : "";
  if (!isValidIsoDate(normalized)) {
    return fallbackDate;
  }

  // 当前月上传的截图若只有“下次续费/到期日”等未来日期，不应把计划日期记成已发生消费。
  if (
    isValidIsoDate(referenceDate) &&
    referenceDate.slice(0, 7) === month &&
    normalized.slice(0, 7) === month &&
    normalized > referenceDate
  ) {
    return fallbackDate;
  }

  return normalized;
}
