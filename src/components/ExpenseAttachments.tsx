import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, Download, File as FileIcon, FileText, Image as ImageIcon, Paperclip, Plus, RefreshCw, X } from "lucide-react";
import { Attachment, Expense, attachmentDownloadUrl, attachmentUrl, canPreviewAttachment, getExpenseAttachments, isImageAttachment, isPdfAttachment } from "../expense-domain";

export function useModalFocus(
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

export function SourceCell({
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

export function AttachmentPreview({
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
