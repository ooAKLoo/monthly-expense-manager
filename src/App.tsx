import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Columns3,
  Copy,
  Download,
  FileText,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Search,
  SlidersHorizontal,
  SquareCheckBig,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";


import { AnalysisProgress, AmountCell, BatchStatusSelect, CategorySelect, DateRangePicker, StatusSelect } from "./components/ExpenseControls";
import { AttachmentPreview, SourceCell } from "./components/ExpenseAttachments";
import { DeleteExpensesDialog, EmptyState, ExportPdfReport, SelectionButton } from "./components/ExpenseSupport";
import {
  addMonths,
  audExchangeRate,
  canPreviewAttachment,
  exchangeRate,
  formatCny,
  formatUsd,
  getCarryoverOriginalDate,
  getMonthDateRange,
  getMonthLabel,
  isCarryoverExpense,
  normalizeDateRange,
  parseMonthDate,
  twdExchangeRate,
} from "./expense-domain";

import { useExpenseManager } from "./hooks/useExpenseManager";

function App() {
  const {
    billId,
    isLoadingBill,
    saveStatus,
    currentMonth,
    dateRange,
    setDateRange,
    expenses,
    statusFilter,
    setStatusFilter,
    query,
    setQuery,
    currentPage,
    setCurrentPage,
    isAnalyzing,
    isExportingPdf,
    isUploadDragging,
    lastUpload,
    exportNotice,
    previewTarget,
    setPreviewTarget,
    repairingAttachmentId,
    uploadingAttachmentExpenseId,
    selectedExpenseIds,
    pendingDeleteIds,
    setPendingDeleteIds,
    fileInputRef,
    uploadAreaRef,
    pdfReportRef,
    previewAttachment,
    rangeExpenses,
    filteredExpenses,
    unreportedRangeExpenseCount,
    totalPages,
    visiblePageNumbers,
    pagedExpenses,
    allFilteredSelected,
    someFilteredSelected,
    summary,
    filterLabel,
    filteredSummary,
    nextMonthPreview,
    earlierUnreported,
    handleFiles,
    handleUploadClick,
    handleUploadKeyDown,
    handleUploadDragOver,
    handleUploadDragLeave,
    handleUploadDrop,
    handleUploadPaste,
    handleAddAttachments,
    handleReanalyzeAttachment,
    handleExportPdf,
    updateExpense,
    showMonth,
    showToday,
    toggleExpenseSelection,
    toggleAllFilteredExpenses,
    clearExpenseSelection,
    updateSelectedExpensesStatus,
    settleUnreportedExpenses,
    confirmDeleteExpenses,
    rollToNextMonth,
    copyShareLink,
  } = useExpenseManager();

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
            {earlierUnreported.count > 0 ? (
              <div className="no-print mb-5 flex flex-col gap-3 border-l-2 border-amber-400 bg-amber-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">此前月份还有 {earlierUnreported.count} 笔未报销，尚未结转</p>
                    <p className="mt-1 text-xs text-slate-600">合计 {formatCny(earlierUnreported.total)}，最早来自 {earlierUnreported.earliestMonth.replace("-", "年")}月</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => showMonth(parseMonthDate(earlierUnreported.earliestMonth))}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-100"
                >
                  前往处理
                  <ArrowRight className="size-4" />
                </button>
              </div>
            ) : null}
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
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate">{expense.description}</span>
                                {isCarryoverExpense(expense) ? (
                                  <span className="inline-flex shrink-0 items-center rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                                    上月结转
                                  </span>
                                ) : null}
                                {expense.recurring ? (
                                  <span title="固定月度花费" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                                    <Repeat2 className="size-3" />
                                  </span>
                                ) : null}
                              </div>
                              {getCarryoverOriginalDate(expense) ? (
                                <span className="mt-1 block text-xs font-normal text-slate-500">
                                  原消费日期 {getCarryoverOriginalDate(expense).replaceAll("-", "/")}
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
                  <p className="mt-2 text-sm text-slate-500">
                    {nextMonthPreview.count > 0
                      ? `待转入：未报销 ${nextMonthPreview.unreportedCount} 笔 · 固定消费 ${nextMonthPreview.recurringCount} 笔`
                      : "当前月份已无待结转记录"}
                  </p>
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
                {nextMonthPreview.count > 0
                  ? `结转 ${nextMonthPreview.count} 笔到${addMonths(currentMonth, 1).getMonth() + 1}月`
                  : "已全部结转"}
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
