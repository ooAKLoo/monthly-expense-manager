function normalizeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,80}$/.test(value) ? value : "";
}

function stringOrFallback(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function getMonthDateRange(currentMonth) {
  const match = typeof currentMonth === "string" ? currentMonth.match(/^(\d{4})-(\d{2})$/) : null;
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    const now = new Date();
    return getMonthDateRange(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  const year = Number(match[1]);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${currentMonth}-01`,
    end: `${currentMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function normalizeDateRange(value, currentMonth) {
  const fallback = getMonthDateRange(currentMonth);
  const start = typeof value?.start === "string" ? value.start.replaceAll("/", "-") : "";
  const end = typeof value?.end === "string" ? value.end.replaceAll("/", "-") : "";
  const isValid =
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    start.slice(0, 7) === currentMonth &&
    end.slice(0, 7) === currentMonth &&
    start >= fallback.start &&
    end <= fallback.end &&
    start <= end;
  return isValid ? { start, end } : fallback;
}

export function normalizeAttachmentPayload(attachment, billId = "") {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const id = normalizeId(attachment.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: stringOrFallback(attachment.name, "上传附件"),
    mimeType: stringOrFallback(attachment.mimeType, "application/octet-stream"),
    size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
    url: billId
      ? `api/bills/${billId}/attachments/${id}`
      : stringOrFallback(attachment.url, ""),
  };
}

export function normalizeAttachmentList(attachments, billId = "") {
  if (!Array.isArray(attachments)) {
    return [];
  }

  const unique = new Map();
  for (const value of attachments) {
    const attachment = normalizeAttachmentPayload(value, billId);
    if (attachment && !unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  }
  return [...unique.values()];
}

export function isInlinePreviewAttachment(attachment) {
  return (
    attachment?.mimeType === "application/pdf" ||
    /^image\/(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(attachment?.mimeType ?? "")
  );
}
