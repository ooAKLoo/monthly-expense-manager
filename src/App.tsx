import { ChangeEvent, ComponentType, SVGProps, useMemo, useRef, useState } from "react";
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
  Download,
  FileText,
  Home,
  Plane,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Utensils,
} from "lucide-react";

type Currency = "CNY" | "USD";
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
};

type UploadRecord = {
  name: string;
  count: number;
  confidence: number;
};

type ExportSummary = {
  total: number;
  reported: number;
  unreported: number;
  count: number;
};

const exchangeRate = 7.21;

const seedExpenses: Expense[] = [
  {
    id: "may-01",
    date: "2024-05-30",
    description: "Uber Ride",
    category: "交通",
    originalAmount: 18.45,
    currency: "USD",
    merchant: "Uber",
    status: "unreported",
    note: "去机场",
    source: "截图识别",
    confidence: 96,
  },
  {
    id: "may-02",
    date: "2024-05-29",
    description: "Starbucks Coffee",
    category: "餐饮",
    originalAmount: 5.65,
    currency: "USD",
    merchant: "Starbucks",
    status: "reported",
    note: "下午咖啡",
    source: "截图识别",
    confidence: 94,
  },
  {
    id: "may-03",
    date: "2024-05-28",
    description: "Amazon.com",
    category: "购物",
    originalAmount: 89.99,
    currency: "USD",
    merchant: "Amazon",
    status: "unreported",
    note: "办公用品",
    source: "PDF 导入",
    confidence: 91,
  },
  {
    id: "may-04",
    date: "2024-05-27",
    description: "Office Rent",
    category: "住房",
    originalAmount: 1200,
    currency: "USD",
    merchant: "WeWork",
    status: "reported",
    note: "5 月租金",
    source: "固定月度",
    recurring: true,
    confidence: 99,
  },
  {
    id: "may-05",
    date: "2024-05-26",
    description: "Metro Card",
    category: "交通",
    originalAmount: 33,
    currency: "USD",
    merchant: "MTA",
    status: "unreported",
    note: "地铁卡充值",
    source: "截图识别",
    confidence: 95,
  },
  {
    id: "may-06",
    date: "2024-05-24",
    description: "Client Dinner",
    category: "餐饮",
    originalAmount: 428,
    currency: "CNY",
    merchant: "璟记",
    status: "reported",
    note: "客户晚餐",
    source: "手动录入",
    confidence: 90,
  },
  {
    id: "may-07",
    date: "2024-05-23",
    description: "Adobe Creative Cloud",
    category: "订阅",
    originalAmount: 54.99,
    currency: "USD",
    merchant: "Adobe",
    status: "unreported",
    note: "设计软件",
    source: "固定月度",
    recurring: true,
    confidence: 98,
  },
  {
    id: "may-08",
    date: "2024-05-22",
    description: "Figma Team",
    category: "订阅",
    originalAmount: 30,
    currency: "USD",
    merchant: "Figma",
    status: "reported",
    note: "团队订阅",
    source: "固定月度",
    recurring: true,
    confidence: 99,
  },
  {
    id: "may-09",
    date: "2024-05-21",
    description: "Flight Change",
    category: "差旅",
    originalAmount: 86,
    currency: "USD",
    merchant: "Delta",
    status: "unreported",
    note: "改签费",
    source: "PDF 导入",
    confidence: 89,
  },
  {
    id: "may-10",
    date: "2024-05-20",
    description: "Hotel Deposit",
    category: "差旅",
    originalAmount: 320,
    currency: "CNY",
    merchant: "Hilton",
    status: "unreported",
    note: "押金",
    source: "截图识别",
    confidence: 87,
  },
  {
    id: "may-11",
    date: "2024-05-19",
    description: "Team Lunch",
    category: "餐饮",
    originalAmount: 218,
    currency: "CNY",
    merchant: "桂满陇",
    status: "reported",
    note: "团队午餐",
    source: "手动录入",
    confidence: 93,
  },
  {
    id: "may-12",
    date: "2024-05-18",
    description: "Keyboard",
    category: "办公",
    originalAmount: 699,
    currency: "CNY",
    merchant: "京东",
    status: "unreported",
    note: "办公设备",
    source: "截图识别",
    confidence: 92,
  },
  {
    id: "may-13",
    date: "2024-05-17",
    description: "ChatGPT Team",
    category: "订阅",
    originalAmount: 25,
    currency: "USD",
    merchant: "OpenAI",
    status: "reported",
    note: "AI 工具",
    source: "固定月度",
    recurring: true,
    confidence: 98,
  },
  {
    id: "may-14",
    date: "2024-05-16",
    description: "Taxi",
    category: "交通",
    originalAmount: 128,
    currency: "CNY",
    merchant: "滴滴",
    status: "unreported",
    note: "客户拜访",
    source: "截图识别",
    confidence: 94,
  },
  {
    id: "may-15",
    date: "2024-05-15",
    description: "Printing",
    category: "办公",
    originalAmount: 86,
    currency: "CNY",
    merchant: "FedEx Office",
    status: "reported",
    note: "合同打印",
    source: "手动录入",
    confidence: 88,
  },
  {
    id: "may-16",
    date: "2024-05-14",
    description: "Lunch Box",
    category: "餐饮",
    originalAmount: 46,
    currency: "CNY",
    merchant: "便利蜂",
    status: "unreported",
    note: "加班餐",
    source: "截图识别",
    confidence: 92,
  },
  {
    id: "may-17",
    date: "2024-05-13",
    description: "Notebook",
    category: "办公",
    originalAmount: 39,
    currency: "CNY",
    merchant: "MUJI",
    status: "reported",
    note: "会议记录",
    source: "手动录入",
    confidence: 90,
  },
  {
    id: "may-18",
    date: "2024-05-12",
    description: "Cloud Storage",
    category: "订阅",
    originalAmount: 9.99,
    currency: "USD",
    merchant: "Dropbox",
    status: "unreported",
    note: "云盘",
    source: "固定月度",
    recurring: true,
    confidence: 97,
  },
  {
    id: "may-19",
    date: "2024-05-11",
    description: "Business Meal",
    category: "餐饮",
    originalAmount: 312,
    currency: "CNY",
    merchant: "晶采轩",
    status: "reported",
    note: "商务餐",
    source: "截图识别",
    confidence: 93,
  },
  {
    id: "may-20",
    date: "2024-05-10",
    description: "Stationery",
    category: "办公",
    originalAmount: 64,
    currency: "CNY",
    merchant: "晨光",
    status: "unreported",
    note: "文具",
    source: "手动录入",
    confidence: 91,
  },
  {
    id: "may-21",
    date: "2024-05-09",
    description: "Airport Express",
    category: "交通",
    originalAmount: 25,
    currency: "CNY",
    merchant: "机场快线",
    status: "unreported",
    note: "差旅交通",
    source: "截图识别",
    confidence: 96,
  },
  {
    id: "may-22",
    date: "2024-05-08",
    description: "Office Snacks",
    category: "餐饮",
    originalAmount: 178,
    currency: "CNY",
    merchant: "盒马",
    status: "reported",
    note: "茶歇",
    source: "手动录入",
    confidence: 89,
  },
  {
    id: "may-23",
    date: "2024-05-07",
    description: "USB-C Hub",
    category: "办公",
    originalAmount: 42.5,
    currency: "USD",
    merchant: "Amazon",
    status: "unreported",
    note: "转接器",
    source: "PDF 导入",
    confidence: 90,
  },
  {
    id: "may-24",
    date: "2024-05-06",
    description: "Breakfast",
    category: "餐饮",
    originalAmount: 32,
    currency: "CNY",
    merchant: "Peet's",
    status: "reported",
    note: "早餐",
    source: "截图识别",
    confidence: 86,
  },
  {
    id: "may-25",
    date: "2024-05-05",
    description: "Parking",
    category: "交通",
    originalAmount: 58,
    currency: "CNY",
    merchant: "停车场",
    status: "unreported",
    note: "停车费",
    source: "手动录入",
    confidence: 88,
  },
  {
    id: "may-26",
    date: "2024-05-04",
    description: "Phone Bill",
    category: "办公",
    originalAmount: 128,
    currency: "CNY",
    merchant: "中国移动",
    status: "reported",
    note: "办公电话",
    source: "固定月度",
    recurring: true,
    confidence: 96,
  },
  {
    id: "may-27",
    date: "2024-05-03",
    description: "Train Ticket",
    category: "差旅",
    originalAmount: 286,
    currency: "CNY",
    merchant: "12306",
    status: "unreported",
    note: "高铁票",
    source: "截图识别",
    confidence: 97,
  },
  {
    id: "may-28",
    date: "2024-05-01",
    description: "Welcome Coffee",
    category: "餐饮",
    originalAmount: 27,
    currency: "CNY",
    merchant: "Manner",
    status: "reported",
    note: "会议咖啡",
    source: "手动录入",
    confidence: 85,
  },
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

const uploadSamples: Expense[] = [
  {
    id: "sample-uber",
    date: "2024-05-30",
    description: "Uber Receipt",
    category: "交通",
    originalAmount: 22.8,
    currency: "USD",
    merchant: "Uber",
    status: "unreported",
    note: "AI 分类",
    source: "AI 识别",
    confidence: 95,
  },
  {
    id: "sample-dinner",
    date: "2024-05-29",
    description: "Business Dinner",
    category: "餐饮",
    originalAmount: 468,
    currency: "CNY",
    merchant: "Restaurant",
    status: "unreported",
    note: "AI 分类",
    source: "AI 识别",
    confidence: 91,
  },
  {
    id: "sample-office",
    date: "2024-05-28",
    description: "Office Supplies",
    category: "办公",
    originalAmount: 76.4,
    currency: "USD",
    merchant: "Amazon",
    status: "unreported",
    note: "AI 分类",
    source: "AI 识别",
    confidence: 89,
  },
  {
    id: "sample-hotel",
    date: "2024-05-27",
    description: "Hotel",
    category: "差旅",
    originalAmount: 880,
    currency: "CNY",
    merchant: "Hotel",
    status: "reported",
    note: "AI 分类",
    source: "AI 识别",
    confidence: 88,
  },
];

function amountInCny(expense: Pick<Expense, "currency" | "originalAmount">) {
  return expense.currency === "USD"
    ? Number((expense.originalAmount * exchangeRate).toFixed(2))
    : expense.originalAmount;
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

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateInMonth(date: string, target: Date) {
  const day = Math.min(Number(date.slice(8, 10)), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getCategoryFromName(name: string): Category {
  const lower = name.toLowerCase();
  if (lower.includes("uber") || lower.includes("taxi") || lower.includes("metro") || lower.includes("train")) {
    return "交通";
  }
  if (lower.includes("coffee") || lower.includes("dinner") || lower.includes("lunch") || lower.includes("food")) {
    return "餐饮";
  }
  if (lower.includes("rent") || lower.includes("office-rent")) {
    return "住房";
  }
  if (lower.includes("flight") || lower.includes("hotel")) {
    return "差旅";
  }
  if (lower.includes("subscription") || lower.includes("figma") || lower.includes("adobe")) {
    return "订阅";
  }
  if (lower.includes("amazon") || lower.includes("shop")) {
    return "购物";
  }
  return "办公";
}

function analyzeFiles(files: File[], currentMonth: Date): Expense[] {
  const baseDay = Math.min(28, new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate());

  return files.flatMap((file, fileIndex) => {
    const category = getCategoryFromName(file.name);
    const sample = uploadSamples.find((item) => item.category === category) ?? uploadSamples[fileIndex % uploadSamples.length];
    const count = file.type === "application/pdf" ? 3 : 2;

    return Array.from({ length: count }, (_, index) => {
      const day = Math.max(1, baseDay - fileIndex * 2 - index);
      const currency: Currency = index === 0 && category !== "餐饮" ? "USD" : "CNY";
      const amount = currency === "USD" ? Number((sample.originalAmount + index * 7.6).toFixed(2)) : Math.round(amountInCny(sample) * (0.72 + index * 0.18));

      return {
        ...sample,
        id: `upload-${Date.now()}-${fileIndex}-${index}`,
        date: `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        category,
        currency,
        originalAmount: amount,
        description: index === 0 ? sample.description : `${sample.description} ${index + 1}`,
        merchant: sample.merchant,
        status: index % 3 === 2 ? "reported" : "unreported",
        source: "AI 识别",
        note: file.name.replace(/\.[^/.]+$/, "").slice(0, 18) || "上传票据",
        confidence: Math.max(82, (sample.confidence ?? 90) - index * 3),
      };
    });
  });
}

function IconBadge({ category }: { category: Category }) {
  const meta = categoryMeta[category];
  const Icon = meta.Icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${meta.className}`}>
      <Icon className="size-3.5" />
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "reported") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
        <Check className="size-3" />
        已报销
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 ring-1 ring-orange-100">
      <ReceiptText className="size-3" />
      未报销
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
      <ReceiptText className="mb-3 size-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-700">当前月份暂无消费记录</p>
      <p className="mt-1 text-xs text-slate-500">上传票据或切回 2024 年 5 月查看示例数据</p>
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
          <div>汇率：1 USD = {exchangeRate.toFixed(2)} CNY</div>
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
            {["日期", "描述", "类型", "金额 USD", "金额 CNY", "商家", "报销状态", "备注", "来源"].map((head) => (
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
              <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                {expense.currency === "USD" ? formatUsd(expense.originalAmount) : "-"}
              </td>
              <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>
                {formatCny(amountInCny(expense))}
              </td>
              <td style={cellStyle}>{expense.merchant}</td>
              <td style={cellStyle}>{expense.status === "reported" ? "已报销" : "未报销"}</td>
              <td style={cellStyle}>{expense.note}</td>
              <td style={cellStyle}>{expense.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date(2024, 4, 1));
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [lastUpload, setLastUpload] = useState<UploadRecord | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfReportRef = useRef<HTMLDivElement>(null);

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
        [expense.description, expense.merchant, expense.note, expense.category, expense.source]
          .join(" ")
          .toLowerCase()
          .includes(normalized);

      return matchesStatus && matchesQuery;
    });
  }, [monthExpenses, query, statusFilter]);

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

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsAnalyzing(true);
    setExportNotice("");

    window.setTimeout(() => {
      const generated = analyzeFiles(files, currentMonth);
      setExpenses((previous) => [...generated, ...previous]);
      setLastUpload({
        name: files.length === 1 ? files[0].name : `${files.length} 个文件`,
        count: generated.length,
        confidence: Math.round(
          generated.reduce((sum, item) => sum + (item.confidence ?? 88), 0) / generated.length,
        ),
      });
      setIsAnalyzing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 820);
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

  const markAsReported = (id: string) => {
    setExpenses((previous) =>
      previous.map((expense) => (expense.id === id ? { ...expense, status: "reported" } : expense)),
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

  return (
    <main className="min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="print-shell mx-auto max-w-7xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_70px_rgba(15,23,42,0.08)]">
        <header className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white">
              <ReceiptText className="size-5 text-slate-700" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-normal text-slate-950">月度消费管理</h1>
              <p className="mt-0.5 text-xs text-slate-500">消费、报销、下月结转</p>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
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
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="inline-flex items-center gap-2 rounded-md text-3xl font-semibold tracking-normal text-slate-950"
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
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <ArrowLeft className="size-4" />
                上个月
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                下个月
                <ArrowRight className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                今天
              </button>
            </div>
          </div>

          <section className="print-break-avoid mt-6 grid overflow-hidden rounded-lg border border-slate-200 bg-white md:grid-cols-4">
            <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-slate-700">当月总金额（人民币）</p>
              <p className="mt-4 text-4xl font-semibold tracking-normal text-slate-950">{formatCny(summary.total)}</p>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <span>≈ {formatUsd(summary.total / exchangeRate)}</span>
                <RefreshCw className="size-3.5" />
                <span>1 USD = {exchangeRate.toFixed(2)} CNY</span>
              </p>
            </div>
            <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-slate-700">已报销</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-emerald-700">{formatCny(summary.reported)}</p>
              <p className="mt-3 text-sm text-slate-500">{summary.reportedRatio.toFixed(1)}%</p>
            </div>
            <div className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-slate-700">未报销</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-orange-600">{formatCny(summary.unreported)}</p>
              <p className="mt-3 text-sm text-slate-500">{summary.unreportedRatio.toFixed(1)}%</p>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-slate-700">消费笔数</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-slate-950">{summary.count}</p>
              <p className="mt-3 text-sm text-slate-500">分类 {summary.categories} 个</p>
            </div>
          </section>

          <section className="no-print print-break-avoid mt-6 grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center transition hover:border-blue-300 hover:bg-blue-50/40">
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept="image/*,.pdf"
                multiple
                onChange={handleFiles}
              />
              <CloudUpload className="size-9 text-slate-400" />
              <span className="mt-4 text-sm font-semibold text-slate-800">上传消费截图 / PDF</span>
              <span className="mt-2 text-xs text-slate-500">支持 JPG、PNG、PDF 格式</span>
              <span className="mt-4 text-sm font-medium text-blue-600">点击上传或拖拽到此处</span>
            </label>

            <div className="grid min-h-40 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_0.54fr]">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-5 text-blue-600" />
                  <h2 className="text-base font-semibold text-slate-950">智能识别与分析</h2>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-blue-600" />
                    自动识别截图中的消费信息
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-blue-600" />
                    智能分类消费类型
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-blue-600" />
                    美元金额自动换算人民币
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-blue-600" />
                    未报销项目自动迁移到下个月
                  </li>
                </ul>
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
                <div className="h-24 w-20 rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm">
                  <div className="h-2 w-8 rounded-full bg-slate-200" />
                  <div className="mt-3 space-y-2">
                    <div className="h-1.5 rounded-full bg-slate-200" />
                    <div className="h-1.5 rounded-full bg-slate-200" />
                    <div className="h-1.5 w-10 rounded-full bg-slate-200" />
                  </div>
                </div>
                <ArrowRight className="size-7 text-slate-300" />
                <div className="relative h-24 w-32 rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
                  <div className="grid h-full grid-cols-3 grid-rows-5 overflow-hidden rounded-lg text-[0]">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <span key={index} className="border-b border-r border-slate-200 bg-white/70" />
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
                    className="h-9 w-48 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-50"
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

            <div className="overflow-hidden rounded-lg border border-slate-200">
              {filteredExpenses.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
                      <tr>
                        <th className="border-b border-slate-200 px-4 py-3">日期</th>
                        <th className="border-b border-slate-200 px-4 py-3">描述</th>
                        <th className="border-b border-slate-200 px-4 py-3">类型</th>
                        <th className="border-b border-slate-200 px-4 py-3 text-right">金额（USD）</th>
                        <th className="border-b border-slate-200 px-4 py-3 text-right">金额（CNY）</th>
                        <th className="border-b border-slate-200 px-4 py-3">商家</th>
                        <th className="border-b border-slate-200 px-4 py-3">报销状态</th>
                        <th className="border-b border-slate-200 px-4 py-3">备注</th>
                        <th className="border-b border-slate-200 px-4 py-3">来源</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                      {filteredExpenses.map((expense) => (
                        <tr key={expense.id} className="transition hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-600">{expense.date.replaceAll("-", "/")}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <div className="flex items-center gap-2">
                              <span>{expense.description}</span>
                              {expense.recurring ? (
                                <span title="固定月度花费" className="inline-flex size-5 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                                  <Repeat2 className="size-3" />
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <IconBadge category={expense.category} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                            {expense.currency === "USD" ? formatUsd(expense.originalAmount) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-800">
                            {formatCny(amountInCny(expense))}
                          </td>
                          <td className="px-4 py-3">{expense.merchant}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={expense.status} />
                              {expense.status === "unreported" ? (
                                <button
                                  type="button"
                                  onClick={() => markAsReported(expense.id)}
                                  className="no-print rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                >
                                  标记
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{expense.note}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              {expense.source === "AI 识别" ? <BrainCircuit className="size-3.5 text-blue-600" /> : null}
                              {expense.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>共 {filteredExpenses.length} 条记录</span>
                <div className="no-print flex items-center gap-2">
                  <button className="flex size-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100">
                    <ArrowLeft className="size-4" />
                  </button>
                  <button className="flex size-8 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700">1</button>
                  <button className="flex size-8 items-center justify-center rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">2</button>
                  <button className="flex size-8 items-center justify-center rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100">3</button>
                  <button className="flex size-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="print-break-avoid mt-6 grid overflow-hidden rounded-lg border border-slate-200 bg-white lg:grid-cols-[0.35fr_0.65fr]">
            <div className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
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
              className="group flex flex-col gap-4 p-5 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
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
    </main>
  );
}

export default App;
