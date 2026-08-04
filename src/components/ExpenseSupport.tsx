import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ReceiptText, Square, SquareCheckBig, SquareMinus, Trash2 } from "lucide-react";
import { DateRange, Expense, ExportSummary, amountInCny, audExchangeRate, exchangeRate, formatCny, formatOriginalAmountNote, getDateRangeLabel, getExpenseAttachments, getMonthLabel, twdExchangeRate } from "../expense-domain";
import { useModalFocus } from "./ExpenseAttachments";

export function SelectionButton({
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

export function DeleteExpensesDialog({
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

export function EmptyState({
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
        {hasRangeExpenses ? "没有符合搜索条件的记录" : "这里暂时没有消费记录"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {hasRangeExpenses ? "可以清除搜索条件后重试" : "上传新的消费票据，或切换另一个报销状态"}
      </p>
      <button
        type="button"
        onClick={hasRangeExpenses ? onClearFilters : onResetRange}
        className="no-print mt-4 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
      >
        {hasRangeExpenses ? "清除搜索" : "查看今天"}
      </button>
    </div>
  );
}

export function ExportPdfReport({
  currentMonth,
  dateRange,
  scopeLabel,
  filterLabel,
  expenses,
  summary,
}: {
  currentMonth: Date;
  dateRange: DateRange;
  scopeLabel?: string;
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
            {scopeLabel ?? `${getMonthLabel(currentMonth)} · ${getDateRangeLabel(dateRange)}`} · 当前筛选：{filterLabel}
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
