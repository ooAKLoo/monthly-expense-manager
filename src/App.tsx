import {
  ChangeEvent,
  ClipboardEvent,
  ComponentType,
  DragEvent,
  KeyboardEvent,
  SVGProps,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Coffee,
  Columns3,
  Copy,
  Download,
  FileText,
  File as FileIcon,
  Home,
  Image as ImageIcon,
  Plane,
  Paperclip,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Square,
  SquareCheckBig,
  SquareMinus,
  Sparkles,
  TrainFront,
  Trash2,
  X,
} from "lucide-react";

type Currency = "CNY" | "USD" | "AUD" | "TWD";
type Status = "reported" | "unreported";
type Category = "交通" | "餐饮" | "购物" | "住房" | "办公" | "差旅" | "订阅";

type Expense = {
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
};

type UploadRecord = {
  name: string;
  count: number;
  confidence: number;
};

type AnalyzeExpensesResponse = {
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

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

type AttachmentPreviewTarget = {
  expenseId: string;
  attachment: Attachment;
};

type DateRange = {
  start: string;
  end: string;
};

type Bill = {
  id: string;
  currentMonth: string;
  dateRange: DateRange;
  expenses: Expense[];
};

type ExportSummary = {
  total: number;
  reported: number;
  unreported: number;
  count: number;
};

const exchangeRate = 7.21;
const audExchangeRate = 4.7;
const twdExchangeRate = 0.23;
const pageSize = 8;

const seedExpenses: Expense[] = [];
const categories: Category[] = ["交通", "餐饮", "购物", "住房", "办公", "差旅", "订阅"];
const statuses: Array<{ value: Status; label: string }> = [
  { value: "reported", label: "已报销" },
  { value: "unreported", label: "未报销" },
];
const analysisSteps = [
  "自动识别消费信息",
  "智能分类消费类型",
  "外币金额换算人民币",
  "未报销项目下月迁移",
];

const categoryMeta: Record<
  Category,
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; className: string }
> = {
  交通: { Icon: TrainFront, className: "bg-blue-50 text-blue-700 ring-blue-200" },
  餐饮: { Icon: Coffee, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  购物: { Icon: ShoppingBag, className: "bg-violet-50 text-violet-700 ring-violet-200" },
  住房: { Icon: Home, className: "bg-amber-50 text-amber-700 ring-amber-200" },
  办公: { Icon: BriefcaseBusiness, className: "bg-slate-100 text-slate-700 ring-slate-200" },
  差旅: { Icon: Plane, className: "bg-cyan-50 text-cyan-700 ring-cyan-200" },
  订阅: { Icon: Repeat2, className: "bg-rose-50 text-rose-700 ring-rose-200" },
};

function amountInCny(expense: Pick<Expense, "currency" | "originalAmount">) {
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

function formatCny(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTwd(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAud(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatOriginalAmount(expense: Pick<Expense, "currency" | "originalAmount">) {
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

function formatOriginalAmountNote(expense: Pick<Expense, "currency" | "originalAmount">) {
  if (expense.currency === "CNY") {
    return "";
  }

  return `（原币 ${formatOriginalAmount(expense)}）`;
}

function formatEditableAmount(value: number) {
  const amount = normalizeAmount(value);
  if (amount === 0) {
    return "";
  }

  return amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function parseEditableAmount(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) {
    return null;
  }

  const amount = Math.abs(Number(normalized));
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : null;
}

function getClipboardFilename(mimeType: string, index: number) {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  return `clipboard-${getDownloadStamp()}-${index + 1}.${extension}`;
}

function isAcceptedUploadFile(file: File) {
  return file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function filesFromClipboard(items: DataTransferItemList) {
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

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))
  );
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getBrowserToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function expenseMonthKey(date: string) {
  return date.slice(0, 7);
}

function getMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getMonthDateRange(date: Date): DateRange {
  const month = monthKey(date);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDate).padStart(2, "0")}`,
  };
}

function normalizeDateRange(value: unknown, currentMonth: Date): DateRange {
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

function getDateRangeLabel(dateRange: DateRange) {
  return `${dateRange.start.replaceAll("-", "/")} - ${dateRange.end.replaceAll("-", "/")}`;
}

function getDownloadStamp(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("");
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "");
}

function getFilterLabel(statusFilter: "all" | Status, query: string) {
  const statusLabel =
    statusFilter === "all" ? "全部" : statusFilter === "reported" ? "已报销" : "未报销";
  const normalized = query.trim();
  return normalized ? `${statusLabel}-搜索-${normalized}` : statusLabel;
}

function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const windowSize = 5;
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateInMonth(date: string, target: Date) {
  const day = Math.min(Number(date.slice(8, 10)), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function currentMonthDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function parseMonthDate(value: string) {
  const match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) {
    return currentMonthDate();
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function normalizeBillId(value: string | null) {
  return value && /^[a-zA-Z0-9_-]{6,80}$/.test(value) ? value : "";
}

function getBillIdFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  const match = hash.match(/^bill=([a-zA-Z0-9_-]{6,80})$/) ?? hash.match(/^bill_([a-zA-Z0-9_-]{6,80})$/);
  return normalizeBillId(match?.[1] ?? "");
}

function createLocalBillId() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

function ensureBillIdInUrl() {
  const existing = getBillIdFromHash();
  if (existing) {
    return existing;
  }

  const id = createLocalBillId();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#bill=${id}`);
  return id;
}

function apiUrl(path: string) {
  const hrefWithoutHash = window.location.href.replace(/#.*$/, "");
  const baseHref = hrefWithoutHash.endsWith("/")
    ? hrefWithoutHash
    : `${hrefWithoutHash.replace(/\/[^/]*$/, "")}/`;
  return new URL(`api/${path.replace(/^\/+/, "")}`, baseHref).toString();
}

function attachmentUrl(attachment: Attachment) {
  return new URL(attachment.url.replace(/^\/+/, ""), apiUrl("../")).toString();
}

function attachmentDownloadUrl(attachment: Attachment) {
  const url = new URL(attachmentUrl(attachment));
  url.searchParams.set("download", "1");
  return url.toString();
}

function isImageAttachment(attachment: Attachment) {
  return /^image\/(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(attachment.mimeType);
}

function isPdfAttachment(attachment: Attachment) {
  return attachment.mimeType === "application/pdf" || /\.pdf$/i.test(attachment.name);
}

function canPreviewAttachment(attachment: Attachment) {
  return isImageAttachment(attachment) || isPdfAttachment(attachment);
}

function getExpenseAttachments(expense: Pick<Expense, "attachment" | "attachments">) {
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

async function loadBill(billId: string): Promise<Bill> {
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

async function saveBill(bill: Bill) {
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

async function uploadExpenseAttachments(files: File[], billId: string) {
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

async function analyzeUploadedFiles(
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

async function reanalyzeStoredAttachment(
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

function normalizeApiExpense(
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
  };
}

function normalizeAttachment(value: unknown): Attachment | null {
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

function normalizeAttachments(value: unknown): Attachment[] {
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

function normalizeCategory(value: unknown): Category {
  return categories.includes(value as Category) ? (value as Category) : "办公";
}

function normalizeCurrency(value: unknown): Currency {
  if (value === "USD" || value === "AUD" || value === "TWD") {
    return value;
  }
  return "CNY";
}

function normalizeAmount(value: unknown) {
  const amount = Number(value);
  const absoluteAmount = Math.abs(amount);
  return Number.isFinite(absoluteAmount) && absoluteAmount > 0 ? Number(absoluteAmount.toFixed(2)) : 0;
}

type MenuOption<T extends string> = {
  value: T;
  label: string;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

function MenuSelect<T extends string>({
  value,
  options,
  ariaLabel,
  buttonClassName,
  triggerLabel,
  triggerIcon,
  onChange,
}: {
  value: T | null;
  options: MenuOption<T>[];
  ariaLabel: string;
  buttonClassName: string;
  triggerLabel?: string;
  triggerIcon?: ComponentType<SVGProps<SVGSVGElement>>;
  onChange: (value: T) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 176 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedLabel = selected?.label ?? triggerLabel ?? options[0].label;
  const SelectedIcon = selected?.Icon ?? triggerIcon;

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const width = Math.max(176, rect.width);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const estimatedHeight = Math.min(options.length * 48 + 12, 344);
    const opensUpward =
      window.innerHeight - rect.bottom < estimatedHeight + 12 && rect.top > estimatedHeight;
    const top = opensUpward
      ? Math.max(12, rect.top - estimatedHeight - 7)
      : Math.min(rect.bottom + 7, window.innerHeight - estimatedHeight - 12);
    setMenuPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    updateMenuPosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeWhenOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const reposition = () => updateMenuPosition();
    document.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  const selectOption = (option: MenuOption<T>) => {
    setActiveIndex(Math.max(0, options.findIndex((item) => item.value === option.value)));
    onChange(option.value);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const currentIndex = isOpen ? activeIndex : selectedIndex;
      setActiveIndex((currentIndex + direction + options.length) % options.length);
      setIsOpen(true);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!isOpen) {
        return;
      }
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && isOpen) {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  };

  const toggleMenu = () => {
    setIsOpen((open) => {
      if (!open) {
        setActiveIndex(selectedIndex);
      }
      return !open;
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={`${ariaLabel}，当前：${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
        onClick={toggleMenu}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex items-center gap-1.5 whitespace-nowrap pr-7 transition focus:outline-none focus:ring-4 focus:ring-blue-100/70 ${buttonClassName}`}
      >
        {SelectedIcon ? <SelectedIcon className="size-3.5" /> : null}
        <span>{selectedLabel}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-2 size-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
              className="menu-pop no-print fixed z-[90] max-h-[344px] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/5"
            >
              {options.map((option, index) => {
                const OptionIcon = option.Icon;
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={-1}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                      isActive ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center rounded-md ${
                        isSelected ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-500"
                      }`}
                    >
                      {OptionIcon ? <OptionIcon className="size-3.5" /> : null}
                    </span>
                    <span className="flex-1">{option.label}</span>
                    <Check
                      className={`size-4 text-blue-600 transition-opacity ${
                        isSelected ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function DateRangePicker({
  currentMonth,
  value,
  onChange,
}: {
  currentMonth: Date;
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const restoreTriggerFocusRef = useRef(false);
  const dialogId = useId();
  const titleId = useId();
  const errorId = useId();
  const monthRange = getMonthDateRange(currentMonth);
  const isInCurrentMonth =
    draft.start >= monthRange.start &&
    draft.end <= monthRange.end &&
    draft.start.slice(0, 7) === monthKey(currentMonth) &&
    draft.end.slice(0, 7) === monthKey(currentMonth);
  const errorMessage = !isInCurrentMonth
    ? `日期必须位于 ${getMonthLabel(currentMonth)} 内`
    : draft.start > draft.end
      ? "结束日期不能早于开始日期"
      : "";
  const isValid = !errorMessage;

  useEffect(() => {
    if (!isOpen) {
      setDraft(value);
    }
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => startInputRef.current?.focus());

    const closeWhenOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        restoreTriggerFocusRef.current = false;
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        restoreTriggerFocusRef.current = true;
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
      if (restoreTriggerFocusRef.current) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
  }, [isOpen]);

  const openPicker = () => {
    if (isOpen) {
      restoreTriggerFocusRef.current = true;
      setIsOpen(false);
      return;
    }
    restoreTriggerFocusRef.current = false;
    setDraft(value);
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <p className="text-xl font-semibold tracking-normal text-slate-950">{getMonthLabel(currentMonth)}</p>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="mt-2 inline-flex items-center gap-2 rounded-md text-sm font-medium text-slate-500 transition hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-50"
        aria-label={`修改日期范围，当前：${getDateRangeLabel(value)}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? dialogId : undefined}
      >
        <CalendarRange className="size-4" />
        {getDateRangeLabel(value)}
        <ChevronDown className={`size-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div
          id={dialogId}
          role="dialog"
          aria-labelledby={titleId}
          className="menu-pop no-print absolute left-0 top-full z-50 mt-3 max-h-[calc(100vh-7rem)] w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-slate-950/5"
        >
          <div className="flex items-center justify-between">
            <div>
              <p id={titleId} className="text-sm font-semibold text-slate-900">精确日期范围</p>
              <p className="mt-1 text-xs text-slate-500">可选择 {getMonthLabel(currentMonth)} 内任意起止日</p>
            </div>
            <CalendarDays className="size-5 text-blue-600" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              开始日期
              <input
                ref={startInputRef}
                type="date"
                value={draft.start}
                min={monthRange.start}
                max={monthRange.end}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? errorId : undefined}
                onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))}
                className="mt-1.5 h-10 w-full rounded-lg border-0 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              结束日期
              <input
                type="date"
                value={draft.end}
                min={monthRange.start}
                max={monthRange.end}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? errorId : undefined}
                onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))}
                className="mt-1.5 h-10 w-full rounded-lg border-0 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
          {errorMessage ? (
            <p id={errorId} role="alert" className="mt-2 text-xs font-medium text-rose-600">
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setDraft(monthRange)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              恢复整月
            </button>
            <div className="flex gap-2">
              <button
              type="button"
              onClick={() => {
                restoreTriggerFocusRef.current = true;
                setIsOpen(false);
              }}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!isValid}
                onClick={() => {
                  onChange(draft);
                  restoreTriggerFocusRef.current = true;
                  setIsOpen(false);
                }}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                应用范围
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategorySelect({
  category,
  onChange,
}: {
  category: Category;
  onChange: (category: Category) => void;
}) {
  const meta = categoryMeta[category];
  const options = categories.map((item) => ({
    value: item,
    label: item,
    Icon: categoryMeta[item].Icon,
  }));

  return (
    <MenuSelect
      value={category}
      options={options}
      ariaLabel="修改消费类型"
      buttonClassName={`rounded-full px-2.5 py-1.5 text-xs font-medium ring-1 ${meta.className}`}
      onChange={onChange}
    />
  );
}

function StatusSelect({
  status,
  onChange,
}: {
  status: Status;
  onChange: (status: Status) => void;
}) {
  const isReported = status === "reported";
  const options: MenuOption<Status>[] = statuses.map((item) => ({
    ...item,
    Icon: item.value === "reported" ? BadgeCheck : ReceiptText,
  }));
  const className = isReported
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-orange-50 text-orange-700 ring-orange-200";

  return (
    <MenuSelect
      value={status}
      options={options}
      ariaLabel="修改报销状态"
      buttonClassName={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${className}`}
      onChange={onChange}
    />
  );
}

function BatchStatusSelect({ onChange }: { onChange: (status: Status) => void }) {
  const options: MenuOption<Status>[] = statuses.map((item) => ({
    ...item,
    Icon: item.value === "reported" ? BadgeCheck : ReceiptText,
  }));

  return (
    <MenuSelect
      value={null}
      options={options}
      ariaLabel="批量修改报销状态"
      triggerLabel="修改状态"
      triggerIcon={BadgeCheck}
      buttonClassName="h-8 rounded-lg bg-white px-3 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100"
      onChange={onChange}
    />
  );
}

function AmountCell({
  expense,
  onAmountChange,
}: {
  expense: Expense;
  onAmountChange: (amount: number) => void;
}) {
  const [draftAmount, setDraftAmount] = useState(() => formatEditableAmount(expense.originalAmount));
  const [isEditing, setIsEditing] = useState(false);
  const isForeignCurrency = expense.currency !== "CNY";
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftAmount(formatEditableAmount(expense.originalAmount));
    }
  }, [expense.originalAmount, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  const updateAmountFromInput = (value: string) => {
    setDraftAmount(value);

    const nextAmount = parseEditableAmount(value);
    if (nextAmount === null || nextAmount <= 0 || nextAmount === expense.originalAmount) {
      return;
    }

    onAmountChange(nextAmount);
  };

  const commitAmountInput = () => {
    const nextAmount = parseEditableAmount(draftAmount);
    if (nextAmount === null || nextAmount <= 0) {
      setDraftAmount(formatEditableAmount(expense.originalAmount));
      setIsEditing(false);
      return;
    }

    if (nextAmount !== expense.originalAmount) {
      onAmountChange(nextAmount);
    }
    setDraftAmount(formatEditableAmount(nextAmount));
    setIsEditing(false);
  };

  if (!isEditing) {
    const originalNote = formatOriginalAmountNote(expense);

    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="block w-full bg-transparent p-0 text-right"
        aria-label="修改金额"
      >
        <p className="font-semibold text-slate-800">{formatCny(amountInCny(expense))}</p>
        {originalNote ? <p className="mt-1 text-xs font-medium text-slate-400">{originalNote}</p> : null}
      </button>
    );
  }

  return (
    <div className="text-right">
      {isForeignCurrency ? (
        <p className="font-semibold text-slate-800">{formatCny(amountInCny(expense))}</p>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label="修改金额"
        value={draftAmount}
        onChange={(event) => updateAmountFromInput(event.target.value)}
        onBlur={commitAmountInput}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={`w-full bg-transparent p-0 text-right outline-none ${
          isForeignCurrency
            ? "mt-1 text-xs font-medium text-slate-500"
            : "font-semibold text-slate-800"
        }`}
      />
    </div>
  );
}

function AnalysisProgress({
  isAnalyzing,
  hasUpload,
}: {
  isAnalyzing: boolean;
  hasUpload: boolean;
}) {
  const activeIndex = isAnalyzing ? 1 : -1;
  const progressPercent = isAnalyzing ? 58 : hasUpload ? 100 : 0;

  return (
    <div className="mt-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            hasUpload ? "bg-emerald-500" : "bg-blue-600"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <ul className="mt-4 space-y-3 text-sm text-slate-600">
        {analysisSteps.map((step, index) => {
          const active = index === activeIndex;
          const completed = hasUpload || !isAnalyzing || index < activeIndex;

          return (
            <li key={step} className="grid grid-cols-[20px_1fr] items-center gap-3">
              <span
                className={`flex size-5 items-center justify-center rounded-full ${
                  completed
                    ? "bg-blue-50 text-blue-600"
                    : active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {active ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
              </span>
              <span>{step}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useModalFocus(
  isOpen: boolean,
  containerRef: { current: HTMLElement | null },
  initialFocusRef: { current: HTMLElement | null },
  onClose: () => void,
  fallbackSelector: string,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.querySelector<HTMLElement>(".print-shell");
    const previousOverflow = document.body.style.overflow;
    const previousInert = background?.inert ?? false;
    if (background) {
      background.inert = true;
    }
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      (initialFocusRef.current ?? containerRef.current)?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !containerRef.current) {
        return;
      }

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => element.offsetParent !== null && !element.hasAttribute("data-focus-sentinel"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        containerRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (background) {
        background.inert = previousInert;
      }
      window.requestAnimationFrame(() => {
        if (returnFocus?.isConnected) {
          returnFocus.focus();
        } else {
          document.querySelector<HTMLElement>(fallbackSelector)?.focus();
        }
      });
    };
  }, [containerRef, fallbackSelector, initialFocusRef, isOpen]);
}

function SourceCell({
  expense,
  onPreview,
  onAddAttachments,
  isUploading,
  isUploadDisabled,
}: {
  expense: Expense;
  onPreview: (attachment: Attachment, expenseId: string) => void;
  onAddAttachments: (expenseId: string, files: File[]) => void;
  isUploading: boolean;
  isUploadDisabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const attachments = getExpenseAttachments(expense);
  return (
    <div className="no-print flex min-w-0 items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            onAddAttachments(expense.id, files);
          }
          event.target.value = "";
        }}
      />
      {attachments.length > 0 ? (
        <div className="flex max-w-[150px] min-w-0 items-center gap-1 overflow-x-auto py-1">
          {attachments.map((attachment) => {
            const image = isImageAttachment(attachment);
            const previewable = canPreviewAttachment(attachment);
            const className =
              "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-white bg-slate-100 text-slate-500 shadow-sm transition hover:z-10 hover:-translate-y-0.5 hover:text-blue-700";
            const content = image ? (
              <img src={attachmentUrl(attachment)} alt="" className="size-full object-cover" />
            ) : isPdfAttachment(attachment) ? (
              <FileText className="size-4" />
            ) : (
              <FileIcon className="size-4" />
            );
            return previewable ? (
              <button
                key={attachment.id}
                type="button"
                onClick={() => onPreview(attachment, expense.id)}
                className={className}
                title={attachment.name}
                aria-label={`预览附件 ${attachment.name}`}
              >
                {content}
              </button>
            ) : (
              <a
                key={attachment.id}
                href={attachmentDownloadUrl(attachment)}
                className={className}
                title={`${attachment.name}（下载）`}
                aria-label={`下载附件 ${attachment.name}`}
              >
                {content}
              </a>
            );
          })}
        </div>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500">
          {expense.source === "AI 识别" ? <BrainCircuit className="size-3.5 shrink-0 text-blue-600" /> : null}
          <span className="truncate">{expense.source}</span>
        </span>
      )}
      <span className="shrink-0 text-[11px] font-medium text-slate-400">
        {attachments.length > 0 ? `${attachments.length} 个` : ""}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploadDisabled}
        className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-200 disabled:cursor-wait disabled:opacity-60"
        aria-label={isUploading ? `正在为 ${expense.description} 上传附件` : `为 ${expense.description} 添加附件`}
        aria-busy={isUploading}
        title="添加附件（格式不限，单个不超过 10MB）"
      >
        {isUploading ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <>
            <Paperclip className="size-4" />
            <Plus className="absolute bottom-1 right-1 size-2.5 rounded-full bg-white" />
          </>
        )}
      </button>
    </div>
  );
}

function AttachmentPreview({
  attachment,
  isReanalyzing,
  canReanalyze,
  onClose,
  onReanalyze,
}: {
  attachment: Attachment | null;
  isReanalyzing: boolean;
  canReanalyze: boolean;
  onClose: () => void;
  onReanalyze: (attachment: Attachment) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useModalFocus(Boolean(attachment), dialogRef, closeButtonRef, onClose, "table button");

  if (!attachment) {
    return null;
  }

  const image = isImageAttachment(attachment);
  const pdf = isPdfAttachment(attachment);
  const url = attachmentUrl(attachment);
  return createPortal(
    <div
      className="no-print fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {image ? (
              <ImageIcon className="size-4 text-blue-600" />
            ) : pdf ? (
              <FileText className="size-4 text-slate-500" />
            ) : (
              <FileIcon className="size-4 text-slate-500" />
            )}
            <p id={titleId} className="truncate text-sm font-semibold text-slate-800">{attachment.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={attachmentDownloadUrl(attachment)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <Download className="size-3.5" />
              下载
            </a>
            {canReanalyze ? (
              <button
                type="button"
                onClick={() => onReanalyze(attachment)}
                disabled={isReanalyzing}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`size-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
                {isReanalyzing ? "重新识别中" : "重新识别并修复"}
              </button>
            ) : null}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="关闭预览"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-4">
          {image ? (
            <img
              src={url}
              alt={attachment.name}
              className="max-h-[78vh] max-w-full rounded-md object-contain shadow-sm"
            />
          ) : pdf ? (
            <iframe
              title={`PDF 预览：${attachment.name}`}
              src={url}
              tabIndex={0}
              referrerPolicy="no-referrer"
              className="h-[78vh] w-full rounded-md bg-white"
            />
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl bg-white px-8 text-center shadow-sm">
              <FileIcon className="size-12 text-slate-300" />
              <p className="mt-4 max-w-md truncate text-sm font-semibold text-slate-800">{attachment.name}</p>
              <p className="mt-2 text-xs text-slate-500">此格式仅支持安全下载，不在页面中执行或预览。</p>
            </div>
          )}
        </div>
        <span
          data-focus-sentinel
          tabIndex={0}
          className="sr-only"
          onFocus={() =>
            dialogRef.current
              ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
              ?.focus()
          }
        />
      </div>
    </div>,
    document.body,
  );
}

function SelectionButton({
  checked,
  mixed = false,
  label,
  onToggle,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onToggle: (shiftKey: boolean) => void;
}) {
  const Icon = mixed ? SquareMinus : checked ? SquareCheckBig : Square;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      onClick={(event) => onToggle(event.shiftKey)}
      className={`no-print flex size-9 items-center justify-center rounded-lg transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${
        checked || mixed
          ? "bg-blue-50 text-blue-700"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );
}

function DeleteExpensesDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useModalFocus(
    count > 0,
    dialogRef,
    cancelButtonRef,
    onCancel,
    '[aria-label="全选当前筛选结果"]',
  );

  if (count === 0) {
    return null;
  }

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="menu-pop w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)] ring-1 ring-slate-950/10"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <AlertTriangle className="size-5" />
        </div>
        <h2 id={titleId} className="mt-4 text-base font-semibold text-slate-950">删除 {count} 条消费记录？</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-500">
          删除后记录会从共享账单中移除；公共附件文件不会被级联删除，避免影响其他引用记录。
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-200"
          >
            <Trash2 className="size-4" />
            确认删除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmptyState({
  hasRangeExpenses,
  onResetRange,
  onClearFilters,
}: {
  hasRangeExpenses: boolean;
  onResetRange: () => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center bg-white text-center">
      <ReceiptText className="mb-3 size-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">
        {hasRangeExpenses ? "没有符合筛选条件的记录" : "所选日期范围暂无消费记录"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {hasRangeExpenses ? "可以清除状态或搜索条件后重试" : "可恢复整月范围，或上传新的消费票据"}
      </p>
      <button
        type="button"
        onClick={hasRangeExpenses ? onClearFilters : onResetRange}
        className="no-print mt-4 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        {hasRangeExpenses ? "清除筛选" : "恢复整月"}
      </button>
    </div>
  );
}

function ExportPdfReport({
  currentMonth,
  dateRange,
  filterLabel,
  expenses,
  summary,
}: {
  currentMonth: Date;
  dateRange: DateRange;
  filterLabel: string;
  expenses: Expense[];
  summary: ExportSummary;
}) {
  const cellStyle = {
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 12px",
    verticalAlign: "top",
  } as const;

  return (
    <div
      style={{
        width: 1160,
        background: "#ffffff",
        color: "#111827",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        padding: 32,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>消费明细</div>
          <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
            {getMonthLabel(currentMonth)} · {getDateRangeLabel(dateRange)} · 当前筛选：{filterLabel}
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 13, textAlign: "right" }}>
          <div>
            汇率：1 USD = {exchangeRate.toFixed(2)} CNY · 1 AUD = {audExchangeRate.toFixed(2)} CNY · 1 TWD = {twdExchangeRate.toFixed(2)} CNY
          </div>
          <div style={{ marginTop: 4 }}>导出时间：{new Date().toLocaleString("zh-CN")}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 24 }}>
        {[
          ["筛选总金额", formatCny(summary.total), "#111827"],
          ["已报销", formatCny(summary.reported), "#047857"],
          ["未报销", formatCny(summary.unreported), "#ea580c"],
          ["记录数", `${summary.count} 笔`, "#111827"],
        ].map(([label, value, color]) => (
          <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>{label}</div>
            <div style={{ marginTop: 10, color, fontSize: 22, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24, fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f8fafc", color: "#475569", textAlign: "left" }}>
            {["日期", "描述", "类型", "金额", "商家", "报销状态", "来源 / 附件", "备注"].map((head) => (
              <th key={head} style={{ ...cellStyle, fontWeight: 700 }}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id}>
              <td style={{ ...cellStyle, whiteSpace: "nowrap", color: "#475569" }}>{expense.date.replaceAll("-", "/")}</td>
              <td style={{ ...cellStyle, fontWeight: 600 }}>{expense.description}</td>
              <td style={cellStyle}>{expense.category}</td>
              <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>
                <div>{formatCny(amountInCny(expense))}</div>
                {expense.currency !== "CNY" ? (
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 11, fontWeight: 500 }}>
                    {formatOriginalAmountNote(expense)}
                  </div>
                ) : null}
              </td>
              <td style={cellStyle}>{expense.merchant}</td>
              <td style={cellStyle}>{expense.status === "reported" ? "已报销" : "未报销"}</td>
              <td style={cellStyle}>
                {getExpenseAttachments(expense).length > 0
                  ? getExpenseAttachments(expense)
                      .map((attachment) => attachment.name)
                      .join("、")
                  : expense.source}
              </td>
              <td style={cellStyle}>{expense.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [billId, setBillId] = useState("");
  const [isLoadingBill, setIsLoadingBill] = useState(true);
  const [saveStatus, setSaveStatus] = useState("正在连接账单");
  const [currentMonth, setCurrentMonth] = useState(currentMonthDate);
  const [dateRange, setDateRange] = useState<DateRange>(() => getMonthDateRange(currentMonthDate()));
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadRecord | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const [previewTarget, setPreviewTarget] = useState<AttachmentPreviewTarget | null>(null);
  const [repairingAttachmentId, setRepairingAttachmentId] = useState("");
  const [uploadingAttachmentExpenseId, setUploadingAttachmentExpenseId] = useState("");
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);
  const pdfReportRef = useRef<HTMLDivElement>(null);
  const loadedBillRef = useRef(false);
  const selectionAnchorIdRef = useRef<string | null>(null);
  const activeBillIdRef = useRef("");
  const pendingBillSaveRef = useRef<Bill | null>(null);
  const billSaveInFlightRef = useRef(false);
  const previewAttachment = previewTarget?.attachment ?? null;
  activeBillIdRef.current = billId;

  const flushPendingBillSave = async () => {
    if (billSaveInFlightRef.current) {
      return;
    }

    billSaveInFlightRef.current = true;
    while (pendingBillSaveRef.current) {
      const snapshot = pendingBillSaveRef.current;
      pendingBillSaveRef.current = null;
      try {
        await saveBill(snapshot);
        if (activeBillIdRef.current === snapshot.id && !pendingBillSaveRef.current) {
          setSaveStatus("已保存");
        }
      } catch (error) {
        if (activeBillIdRef.current === snapshot.id && !pendingBillSaveRef.current) {
          setSaveStatus(error instanceof Error ? error.message : "保存失败");
        }
      }
    }
    billSaveInFlightRef.current = false;
  };

  useEffect(() => {
    let cancelled = false;

    const syncBill = async () => {
      const id = ensureBillIdInUrl();
      setBillId(id);
      setIsLoadingBill(true);
      setSaveStatus("正在加载账单");

      try {
        const bill = await loadBill(id);
        if (cancelled) {
          return;
        }

        const loadedMonth = parseMonthDate(bill.currentMonth);
        setCurrentMonth(loadedMonth);
        setDateRange(normalizeDateRange(bill.dateRange, loadedMonth));
        setExpenses(bill.expenses);
        setSelectedExpenseIds(new Set());
        selectionAnchorIdRef.current = null;
        setSaveStatus("已连接共享账单");
        loadedBillRef.current = true;
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSaveStatus(error instanceof Error ? error.message : "账单加载失败");
      } finally {
        if (!cancelled) {
          setIsLoadingBill(false);
        }
      }
    };

    void syncBill();

    const handleHashChange = () => {
      loadedBillRef.current = false;
      void syncBill();
    };
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!billId || isLoadingBill || !loadedBillRef.current) {
      return;
    }

    setSaveStatus("正在保存");
    const timeout = window.setTimeout(() => {
      pendingBillSaveRef.current = {
        id: billId,
        currentMonth: monthKey(currentMonth),
        dateRange,
        expenses,
      };
      void flushPendingBillSave();
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [billId, currentMonth, dateRange, expenses, isLoadingBill]);

  const currentKey = monthKey(currentMonth);
  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expenseMonthKey(expense.date) === currentKey)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, currentKey],
  );

  const rangeExpenses = useMemo(
    () =>
      monthExpenses.filter(
        (expense) => expense.date >= dateRange.start && expense.date <= dateRange.end,
      ),
    [dateRange.end, dateRange.start, monthExpenses],
  );

  const filteredExpenses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rangeExpenses.filter((expense) => {
      const matchesStatus = statusFilter === "all" || expense.status === statusFilter;
      const matchesQuery =
        normalized.length === 0 ||
        [
          expense.description,
          expense.merchant,
          expense.note,
          expense.category,
          expense.source,
          ...getExpenseAttachments(expense).map((attachment) => attachment.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [query, rangeExpenses, statusFilter]);

  const unreportedRangeExpenseCount = useMemo(
    () => rangeExpenses.filter((expense) => expense.status === "unreported").length,
    [rangeExpenses],
  );

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const visiblePageNumbers = useMemo(
    () => getVisiblePageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const pagedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredExpenses.slice(start, start + pageSize);
  }, [currentPage, filteredExpenses]);
  const allFilteredSelected =
    filteredExpenses.length > 0 &&
    filteredExpenses.every((expense) => selectedExpenseIds.has(expense.id));
  const someFilteredSelected =
    !allFilteredSelected && filteredExpenses.some((expense) => selectedExpenseIds.has(expense.id));

  useEffect(() => {
    setCurrentPage(1);
  }, [currentKey, dateRange.end, dateRange.start, query, statusFilter]);

  useEffect(() => {
    setSelectedExpenseIds(new Set());
    selectionAnchorIdRef.current = null;
  }, [billId, currentKey, dateRange.end, dateRange.start, query, statusFilter]);

  useEffect(() => {
    const visibleIds = new Set(filteredExpenses.map((expense) => expense.id));
    setSelectedExpenseIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
    if (selectionAnchorIdRef.current && !visibleIds.has(selectionAnchorIdRef.current)) {
      selectionAnchorIdRef.current = null;
    }
  }, [filteredExpenses]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const summary = useMemo(() => {
    const total = rangeExpenses.reduce((sum, expense) => sum + amountInCny(expense), 0);
    const reported = rangeExpenses
      .filter((expense) => expense.status === "reported")
      .reduce((sum, expense) => sum + amountInCny(expense), 0);
    const unreported = total - reported;
    const categories = new Set(rangeExpenses.map((expense) => expense.category)).size;

    return {
      total,
      reported,
      unreported,
      count: rangeExpenses.length,
      categories,
      reportedRatio: total ? (reported / total) * 100 : 0,
      unreportedRatio: total ? (unreported / total) * 100 : 0,
    };
  }, [rangeExpenses]);

  const filterLabel = useMemo(() => getFilterLabel(statusFilter, query), [query, statusFilter]);

  const filteredSummary = useMemo(() => {
    const total = filteredExpenses.reduce((sum, expense) => sum + amountInCny(expense), 0);
    const reported = filteredExpenses
      .filter((expense) => expense.status === "reported")
      .reduce((sum, expense) => sum + amountInCny(expense), 0);

    return {
      total,
      reported,
      unreported: total - reported,
      count: filteredExpenses.length,
    };
  }, [filteredExpenses]);

  const nextMonthPreview = useMemo(() => {
    const movable = monthExpenses.filter((expense) => expense.status === "unreported" || expense.recurring);
    const total = movable.reduce((sum, expense) => sum + amountInCny(expense), 0);
    return { count: movable.length, total, items: movable };
  }, [monthExpenses]);

  const processFiles = async (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) {
      return;
    }

    if (isLoadingBill || isAnalyzing) {
      setExportNotice("请等待当前账单或识别任务完成");
      return;
    }

    const files = incomingFiles.filter(isAcceptedUploadFile);
    if (files.length === 0) {
      setExportNotice("仅支持 JPG、PNG、PDF 格式");
      return;
    }

    setIsAnalyzing(true);
    setExportNotice("");

    try {
      if (!billId) {
        throw new Error("共享账单还未加载完成");
      }

      const result = await analyzeUploadedFiles(files, currentMonth, dateRange, billId);
      const generated = result.expenses;
      const outsideRangeCount = generated.filter(
        (expense) => expense.date < dateRange.start || expense.date > dateRange.end,
      ).length;
      setExpenses((previous) => [...generated, ...previous]);
      setLastUpload({
        name: files.length === 1 ? files[0].name : `${files.length} 个文件`,
        count: generated.length,
        confidence: Math.round(
          generated.reduce((sum, item) => sum + (item.confidence ?? 88), 0) / generated.length,
        ),
      });
      setExportNotice(
        [
          `模型识别完成（${result.modelName}）`,
          result.warnings.length > 0 ? `部分文件提示：${result.warnings.join("；")}` : "",
          outsideRangeCount > 0 ? `${outsideRangeCount} 条真实日期不在当前筛选范围内` : "",
        ]
          .filter(Boolean)
          .join("；"),
      );
    } catch (error) {
      setExportNotice(error instanceof Error ? `模型识别失败：${error.message}` : "模型识别失败");
    } finally {
      setIsAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    void processFiles(Array.from(event.target.files ?? []));
  };

  const handleUploadClick = () => {
    if (isLoadingBill || isAnalyzing) {
      return;
    }

    uploadAreaRef.current?.focus();
    fileInputRef.current?.click();
  };

  const handleUploadKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleUploadClick();
  };

  const handleUploadDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isLoadingBill || isAnalyzing) {
      event.dataTransfer.dropEffect = "none";
      return;
    }

    event.dataTransfer.dropEffect = "copy";
    setIsUploadDragging(true);
  };

  const handleUploadDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
      setIsUploadDragging(false);
    }
  };

  const handleUploadDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsUploadDragging(false);
    void processFiles(Array.from(event.dataTransfer.files));
  };

  const handleUploadPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const clipboardItems = event.clipboardData?.items;
    if (!clipboardItems) {
      return;
    }

    const files = filesFromClipboard(clipboardItems);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    void processFiles(files);
  };

  useEffect(() => {
    const handleWindowPaste = (event: WindowEventMap["paste"]) => {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) {
        return;
      }

      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) {
        return;
      }

      const files = filesFromClipboard(clipboardItems);
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      void processFiles(files);
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [processFiles]);

  const handleAddAttachments = async (expenseId: string, files: File[]) => {
    if (!billId || files.length === 0 || uploadingAttachmentExpenseId) {
      return;
    }
    if (files.length > 8) {
      setExportNotice("附件上传失败：每次最多选择 8 个文件");
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setExportNotice("附件上传失败：单个文件不能超过 10MB");
      return;
    }

    setUploadingAttachmentExpenseId(expenseId);
    setExportNotice(`正在上传 ${files.length} 个附件...`);
    try {
      const attachments = await uploadExpenseAttachments(files, billId);
      if (attachments.length === 0) {
        throw new Error("服务器未返回有效附件");
      }
      setExpenses((previous) =>
        previous.map((expense) => {
          if (expense.id !== expenseId) {
            return expense;
          }
          const unique = new Map(
            [...(expense.attachments ?? []), ...attachments].map((attachment) => [
              attachment.id,
              attachment,
            ]),
          );
          if (expense.attachment) {
            unique.delete(expense.attachment.id);
          }
          return { ...expense, attachments: [...unique.values()] };
        }),
      );
      setExportNotice(`已为该记录添加 ${attachments.length} 个附件`);
    } catch (error) {
      setExportNotice(error instanceof Error ? `附件上传失败：${error.message}` : "附件上传失败");
    } finally {
      setUploadingAttachmentExpenseId("");
    }
  };

  const handleReanalyzeAttachment = async (attachment: Attachment, expenseId: string) => {
    if (!billId || isAnalyzing || repairingAttachmentId) {
      return;
    }

    setRepairingAttachmentId(attachment.id);
    setExportNotice("正在用当前主模型重新识别原附件...");
    try {
      const existingDate = expenses.find((expense) => expense.id === expenseId)?.date ?? getBrowserToday();
      const result = await reanalyzeStoredAttachment(
        attachment,
        currentMonth,
        dateRange,
        billId,
        existingDate,
      );
      setExpenses((previous) => {
        const targetIndex = previous.findIndex((expense) => expense.id === expenseId);
        if (targetIndex < 0) {
          return previous;
        }
        const existing = previous[targetIndex];
        const repaired = result.expenses.map((expense, index) => {
          return index === 0
            ? {
                ...expense,
                id: existing.id,
                status: existing.status,
                note: existing.note || expense.note,
                recurring: existing.recurring,
                attachments: existing.attachments,
              }
            : { ...expense, attachments: existing.attachments };
        });
        return [
          ...previous.slice(0, targetIndex),
          ...repaired,
          ...previous.slice(targetIndex + 1),
        ];
      });
      setPreviewTarget(null);
      setExportNotice(
        result.warnings.length > 0
          ? `已用 ${result.modelName} 修复记录；提示：${result.warnings.join("；")}`
          : `已用 ${result.modelName} 重新识别并替换旧记录`,
      );
    } catch (error) {
      setExportNotice(error instanceof Error ? `重新识别失败：${error.message}` : "重新识别失败");
    } finally {
      setRepairingAttachmentId("");
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) {
      return;
    }

    if (filteredExpenses.length === 0) {
      setExportNotice("当前筛选结果为空，无法导出 PDF");
      return;
    }

    const reportElement = pdfReportRef.current?.firstElementChild as HTMLElement | null;
    if (!reportElement) {
      setExportNotice("PDF 报表还未准备好，请稍后再试");
      return;
    }

    setIsExportingPdf(true);
    setExportNotice("正在生成当前筛选结果 PDF...");

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      await new Promise((resolve) => window.requestAnimationFrame(resolve));

      const canvas = await html2canvas(reportElement, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 2,
        useCORS: true,
        windowWidth: reportElement.scrollWidth,
      });
      const pdf = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imageWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const pixelsPerPoint = canvas.width / imageWidth;
      const pageCanvasHeight = Math.floor(printableHeight * pixelsPerPoint);
      let sourceY = 0;
      let pageIndex = 0;

      while (sourceY < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) {
          throw new Error("无法创建 PDF 画布");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, imageWidth, sliceHeight / pixelsPerPoint);
        sourceY += pageCanvasHeight;
        pageIndex += 1;
      }

      const filename = `消费明细-${dateRange.start}_至_${dateRange.end}-${sanitizeFilenamePart(filterLabel)}-${getDownloadStamp()}.pdf`;
      pdf.save(filename);
      setExportNotice(`已下载 ${filename}`);
    } catch (error) {
      console.error(error);
      setExportNotice("PDF 生成失败，请稍后重试");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const updateExpense = (
    id: string,
    changes: Partial<Pick<Expense, "category" | "status" | "originalAmount">>,
  ) => {
    setExpenses((previous) =>
      previous.map((expense) => (expense.id === id ? { ...expense, ...changes } : expense)),
    );
  };

  const showMonth = (target: Date) => {
    const normalized = new Date(target.getFullYear(), target.getMonth(), 1);
    setCurrentMonth(normalized);
    setDateRange(getMonthDateRange(normalized));
  };

  const showToday = () => {
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = `${monthKey(month)}-${String(now.getDate()).padStart(2, "0")}`;
    setCurrentMonth(month);
    setDateRange({ start: today, end: today });
  };

  const toggleExpenseSelection = (expenseId: string, shiftKey: boolean) => {
    setSelectedExpenseIds((previous) => {
      const next = new Set(previous);
      const anchorId = selectionAnchorIdRef.current;
      const orderedIds = filteredExpenses.map((expense) => expense.id);
      const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1;
      const targetIndex = orderedIds.indexOf(expenseId);

      if (shiftKey && anchorIndex >= 0 && targetIndex >= 0) {
        const shouldSelect = !previous.has(expenseId);
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        for (const id of orderedIds.slice(start, end + 1)) {
          if (shouldSelect) {
            next.add(id);
          } else {
            next.delete(id);
          }
        }
      } else {
        if (next.has(expenseId)) {
          next.delete(expenseId);
        } else {
          next.add(expenseId);
        }
        selectionAnchorIdRef.current = expenseId;
      }
      return next;
    });
  };

  const toggleAllFilteredExpenses = () => {
    setSelectedExpenseIds((previous) => {
      const next = new Set(previous);
      if (allFilteredSelected) {
        for (const expense of filteredExpenses) {
          next.delete(expense.id);
        }
      } else {
        for (const expense of filteredExpenses) {
          next.add(expense.id);
        }
      }
      return next;
    });
    selectionAnchorIdRef.current = null;
  };

  const clearExpenseSelection = () => {
    setSelectedExpenseIds(new Set());
    selectionAnchorIdRef.current = null;
  };

  const updateSelectedExpensesStatus = (status: Status) => {
    const ids = new Set(selectedExpenseIds);
    if (ids.size === 0) {
      return;
    }
    const statusLabel = statuses.find((item) => item.value === status)?.label ?? status;
    setExpenses((previous) =>
      previous.map((expense) => (ids.has(expense.id) ? { ...expense, status } : expense)),
    );
    setExportNotice(`已将 ${ids.size} 条消费记录改为${statusLabel}`);
  };

  const settleUnreportedExpenses = () => {
    const ids = new Set(
      rangeExpenses
        .filter((expense) => expense.status === "unreported")
        .map((expense) => expense.id),
    );
    if (ids.size === 0) {
      return;
    }
    setExpenses((previous) =>
      previous.map((expense) => (ids.has(expense.id) ? { ...expense, status: "reported" } : expense)),
    );
    setExportNotice(`已结清 ${ids.size} 条未报销消费`);
  };

  const confirmDeleteExpenses = () => {
    const ids = new Set(pendingDeleteIds);
    setExpenses((previous) => previous.filter((expense) => !ids.has(expense.id)));
    setExportNotice(`已删除 ${ids.size} 条消费记录`);
    setPendingDeleteIds([]);
    clearExpenseSelection();
  };

  const rollToNextMonth = () => {
    const target = addMonths(currentMonth, 1);
    const targetKey = monthKey(target);
    const existingIds = new Set(expenses.map((expense) => expense.id));
    const movedItems = nextMonthPreview.items
      .map((expense) => {
        const id = `carry-${targetKey}-${expense.id}`;
        const carriedDate = expense.recurring ? dateInMonth(expense.date, target) : `${targetKey}-01`;
        return {
          ...expense,
          id,
          date: carriedDate,
          description: expense.recurring ? expense.description : `${expense.description}（结转）`,
          status: "unreported" as Status,
          source: expense.recurring ? "固定月度" : "自动迁移",
          note: expense.recurring ? "下月固定花费" : `上月未报销，原日期 ${expense.date.replaceAll("-", "/")}`,
        };
      })
      .filter((expense) => !existingIds.has(expense.id));

    if (movedItems.length > 0) {
      setExpenses((previous) => [...movedItems, ...previous]);
    }
    showMonth(target);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setExportNotice("已复制当前共享账单链接");
    } catch {
      setExportNotice(`共享账单链接：${window.location.href}`);
    }
  };

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="print-shell mx-auto max-w-7xl bg-white">
        <header className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-slate-50 ring-1 ring-slate-100">
              <ReceiptText className="size-5 text-slate-700" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-normal text-slate-950">月度消费管理</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>消费、报销、下月结转</span>
                {billId ? (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="font-medium text-slate-600">账单 {billId.slice(0, 8)}</span>
                    <span className="text-slate-300">/</span>
                    <span>{saveStatus}</span>
                  </>
                ) : (
                  <span>{saveStatus}</span>
                )}
              </div>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <button
              type="button"
              onClick={copyShareLink}
              disabled={!billId}
              className="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="复制共享链接"
              title="复制共享链接"
            >
              <Copy className="size-5" />
            </button>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="帮助"
            >
              <CircleHelp className="size-5" />
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="size-4" />
              {isExportingPdf ? "导出中" : "导出 PDF"}
            </button>
          </div>
        </header>

        <div className="px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <DateRangePicker
              currentMonth={currentMonth}
              value={dateRange}
              onChange={(value) => setDateRange(normalizeDateRange(value, currentMonth))}
            />
            <div className="no-print flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => showMonth(addMonths(currentMonth, -1))}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <ArrowLeft className="size-4" />
                上个月
              </button>
              <button
                type="button"
                onClick={() => showMonth(addMonths(currentMonth, 1))}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                下个月
                <ArrowRight className="size-4" />
              </button>
              <button
                type="button"
                onClick={showToday}
                className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                今天
              </button>
            </div>
          </div>

          <section className="print-break-avoid mt-6 grid overflow-hidden rounded-lg bg-white ring-1 ring-slate-100 md:grid-cols-4 md:divide-x md:divide-slate-100">
            <div className="p-5">
              <p className="text-sm font-semibold text-slate-700">区间总金额（人民币）</p>
              <p className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{formatCny(summary.total)}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <span>≈ {formatUsd(summary.total / exchangeRate)}</span>
                <RefreshCw className="size-3.5" />
                <span>
                  1 USD = {exchangeRate.toFixed(2)} CNY · 1 AUD = {audExchangeRate.toFixed(2)} CNY · 1 TWD = {twdExchangeRate.toFixed(2)} CNY
                </span>
              </p>
            </div>
            <div className="border-t border-slate-100 p-5 md:border-t-0">
              <p className="text-sm font-semibold text-slate-700">已报销</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-emerald-700">{formatCny(summary.reported)}</p>
              <p className="mt-3 text-sm text-slate-500">{summary.reportedRatio.toFixed(1)}%</p>
            </div>
            <div className="border-t border-slate-100 p-5 md:border-t-0">
              <p className="text-sm font-semibold text-slate-700">未报销</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-orange-600">{formatCny(summary.unreported)}</p>
              <p className="mt-3 text-sm text-slate-500">{summary.unreportedRatio.toFixed(1)}%</p>
            </div>
            <div className="border-t border-slate-100 p-5 md:border-t-0">
              <p className="text-sm font-semibold text-slate-700">消费笔数</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">{summary.count}</p>
              <p className="mt-3 text-sm text-slate-500">分类 {summary.categories} 个</p>
            </div>
          </section>

          <section className="no-print print-break-avoid mt-6 grid gap-4 lg:grid-cols-[0.42fr_0.58fr]">
            <div
              ref={uploadAreaRef}
              role="button"
              tabIndex={0}
              aria-label="上传消费截图或 PDF"
              aria-disabled={isLoadingBill || isAnalyzing}
              onClick={handleUploadClick}
              onKeyDown={handleUploadKeyDown}
              onDragOver={handleUploadDragOver}
              onDragLeave={handleUploadDragLeave}
              onDrop={handleUploadDrop}
              onPaste={handleUploadPaste}
              className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center outline-none transition ${
                isUploadDragging
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
              } ${
                isLoadingBill || isAnalyzing ? "cursor-not-allowed opacity-70" : "focus:ring-4 focus:ring-blue-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                accept="image/*,.pdf"
                multiple
                disabled={isLoadingBill || isAnalyzing}
                onChange={handleFiles}
              />
              <CloudUpload className="size-9 text-slate-400" />
              <span className="mt-4 text-sm font-semibold text-slate-800">上传消费截图 / PDF</span>
              <span className="mt-2 text-xs text-slate-500">支持 JPG、PNG、PDF 格式</span>
              <span className="mt-4 text-sm font-medium text-blue-600">
                {isUploadDragging ? "松开后开始识别" : "点击、拖拽或粘贴截图"}
              </span>
            </div>

            <div className="grid min-h-40 rounded-lg bg-white p-5 ring-1 ring-slate-100 sm:grid-cols-[1fr_0.54fr]">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-950">智能识别与分析</h2>
                </div>
                <AnalysisProgress isAnalyzing={isAnalyzing} hasUpload={Boolean(lastUpload)} />
                <div className="mt-4 min-h-6 text-sm">
                  {isAnalyzing ? (
                    <span className="inline-flex items-center gap-2 font-medium text-blue-700">
                      <BrainCircuit className="size-4 animate-pulse" />
                      AI 正在整理表格
                    </span>
                  ) : lastUpload ? (
                    <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
                      <BadgeCheck className="size-4" />
                      {lastUpload.name} 已生成 {lastUpload.count} 条，置信度 {lastUpload.confidence}%
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-center gap-5 sm:mt-0">
                <div className="h-24 w-20 rounded-lg border border-slate-100 bg-white p-3">
                  <div className="h-2 w-8 rounded-full bg-slate-200" />
                  <div className="mt-3 space-y-2">
                    <div className="h-1.5 rounded-full bg-slate-200" />
                    <div className="h-1.5 rounded-full bg-slate-200" />
                    <div className="h-1.5 w-10 rounded-full bg-slate-200" />
                  </div>
                </div>
                <ArrowRight className="size-7 text-slate-300" />
                <div className="relative h-24 w-32 rounded-lg border border-slate-100 bg-white">
                  <div className="grid h-full grid-cols-3 grid-rows-5 overflow-hidden rounded-lg text-[0]">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <span key={index} className="border-b border-r border-slate-100 bg-white" />
                    ))}
                  </div>
                  <span className="absolute bottom-3 right-3 flex size-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                    <Check className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-7">
            <div className="no-print flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-6">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
                    statusFilter === "all"
                      ? "border-blue-600 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <FileText className="size-4" />
                  全部
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rangeExpenses.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("reported")}
                  className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
                    statusFilter === "reported"
                      ? "border-blue-600 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <BadgeCheck className="size-4" />
                  已报销
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {rangeExpenses.filter((expense) => expense.status === "reported").length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("unreported")}
                  className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition ${
                    statusFilter === "unreported"
                      ? "border-blue-600 text-slate-950"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Building2 className="size-4" />
                  未报销
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {rangeExpenses.filter((expense) => expense.status === "unreported").length}
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索商家、备注"
                    className="h-9 w-48 rounded-md bg-white pl-9 pr-3 text-sm text-slate-700 shadow-sm outline-none ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:ring-4 focus:ring-blue-50"
                  />
                </div>
                <button className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <SlidersHorizontal className="size-4" />
                  筛选
                </button>
                <button className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <ArrowDownUp className="size-4" />
                  排序
                </button>
                <button className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
                  <Columns3 className="size-4" />
                  自定义列
                </button>
                <button
                  type="button"
                  onClick={settleUnreportedExpenses}
                  disabled={unreportedRangeExpenseCount === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                >
                  <BadgeCheck className="size-4" />
                  一键结清未报销
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs">{unreportedRangeExpenseCount} 条</span>
                </button>
              </div>
            </div>

            {selectedExpenseIds.size > 0 ? (
              <div className="no-print mt-3 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm font-semibold text-blue-900">
                  <SquareCheckBig className="size-4 text-blue-600" />
                  已选择 {selectedExpenseIds.size} 条
                  <span className="hidden text-xs font-medium text-blue-500 sm:inline">Shift 点击可连续选择</span>
                  {selectedExpenseIds.size < filteredExpenses.length ? (
                    <button
                      type="button"
                      onClick={toggleAllFilteredExpenses}
                      className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline"
                    >
                      选择当前筛选的全部 {filteredExpenses.length} 条
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearExpenseSelection}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-white"
                  >
                    <X className="size-3.5" />
                    取消选择
                  </button>
                  <BatchStatusSelect onChange={updateSelectedExpensesStatus} />
                  <button
                    type="button"
                    onClick={() => setPendingDeleteIds([...selectedExpenseIds])}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
                  >
                    <Trash2 className="size-3.5" />
                    删除 {selectedExpenseIds.size} 条
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-slate-100">
              {filteredExpenses.length === 0 ? (
                <EmptyState
                  hasRangeExpenses={rangeExpenses.length > 0}
                  onResetRange={() => setDateRange(getMonthDateRange(currentMonth))}
                  onClearFilters={() => {
                    setStatusFilter("all");
                    setQuery("");
                  }}
                />
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[1512px] table-fixed border-collapse text-left text-sm">
                    <colgroup>
                      <col className="w-[52px]" />
                      <col className="w-[130px]" />
                      <col className="w-[250px]" />
                      <col className="w-[140px]" />
                      <col className="w-[170px]" />
                      <col className="w-[180px]" />
                      <col className="w-[150px]" />
                      <col className="w-[260px]" />
                      <col className="w-[180px]" />
                    </colgroup>
                    <thead className="bg-slate-50/90 text-xs font-semibold uppercase tracking-normal text-slate-500">
                      <tr>
                        <th className="px-2 py-2.5">
                          <SelectionButton
                            checked={allFilteredSelected}
                            mixed={someFilteredSelected}
                            label="全选当前筛选结果"
                            onToggle={toggleAllFilteredExpenses}
                          />
                        </th>
                        <th className="whitespace-nowrap px-4 py-3">日期</th>
                        <th className="whitespace-nowrap px-4 py-3">描述</th>
                        <th className="whitespace-nowrap px-4 py-3">类型</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">金额</th>
                        <th className="whitespace-nowrap px-4 py-3">商家</th>
                        <th className="whitespace-nowrap px-4 py-3">报销状态</th>
                        <th className="whitespace-nowrap px-4 py-3">来源 / 附件</th>
                        <th className="whitespace-nowrap px-4 py-3">备注</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {pagedExpenses.map((expense) => (
                        <tr
                          key={expense.id}
                          className={`transition ${
                            selectedExpenseIds.has(expense.id)
                              ? "bg-blue-50/70 hover:bg-blue-50"
                              : "hover:bg-slate-50/70"
                          }`}
                        >
                          <td className="px-2 py-2.5">
                            <SelectionButton
                              checked={selectedExpenseIds.has(expense.id)}
                              label={`选择 ${expense.date.replaceAll("-", "/")} ${expense.merchant} ${expense.description}`}
                              onToggle={(shiftKey) => toggleExpenseSelection(expense.id, shiftKey)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">{expense.date.replaceAll("-", "/")}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate">{expense.description}</span>
                              {expense.recurring ? (
                                <span title="固定月度花费" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                                  <Repeat2 className="size-3" />
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <CategorySelect
                              category={expense.category}
                              onChange={(category) => updateExpense(expense.id, { category })}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <AmountCell
                              expense={expense}
                              onAmountChange={(originalAmount) => updateExpense(expense.id, { originalAmount })}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="block truncate">{expense.merchant}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <StatusSelect
                              status={expense.status}
                              onChange={(status) => updateExpense(expense.id, { status })}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <SourceCell
                              expense={expense}
                              onPreview={(attachment, expenseId) =>
                                setPreviewTarget({ attachment, expenseId })
                              }
                              onAddAttachments={(expenseId, files) =>
                                void handleAddAttachments(expenseId, files)
                              }
                              isUploading={uploadingAttachmentExpenseId === expense.id}
                              isUploadDisabled={Boolean(uploadingAttachmentExpenseId)}
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            <span className="block truncate">{expense.note}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  共 {filteredExpenses.length} 条记录
                  {filteredExpenses.length > 0 ? ` · 第 ${currentPage}/${totalPages} 页` : ""}
                </span>
                <div className="no-print flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                    aria-label="上一页"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  {visiblePageNumbers.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`flex size-8 items-center justify-center rounded-md text-sm transition ${
                        page === currentPage
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "font-medium text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex size-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                    aria-label="下一页"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="print-break-avoid mt-6 grid overflow-hidden rounded-lg bg-white ring-1 ring-slate-100 lg:grid-cols-[0.35fr_0.65fr]">
            <div className="p-5">
              <div className="flex items-center gap-2">
                <RefreshCw className="size-5 text-blue-600" />
                <h2 className="text-base font-semibold text-slate-950">结转规则</h2>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-slate-400" />
                  未报销消费可手动结转到下个月
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-slate-400" />
                  月度固定消费结转时保留原日号
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-blue-500" />
                  结转按当前整月计算，不受上方日期范围筛选影响
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-4 border-t border-slate-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between lg:border-l lg:border-t-0">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 text-blue-600" />
                <div>
                  <h2 className="text-base font-semibold text-slate-950">下月预览（{getMonthLabel(addMonths(currentMonth, 1))}）</h2>
                  <p className="mt-2 text-sm text-slate-500">预计转入金额（未报销 + 固定消费）</p>
                  <div className="mt-4 flex flex-wrap gap-8">
                    <div>
                      <p className="text-2xl font-semibold tracking-normal text-slate-950">{formatCny(nextMonthPreview.total)}</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tracking-normal text-slate-950">{nextMonthPreview.count} 笔</p>
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={rollToNextMonth}
                disabled={nextMonthPreview.count === 0}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <ChevronRight className="size-4" />
                结转到下月
              </button>
            </div>
          </section>

          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="no-print mt-4 min-h-5 text-right text-sm font-medium text-slate-500"
          >
            {exportNotice}
          </p>
        </div>
      </section>
      <div
        aria-hidden="true"
        ref={pdfReportRef}
        style={{
          backgroundColor: "#ffffff",
          color: "#111827",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          left: "-12000px",
          position: "fixed",
          top: 0,
          zIndex: -1,
        }}
      >
        <ExportPdfReport
          currentMonth={currentMonth}
          dateRange={dateRange}
          expenses={filteredExpenses}
          filterLabel={filterLabel}
          summary={filteredSummary}
        />
      </div>
      <AttachmentPreview
        attachment={previewAttachment}
        isReanalyzing={Boolean(
          previewAttachment && repairingAttachmentId === previewAttachment.id,
        )}
        canReanalyze={Boolean(
          previewAttachment &&
            canPreviewAttachment(previewAttachment) &&
            expenses.some(
              (expense) =>
                expense.id === previewTarget?.expenseId &&
                expense.attachment?.id === previewAttachment.id,
            ),
        )}
        onClose={() => setPreviewTarget(null)}
        onReanalyze={(attachment) => {
          if (previewTarget) {
            void handleReanalyzeAttachment(attachment, previewTarget.expenseId);
          }
        }}
      />
      <DeleteExpensesDialog
        count={pendingDeleteIds.length}
        onCancel={() => setPendingDeleteIds([])}
        onConfirm={confirmDeleteExpenses}
      />
    </main>
  );
}

export default App;
