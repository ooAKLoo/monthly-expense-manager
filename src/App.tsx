import {
  ChangeEvent,
  ClipboardEvent,
  ComponentType,
  DragEvent,
  KeyboardEvent,
  SVGProps,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
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
  Home,
  Image as ImageIcon,
  Plane,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  X,
} from "lucide-react";

type Currency = "CNY" | "USD" | "TWD";
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
  };
};

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

type Bill = {
  id: string;
  currentMonth: string;
  expenses: Expense[];
};

type ExportSummary = {
  total: number;
  reported: number;
  unreported: number;
  count: number;
};

const exchangeRate = 7.21;
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

function formatOriginalAmount(expense: Pick<Expense, "currency" | "originalAmount">) {
  if (expense.currency === "USD") {
    return formatUsd(expense.originalAmount);
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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function expenseMonthKey(date: string) {
  return date.slice(0, 7);
}

function getMonthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function getDateRangeLabel(date: Date) {
  const start = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/01`;
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const end = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${endDate}`;
  return `${start} - ${end}`;
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
  const match = value.match(/^(\d{4})-(\d{2})$/);
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

function isImageAttachment(attachment: Attachment) {
  return attachment.mimeType.startsWith("image/");
}

async function loadBill(billId: string): Promise<Bill> {
  const response = await fetch(apiUrl(`bills/${billId}`));
  const payload = (await response.json().catch(() => ({}))) as { bill?: Partial<Bill>; error?: string };
  if (!response.ok || !payload.bill) {
    throw new Error(payload.error ?? "账单加载失败");
  }

  return {
    id: billId,
    currentMonth: typeof payload.bill.currentMonth === "string" ? payload.bill.currentMonth : monthKey(currentMonthDate()),
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

async function analyzeUploadedFiles(files: File[], currentMonth: Date, billId: string) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("month", monthKey(currentMonth));
  formData.append("exchangeRate", String(exchangeRate));

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
    modelName: payload.models?.vision ?? payload.models?.multimodal ?? payload.models?.llm ?? "AI 模型",
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

function normalizeCategory(value: unknown): Category {
  return categories.includes(value as Category) ? (value as Category) : "办公";
}

function normalizeCurrency(value: unknown): Currency {
  if (value === "USD" || value === "TWD") {
    return value;
  }
  return "CNY";
}

function normalizeAmount(value: unknown) {
  const amount = Number(value);
  const absoluteAmount = Math.abs(amount);
  return Number.isFinite(absoluteAmount) && absoluteAmount > 0 ? Number(absoluteAmount.toFixed(2)) : 0;
}

function CategorySelect({
  category,
  onChange,
}: {
  category: Category;
  onChange: (category: Category) => void;
}) {
  const meta = categoryMeta[category];
  const Icon = meta.Icon;

  return (
    <label
      className={`relative inline-flex whitespace-nowrap items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ring-1 ${meta.className}`}
    >
      <Icon className="size-3.5" />
      <select
        value={category}
        onChange={(event) => onChange(event.target.value as Category)}
        className="cursor-pointer appearance-none bg-transparent pr-4 font-medium outline-none"
        aria-label="修改消费类型"
      >
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-current opacity-60" />
    </label>
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
  const StatusIcon = isReported ? Check : ReceiptText;
  const className = isReported
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : "bg-orange-50 text-orange-700 ring-orange-100";

  return (
    <label
      className={`relative inline-flex whitespace-nowrap items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ${className}`}
    >
      <StatusIcon className="size-3" />
      <select
        value={status}
        onChange={(event) => onChange(event.target.value as Status)}
        className="cursor-pointer appearance-none bg-transparent pr-4 font-medium outline-none"
        aria-label="修改报销状态"
      >
        {statuses.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 size-3 text-current opacity-60" />
    </label>
  );
}

function AmountCell({ expense }: { expense: Expense }) {
  const originalNote = formatOriginalAmountNote(expense);

  return (
    <div className="text-right">
      <p className="font-semibold text-slate-800">{formatCny(amountInCny(expense))}</p>
      {originalNote ? <p className="mt-1 text-xs font-medium text-slate-400">{originalNote}</p> : null}
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

function SourceCell({
  expense,
  onPreview,
}: {
  expense: Expense;
  onPreview: (attachment: Attachment) => void;
}) {
  if (!expense.attachment) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500">
        {expense.source === "AI 识别" ? <BrainCircuit className="size-3.5 text-blue-600" /> : null}
        {expense.source}
      </span>
    );
  }

  const attachment = expense.attachment;
  const image = isImageAttachment(attachment);
  return (
    <button
      type="button"
      onClick={() => onPreview(attachment)}
      className="no-print inline-flex w-64 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      title={attachment.name}
    >
      {image ? (
        <img
          src={attachmentUrl(attachment)}
          alt=""
          className="size-8 rounded border border-slate-200 object-cover"
        />
      ) : (
        <span className="flex size-8 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500">
          <FileText className="size-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate">{attachment.name}</span>
        <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
          {image ? "查看大图" : "查看 PDF"}
        </span>
      </span>
    </button>
  );
}

function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  if (!attachment) {
    return null;
  }

  const image = isImageAttachment(attachment);
  const url = attachmentUrl(attachment);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {image ? <ImageIcon className="size-4 text-blue-600" /> : <FileText className="size-4 text-slate-500" />}
            <p className="truncate text-sm font-semibold text-slate-800">{attachment.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="关闭预览"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-96 flex-1 items-center justify-center bg-slate-100 p-4">
          {image ? (
            <img
              src={url}
              alt={attachment.name}
              className="max-h-[78vh] max-w-full rounded-md object-contain shadow-sm"
            />
          ) : (
            <iframe title={attachment.name} src={url} className="h-[78vh] w-full rounded-md bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center bg-white text-center">
      <ReceiptText className="mb-3 size-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">当前月份暂无消费记录</p>
      <p className="mt-1 text-xs text-slate-500">上传消费截图或 PDF 后会自动生成表格</p>
    </div>
  );
}

function ExportPdfReport({
  currentMonth,
  filterLabel,
  expenses,
  summary,
}: {
  currentMonth: Date;
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
          <div style={{ fontSize: 24, fontWeight: 700 }}>月度消费明细</div>
          <div style={{ marginTop: 8, color: "#64748b", fontSize: 14 }}>
            {getMonthLabel(currentMonth)} · {getDateRangeLabel(currentMonth)} · 当前筛选：{filterLabel}
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 13, textAlign: "right" }}>
          <div>汇率：1 USD = {exchangeRate.toFixed(2)} CNY · 1 TWD = {twdExchangeRate.toFixed(2)} CNY</div>
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
            {["日期", "描述", "类型", "金额", "商家", "报销状态", "备注", "来源"].map((head) => (
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
              <td style={cellStyle}>{expense.note}</td>
              <td style={cellStyle}>{expense.attachment?.name ?? expense.source}</td>
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
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isUploadDragging, setIsUploadDragging] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadRecord | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);
  const pdfReportRef = useRef<HTMLDivElement>(null);
  const loadedBillRef = useRef(false);

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

        setCurrentMonth(parseMonthDate(bill.currentMonth));
        setExpenses(bill.expenses);
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
      saveBill({
        id: billId,
        currentMonth: monthKey(currentMonth),
        expenses,
      })
        .then(() => setSaveStatus("已保存"))
        .catch((error) => setSaveStatus(error instanceof Error ? error.message : "保存失败"));
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [billId, currentMonth, expenses, isLoadingBill]);

  const currentKey = monthKey(currentMonth);
  const monthExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expenseMonthKey(expense.date) === currentKey)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, currentKey],
  );

  const filteredExpenses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return monthExpenses.filter((expense) => {
      const matchesStatus = statusFilter === "all" || expense.status === statusFilter;
      const matchesQuery =
        normalized.length === 0 ||
        [expense.description, expense.merchant, expense.note, expense.category, expense.source, expense.attachment?.name]
          .join(" ")
          .toLowerCase()
          .includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [monthExpenses, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const visiblePageNumbers = useMemo(
    () => getVisiblePageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const pagedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredExpenses.slice(start, start + pageSize);
  }, [currentPage, filteredExpenses]);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentKey, query, statusFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const summary = useMemo(() => {
    const total = monthExpenses.reduce((sum, expense) => sum + amountInCny(expense), 0);
    const reported = monthExpenses
      .filter((expense) => expense.status === "reported")
      .reduce((sum, expense) => sum + amountInCny(expense), 0);
    const unreported = total - reported;
    const categories = new Set(monthExpenses.map((expense) => expense.category)).size;

    return {
      total,
      reported,
      unreported,
      count: monthExpenses.length,
      categories,
      reportedRatio: total ? (reported / total) * 100 : 0,
      unreportedRatio: total ? (unreported / total) * 100 : 0,
    };
  }, [monthExpenses]);

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

      const result = await analyzeUploadedFiles(files, currentMonth, billId);
      const generated = result.expenses;
      setExpenses((previous) => [...generated, ...previous]);
      setLastUpload({
        name: files.length === 1 ? files[0].name : `${files.length} 个文件`,
        count: generated.length,
        confidence: Math.round(
          generated.reduce((sum, item) => sum + (item.confidence ?? 88), 0) / generated.length,
        ),
      });
      setExportNotice(
        result.warnings.length > 0
          ? `模型识别完成（${result.modelName}），部分文件提示：${result.warnings.join("；")}`
          : `模型识别完成（${result.modelName}）`,
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

      const filename = `月度消费-${currentKey}-${sanitizeFilenamePart(filterLabel)}-${getDownloadStamp()}.pdf`;
      pdf.save(filename);
      setExportNotice(`已下载 ${filename}`);
    } catch (error) {
      console.error(error);
      setExportNotice("PDF 生成失败，请稍后重试");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const updateExpense = (id: string, changes: Partial<Pick<Expense, "category" | "status">>) => {
    setExpenses((previous) =>
      previous.map((expense) => (expense.id === id ? { ...expense, ...changes } : expense)),
    );
  };

  const rollToNextMonth = () => {
    const target = addMonths(currentMonth, 1);
    const targetKey = monthKey(target);
    const existingIds = new Set(expenses.map((expense) => expense.id));
    const movedItems = nextMonthPreview.items
      .map((expense) => {
        const id = `carry-${targetKey}-${expense.id}`;
        return {
          ...expense,
          id,
          date: dateInMonth(expense.date, target),
          description: expense.recurring ? expense.description : `${expense.description}（结转）`,
          status: "unreported" as Status,
          source: expense.recurring ? "固定月度" : "自动迁移",
          note: expense.recurring ? "下月固定花费" : "上月未报销",
        };
      })
      .filter((expense) => !existingIds.has(expense.id));

    if (movedItems.length > 0) {
      setExpenses((previous) => [...movedItems, ...previous]);
    }
    setCurrentMonth(target);
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
            <div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md text-xl font-semibold tracking-normal text-slate-950"
                aria-label="选择月份"
              >
                {getMonthLabel(currentMonth)}
                <ChevronDown className="mt-1 size-5 text-slate-500" />
              </button>
              <p className="mt-2 text-sm font-medium text-slate-500">{getDateRangeLabel(currentMonth)}</p>
            </div>
            <div className="no-print flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <ArrowLeft className="size-4" />
                上个月
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                下个月
                <ArrowRight className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                今天
              </button>
            </div>
          </div>

          <section className="print-break-avoid mt-6 grid overflow-hidden rounded-lg bg-white ring-1 ring-slate-100 md:grid-cols-4 md:divide-x md:divide-slate-100">
            <div className="p-5">
              <p className="text-sm font-semibold text-slate-700">当月总金额（人民币）</p>
              <p className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{formatCny(summary.total)}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <span>≈ {formatUsd(summary.total / exchangeRate)}</span>
                <RefreshCw className="size-3.5" />
                <span>1 USD = {exchangeRate.toFixed(2)} CNY · 1 TWD = {twdExchangeRate.toFixed(2)} CNY</span>
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
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{monthExpenses.length}</span>
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
                    {monthExpenses.filter((expense) => expense.status === "reported").length}
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
                    {monthExpenses.filter((expense) => expense.status === "unreported").length}
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
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-100">
              {filteredExpenses.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full min-w-[1460px] table-fixed border-collapse text-left text-sm">
                    <colgroup>
                      <col className="w-[130px]" />
                      <col className="w-[250px]" />
                      <col className="w-[140px]" />
                      <col className="w-[170px]" />
                      <col className="w-[180px]" />
                      <col className="w-[150px]" />
                      <col className="w-[180px]" />
                      <col className="w-[260px]" />
                    </colgroup>
                    <thead className="bg-slate-50/90 text-xs font-semibold uppercase tracking-normal text-slate-500">
                      <tr>
                        <th className="whitespace-nowrap px-4 py-3">日期</th>
                        <th className="whitespace-nowrap px-4 py-3">描述</th>
                        <th className="whitespace-nowrap px-4 py-3">类型</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">金额</th>
                        <th className="whitespace-nowrap px-4 py-3">商家</th>
                        <th className="whitespace-nowrap px-4 py-3">报销状态</th>
                        <th className="whitespace-nowrap px-4 py-3">备注</th>
                        <th className="whitespace-nowrap px-4 py-3">来源</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {pagedExpenses.map((expense) => (
                        <tr key={expense.id} className="transition hover:bg-slate-50/70">
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
                            <AmountCell expense={expense} />
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
                          <td className="px-4 py-3 text-slate-500">
                            <span className="block truncate">{expense.note}</span>
                          </td>
                          <td className="px-4 py-3">
                            <SourceCell expense={expense} onPreview={setPreviewAttachment} />
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
                <h2 className="text-base font-semibold text-slate-950">自动迁移规则</h2>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-500">
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-slate-400" />
                  未报销的消费将自动迁移到下个月
                </li>
                <li className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full bg-slate-400" />
                  月度固定消费将自动转入下个月
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={rollToNextMonth}
              className="group flex flex-col gap-4 border-t border-slate-100 bg-white p-5 text-left transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between lg:border-l lg:border-t-0"
            >
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
              <ChevronRight className="hidden size-6 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700 sm:block" />
            </button>
          </section>

          {exportNotice ? <p className="no-print mt-4 text-right text-sm font-medium text-slate-500">{exportNotice}</p> : null}
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
          expenses={filteredExpenses}
          filterLabel={filterLabel}
          summary={filteredSummary}
        />
      </div>
      <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </main>
  );
}

export default App;
