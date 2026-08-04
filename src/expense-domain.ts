// 月度消费领域模型、格式化规则与账单 API。

export type Currency = "CNY" | "USD" | "AUD" | "TWD";
export type Status = "reported" | "unreported";
export type Category = "交通" | "餐饮" | "购物" | "住房" | "办公" | "差旅" | "订阅";

export type Expense = {
  id: string;
  date: string;
  description: string;
  category: Category;
  originalAmount: number;
  currency: Currency;
  merchant: string;
  status: Status;
  note: string;
  source: string;
  recurring?: boolean;
  confidence?: number;
  attachment?: Attachment | null;
  attachments?: Attachment[];
  amountText?: string;
  currencyEvidence?: string;
  paymentMethod?: string;
  evidenceText?: string;
  carryoverFromId?: string;
  carryoverFromDate?: string;
};

export type UploadRecord = {
  name: string;
  count: number;
  confidence: number;
};

export type AnalyzeExpensesResponse = {
  expenses: Array<Partial<Expense> & { originalAmount?: number; amount?: number }>;
  warnings?: string[];
  models?: {
    llm?: string;
    vision?: string;
    multimodal?: string;
    seed?: string;
    active?: string;
    activeProvider?: "seed" | "qwen";
    usedProviders?: Array<"seed" | "qwen">;
  };
};

export type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export type AttachmentPreviewTarget = {
  expenseId: string;
  attachment: Attachment;
};

export type DateRange = {
  start: string;
  end: string;
};

export type Bill = {
  id: string;
  currentMonth: string;
  dateRange: DateRange;
  expenses: Expense[];
};

export type ExportSummary = {
  total: number;
  reported: number;
  unreported: number;
  count: number;
};

export const exchangeRate = 7.21;
export const audExchangeRate = 4.7;
export const twdExchangeRate = 0.23;
export const pageSize = 8;

export const seedExpenses: Expense[] = [];
export const categories: Category[] = ["交通", "餐饮", "购物", "住房", "办公", "差旅", "订阅"];
export const statuses: Array<{ value: Status; label: string }> = [
  { value: "reported", label: "已报销" },
  { value: "unreported", label: "未报销" },
];
export const analysisSteps = [
  "自动识别消费信息",
  "智能分类消费类型",
  "外币金额换算人民币",
  "自动加入待报销清单",
];

export function amountInCny(expense: Pick<Expense, "currency" | "originalAmount">) {
  if (expense.currency === "USD") {
    return Number((expense.originalAmount * exchangeRate).toFixed(2));
  }
  if (expense.currency === "AUD") {
    return Number((expense.originalAmount * audExchangeRate).toFixed(2));
  }
  if (expense.currency === "TWD") {
    return Number((expense.originalAmount * twdExchangeRate).toFixed(2));
  }
  return expense.originalAmount;
}

export function formatCny(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatTwd(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatAud(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatOriginalAmount(expense: Pick<Expense, "currency" | "originalAmount">) {
  if (expense.currency === "USD") {
    return formatUsd(expense.originalAmount);
  }
  if (expense.currency === "AUD") {
    return formatAud(expense.originalAmount);
  }
  if (expense.currency === "TWD") {
    return formatTwd(expense.originalAmount);
  }
  return formatCny(expense.originalAmount);
}

export function formatOriginalAmountNote(expense: Pick<Expense, "currency" | "originalAmount">) {
  if (expense.currency === "CNY") {
    return "";
  }

  return `（原币 ${formatOriginalAmount(expense)}）`;
}

export function formatEditableAmount(value: number) {
  const amount = normalizeAmount(value);
  if (amount === 0) {
    return "";
  }

  return amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function parseEditableAmount(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const amount = Math.abs(Number(normalized));
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

export function getClipboardFilename(mimeType: string, index: number) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return `clipboard-${getDownloadStamp()}-${index + 1}.${extension}`;
}

export function isAcceptedUploadFile(file: File) {
  return file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function filesFromClipboard(items: DataTransferItemList) {
  return Array.from(items)
    .filter((item) => item.kind === "file")
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) {
        return null;
      }

      if (file.name) {
        return file;
      }

      return new File([file], getClipboardFilename(file.type, index), {
        lastModified: Date.now(),
        type: file.type,
      });
    })
    .filter((file): file is File => Boolean(file))
    .filter(isAcceptedUploadFile);
}

export function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
  );
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getBrowserToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function expenseMonthKey(date: string) {
  return date.slice(0, 7);
}

export function getCarryoverSourceId(expense: Pick<Expense, "id" | "carryoverFromId">) {
  if (expense.carryoverFromId) {
    return expense.carryoverFromId;
  }
  return expense.id.match(/^carry-\d{4}-\d{2}-(.+)$/)?.[1] ?? "";
}

export function getCarryoverOriginalDate(
  expense: Pick<Expense, "carryoverFromDate" | "note" | "source">,
) {
  if (expense.carryoverFromDate) {
    return expense.carryoverFromDate;
  }
  if (expense.source !== "自动迁移" && expense.source !== "上月结转") {
    return "";
  }
  return expense.note.match(/原(?:消费)?日期\s*(\d{4}[/-]\d{2}[/-]\d{2})/)?.[1]?.replaceAll("/", "-") ?? "";
}

export function isCarryoverExpense(expense: Pick<Expense, "id" | "carryoverFromId" | "source">) {
  return Boolean(getCarryoverSourceId(expense)) || expense.source === "自动迁移" || expense.source === "上月结转";
}

/**
 * 将旧版“结转”副本还原为原消费记录，避免同一笔费用在跨月待报销清单中重复出现。
 * 旧账单仍可正常读取，但下一次保存后只保留真实消费日期和两种报销状态。
 */
export function simplifyCarryoverExpenses(expenses: Expense[]) {
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const result = new Map<string, Expense>();

  const findOriginal = (expense: Expense) => {
    let current = expense;
    const visited = new Set<string>();
    while (!current.recurring) {
      const sourceId = getCarryoverSourceId(current);
      if (!sourceId || visited.has(sourceId)) {
        break;
      }
      const source = expenseById.get(sourceId);
      if (!source) {
        break;
      }
      visited.add(sourceId);
      current = source;
    }
    if (current.id === expense.id && isCarryoverExpense(expense)) {
      const attachmentIds = new Set(getExpenseAttachments(expense).map((attachment) => attachment.id));
      const normalizedDescription = expense.description.replace(/（结转）$/, "");
      const candidate = expenses
        .filter(
          (item) =>
            item.id !== expense.id &&
            !isCarryoverExpense(item) &&
            item.date <= expense.date &&
            ((attachmentIds.size > 0 &&
              getExpenseAttachments(item).some((attachment) => attachmentIds.has(attachment.id))) ||
              (item.description === normalizedDescription &&
                item.merchant === expense.merchant &&
                item.originalAmount === expense.originalAmount &&
                item.currency === expense.currency)),
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (candidate) {
        current = candidate;
      }
    }
    return current;
  };

  for (const expense of expenses) {
    if (!isCarryoverExpense(expense) || expense.recurring) {
      result.set(expense.id, {
        ...expense,
        carryoverFromId: undefined,
        carryoverFromDate: undefined,
      });
    }
  }

  for (const expense of expenses) {
    if (!isCarryoverExpense(expense) || expense.recurring) {
      continue;
    }

    const original = findOriginal(expense);
    if (original.id !== expense.id && expenseById.has(original.id)) {
      const existing = result.get(original.id) ?? original;
      const attachments = new Map(
        [...getExpenseAttachments(existing), ...getExpenseAttachments(expense)].map((attachment) => [
          attachment.id,
          attachment,
        ]),
      );
      result.set(original.id, {
        ...existing,
        status: expense.status === "unreported" ? "unreported" : existing.status,
        attachment: existing.attachment ?? expense.attachment,
        attachments: [...attachments.values()].filter(
          (attachment) => attachment.id !== (existing.attachment ?? expense.attachment)?.id,
        ),
        carryoverFromId: undefined,
        carryoverFromDate: undefined,
      });
      continue;
    }

    const originalDate = getCarryoverOriginalDate(expense);
    result.set(expense.id, {
      ...expense,
      date: originalDate || expense.date,
      description: expense.description.replace(/（结转）$/, ""),
      source:
        expense.source === "上月结转" || expense.source === "自动迁移"
          ? "历史记录"
          : expense.source,
      note: expense.note.replace(/^上月未报销\s*·?\s*原消费日期\s*\d{4}[/-]\d{2}[/-]\d{2}\s*$/, ""),
      carryoverFromId: undefined,
      carryoverFromDate: undefined,
    });
  }

  return [...result.values()];
}

export function getMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function getMonthDateRange(date: Date): DateRange {
  const month = monthKey(date);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDate).padStart(2, "0")}`,
  };
}

export function normalizeDateRange(value: unknown, currentMonth: Date): DateRange {
  const fallback = getMonthDateRange(currentMonth);
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<DateRange>;
  const start = typeof candidate.start === "string" ? candidate.start.replaceAll("/", "-") : "";
  const end = typeof candidate.end === "string" ? candidate.end.replaceAll("/", "-") : "";
  const currentKey = monthKey(currentMonth);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    start.slice(0, 7) === currentKey &&
    end.slice(0, 7) === currentKey &&
    start >= fallback.start &&
    end <= fallback.end &&
    start <= end;
  return valid ? { start, end } : fallback;
}

export function getDateRangeLabel(dateRange: DateRange) {
  return `${dateRange.start.replaceAll("-", "/")} - ${dateRange.end.replaceAll("-", "/")}`;
}

export function getDownloadStamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
}

export function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "");
}

export function getFilterLabel(statusFilter: "all" | Status, query: string) {
  const statusLabel =
    statusFilter === "all" ? "全部" : statusFilter === "reported" ? "已报销" : "未报销";
  const normalized = query.trim();
  return normalized ? `${statusLabel}-搜索-${normalized}` : statusLabel;
}

export function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const windowSize = 5;
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function dateInMonth(date: string, target: Date) {
  const day = Math.min(Number(date.slice(8, 10)), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function currentMonthDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function parseMonthDate(value: string) {
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return currentMonthDate();
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export function normalizeBillId(value: string | null) {
  return value && /^[a-zA-Z0-9_-]{6,80}$/.test(value) ? value : "";
}

export function getBillIdFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const match = hash.match(/^bill=([a-zA-Z0-9_-]{6,80})$/) ?? hash.match(/^bill_([a-zA-Z0-9_-]{6,80})$/);
  return normalizeBillId(match?.[1] ?? "");
}

export function createLocalBillId() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export function ensureBillIdInUrl() {
  const existing = getBillIdFromHash();
  if (existing) {
    return existing;
  }

  const id = createLocalBillId();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#bill=${id}`);
  return id;
}

export function apiUrl(path: string) {
  const hrefWithoutHash = window.location.href.replace(/#.*$/, "");
  const baseHref = hrefWithoutHash.endsWith("/")
    ? hrefWithoutHash
    : `${hrefWithoutHash.replace(/\/[^/]*$/, "")}/`;
  return new URL(`api/${path.replace(/^\/+/, "")}`, baseHref).toString();
}

export function attachmentUrl(attachment: Attachment) {
  return new URL(attachment.url.replace(/^\/+/, ""), apiUrl("../")).toString();
}

export function attachmentDownloadUrl(attachment: Attachment) {
  const url = new URL(attachmentUrl(attachment));
  url.searchParams.set("download", "1");
  return url.toString();
}

export function isImageAttachment(attachment: Attachment) {
  return /^image\/(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(attachment.mimeType);
}

export function isPdfAttachment(attachment: Attachment) {
  return attachment.mimeType === "application/pdf" || /\.pdf$/i.test(attachment.name);
}

export function canPreviewAttachment(attachment: Attachment) {
  return isImageAttachment(attachment) || isPdfAttachment(attachment);
}

export function getExpenseAttachments(expense: Pick<Expense, "attachment" | "attachments">) {
  const unique = new Map<string, Attachment>();
  if (expense.attachment) {
    unique.set(expense.attachment.id, expense.attachment);
  }
  for (const attachment of expense.attachments ?? []) {
    if (attachment) {
      unique.set(attachment.id, attachment);
    }
  }
  return [...unique.values()];
}

export async function loadBill(billId: string): Promise<Bill> {
  const response = await fetch(apiUrl(`bills/${billId}`));
  const payload = (await response.json().catch(() => ({}))) as { bill?: Partial<Bill>; error?: string };
  if (!response.ok || !payload.bill) {
    throw new Error(payload.error ?? "账单加载失败");
  }

  const currentMonth =
    typeof payload.bill.currentMonth === "string"
      ? parseMonthDate(payload.bill.currentMonth)
      : currentMonthDate();
  return {
    id: billId,
    currentMonth: monthKey(currentMonth),
    dateRange: normalizeDateRange(payload.bill.dateRange, currentMonth),
    expenses: Array.isArray(payload.bill.expenses)
      ? payload.bill.expenses.map((expense, index) => normalizeApiExpense(expense, index))
      : [],
  };
}

export async function saveBill(bill: Bill) {
  const response = await fetch(apiUrl(`bills/${bill.id}`), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bill),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "账单保存失败");
  }
}

export async function uploadExpenseAttachments(files: File[], billId: string) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await fetch(apiUrl(`bills/${billId}/attachments`), {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    attachments?: unknown[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "附件上传失败");
  }

  return (payload.attachments ?? [])
    .map(normalizeAttachment)
    .filter((attachment): attachment is Attachment => Boolean(attachment));
}

export async function analyzeUploadedFiles(
  files: File[],
  currentMonth: Date,
  dateRange: DateRange,
  billId: string,
) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("month", monthKey(currentMonth));
  formData.append("rangeStart", dateRange.start);
  formData.append("rangeEnd", dateRange.end);
  formData.append("referenceDate", getBrowserToday());
  formData.append("exchangeRate", String(exchangeRate));
  formData.append("audExchangeRate", String(audExchangeRate));
  formData.append("twdExchangeRate", String(twdExchangeRate));

  const response = await fetch(apiUrl(`bills/${billId}/analyze-expenses`), {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<AnalyzeExpensesResponse> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "模型识别失败");
  }

  const rawExpenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  if (rawExpenses.length === 0) {
    throw new Error("模型未识别出消费记录");
  }

  return {
    expenses: rawExpenses.map((expense, index) => normalizeApiExpense(expense, index)),
    warnings: payload.warnings ?? [],
    modelName:
      payload.models?.active ??
      payload.models?.vision ??
      payload.models?.multimodal ??
      payload.models?.llm ??
      "AI 模型",
  };
}

export async function reanalyzeStoredAttachment(
  attachment: Attachment,
  currentMonth: Date,
  dateRange: DateRange,
  billId: string,
  referenceDate: string,
) {
  const response = await fetch(
    apiUrl(`bills/${billId}/attachments/${attachment.id}/reanalyze-expenses`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: monthKey(currentMonth),
        rangeStart: dateRange.start,
        rangeEnd: dateRange.end,
        referenceDate,
        exchangeRate,
        audExchangeRate,
        twdExchangeRate,
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Partial<AnalyzeExpensesResponse> & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "重新识别失败");
  }

  const rawExpenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  if (rawExpenses.length === 0) {
    throw new Error("重新识别后未发现有效消费记录");
  }

  return {
    expenses: rawExpenses.map((expense, index) => normalizeApiExpense(expense, index)),
    warnings: payload.warnings ?? [],
    modelName:
      payload.models?.active ??
      payload.models?.seed ??
      payload.models?.vision ??
      "AI 模型",
  };
}

export function normalizeApiExpense(
  expense: Partial<Expense> & { amount?: number },
  index: number,
): Expense {
  return {
    id: expense.id ?? `model-${Date.now()}-${index}`,
    date: typeof expense.date === "string" ? expense.date : new Date().toISOString().slice(0, 10),
    description: typeof expense.description === "string" && expense.description ? expense.description : "模型识别消费",
    category: normalizeCategory(expense.category),
    originalAmount: normalizeAmount(expense.originalAmount ?? expense.amount),
    currency: normalizeCurrency(expense.currency),
    merchant: typeof expense.merchant === "string" && expense.merchant ? expense.merchant : "未知商家",
    status: expense.status === "reported" ? "reported" : "unreported",
    note: typeof expense.note === "string" && expense.note ? expense.note : "模型识别",
    source: typeof expense.source === "string" && expense.source ? expense.source : "模型识别",
    recurring: Boolean(expense.recurring),
    confidence:
      typeof expense.confidence === "number" && Number.isFinite(expense.confidence)
        ? Math.max(0, Math.min(100, Math.round(expense.confidence)))
        : 80,
    attachment: normalizeAttachment(expense.attachment),
    attachments: normalizeAttachments(expense.attachments),
    amountText:
      typeof expense.amountText === "string" && expense.amountText ? expense.amountText : "",
    currencyEvidence:
      typeof expense.currencyEvidence === "string" && expense.currencyEvidence
        ? expense.currencyEvidence
        : "",
    paymentMethod:
      typeof expense.paymentMethod === "string" && expense.paymentMethod
        ? expense.paymentMethod
        : "",
    evidenceText:
      typeof expense.evidenceText === "string" && expense.evidenceText ? expense.evidenceText : "",
    carryoverFromId:
      typeof expense.carryoverFromId === "string" ? expense.carryoverFromId : undefined,
    carryoverFromDate:
      typeof expense.carryoverFromDate === "string" ? expense.carryoverFromDate : undefined,
  };
}

export function normalizeAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const attachment = value as Partial<Attachment>;
  if (typeof attachment.id !== "string" || typeof attachment.url !== "string") {
    return null;
  }

  return {
    id: attachment.id,
    name: typeof attachment.name === "string" && attachment.name ? attachment.name : "上传附件",
    mimeType:
      typeof attachment.mimeType === "string" && attachment.mimeType
        ? attachment.mimeType
        : "application/octet-stream",
    size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
    url: attachment.url,
  };
}

export function normalizeAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Map<string, Attachment>();
  for (const item of value) {
    const attachment = normalizeAttachment(item);
    if (attachment && !unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  }
  return [...unique.values()];
}

export function normalizeCategory(value: unknown): Category {
  return categories.includes(value as Category) ? (value as Category) : "办公";
}

export function normalizeCurrency(value: unknown): Currency {
  if (value === "USD" || value === "AUD" || value === "TWD") {
    return value;
  }
  return "CNY";
}

export function normalizeAmount(value: unknown) {
  const amount = Number(value);
  const absoluteAmount = Math.abs(amount);
  return Number.isFinite(absoluteAmount) && absoluteAmount > 0 ? Number(absoluteAmount.toFixed(2)) : 0;
}
