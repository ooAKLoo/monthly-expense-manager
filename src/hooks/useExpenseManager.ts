import { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Attachment, AttachmentPreviewTarget, Bill, DateRange, Expense, Status, UploadRecord,
  amountInCny, analyzeUploadedFiles, currentMonthDate,
  ensureBillIdInUrl, filesFromClipboard,
  getBrowserToday, getDownloadStamp, getExpenseAttachments, getFilterLabel,
  getMonthDateRange, getVisiblePageNumbers, isAcceptedUploadFile,
  isTextEditingTarget, loadBill, monthKey, normalizeDateRange, pageSize,
  parseMonthDate, reanalyzeStoredAttachment, sanitizeFilenamePart, saveBill, seedExpenses, statuses,
  simplifyCarryoverExpenses, uploadExpenseAttachments,
} from "../expense-domain";

export function useExpenseManager() {
  const [billId, setBillId] = useState("");
  const [isLoadingBill, setIsLoadingBill] = useState(true);
  const [saveStatus, setSaveStatus] = useState("正在连接账单");
  const [currentMonth, setCurrentMonth] = useState(currentMonthDate);
  const [dateRange, setDateRange] = useState<DateRange>(() => getMonthDateRange(currentMonthDate()));
  const [expenses, setExpenses] = useState<Expense[]>(seedExpenses);
  const [statusFilter, setStatusFilter] = useState<Status>("unreported");
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
        setExpenses(simplifyCarryoverExpenses(bill.expenses));
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
  const unreportedExpenses = useMemo(
    () =>
      expenses
        .filter((expense) => expense.status === "unreported")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses],
  );
  const reportedRangeExpenses = useMemo(
    () =>
      expenses
        .filter(
          (expense) =>
            expense.status === "reported" &&
            expense.date >= dateRange.start &&
            expense.date <= dateRange.end,
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [dateRange.end, dateRange.start, expenses],
  );
  const viewExpenses = statusFilter === "unreported" ? unreportedExpenses : reportedRangeExpenses;

  const filteredExpenses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return viewExpenses.filter((expense) => {
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

      return matchesQuery;
    });
  }, [query, viewExpenses]);

  const unreportedExpenseCount = unreportedExpenses.length;

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
    const total = viewExpenses.reduce((sum, expense) => sum + amountInCny(expense), 0);
    const reported = statusFilter === "reported" ? total : 0;
    const unreported = total - reported;
    const categories = new Set(viewExpenses.map((expense) => expense.category)).size;

    return {
      total,
      reported,
      unreported,
      count: viewExpenses.length,
      categories,
      reportedRatio: total ? (reported / total) * 100 : 0,
      unreportedRatio: total ? (unreported / total) * 100 : 0,
    };
  }, [statusFilter, viewExpenses]);

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
      const generated = result.expenses.map((expense) => ({
        ...expense,
        status: "unreported" as Status,
      }));
      setExpenses((previous) => [...generated, ...previous]);
      setStatusFilter("unreported");
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
          generated.length > 0 ? "已加入全部月份的未报销清单" : "",
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
                source: expense.source,
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

      const scope = statusFilter === "unreported" ? "全部月份" : `${dateRange.start}_至_${dateRange.end}`;
      const filename = `消费明细-${scope}-${sanitizeFilenamePart(filterLabel)}-${getDownloadStamp()}.pdf`;
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
    const ids = new Set(unreportedExpenses.map((expense) => expense.id));
    if (ids.size === 0) {
      return;
    }
    setExpenses((previous) =>
      previous.map((expense) => (ids.has(expense.id) ? { ...expense, status: "reported" } : expense)),
    );
    setExportNotice(`已将 ${ids.size} 条消费标记为已报销`);
  };

  const confirmDeleteExpenses = () => {
    const ids = new Set(pendingDeleteIds);
    setExpenses((previous) => previous.filter((expense) => !ids.has(expense.id)));
    setExportNotice(`已删除 ${ids.size} 条消费记录`);
    setPendingDeleteIds([]);
    clearExpenseSelection();
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setExportNotice("已复制当前共享账单链接");
    } catch {
      setExportNotice(`共享账单链接：${window.location.href}`);
    }
  };


  return {
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
    viewExpenses,
    unreportedExpenses,
    reportedRangeExpenses,
    filteredExpenses,
    unreportedExpenseCount,
    totalPages,
    visiblePageNumbers,
    pagedExpenses,
    allFilteredSelected,
    someFilteredSelected,
    summary,
    filterLabel,
    filteredSummary,
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
    copyShareLink,
  };
}
