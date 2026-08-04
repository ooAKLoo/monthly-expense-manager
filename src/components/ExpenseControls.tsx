import { ComponentType, KeyboardEvent, SVGProps, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, BriefcaseBusiness, CalendarDays, CalendarRange, Check, ChevronDown, Coffee, Home, Plane, ReceiptText, RefreshCw, Repeat2, ShoppingBag, TrainFront } from "lucide-react";
import {
  Category,
  DateRange,
  Expense,
  Status,
  amountInCny,
  analysisSteps,
  categories,
  formatCny,
  formatEditableAmount,
  formatOriginalAmountNote,
  getDateRangeLabel,
  getMonthDateRange,
  getMonthLabel,
  monthKey,
  parseEditableAmount,
  statuses,
} from "../expense-domain";

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

type MenuOption<T extends string> = {
  value: T;
  label: string;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

export function MenuSelect<T extends string>({
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

export function DateRangePicker({
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

export function CategorySelect({
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

export function StatusSelect({
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

export function BatchStatusSelect({ onChange }: { onChange: (status: Status) => void }) {
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

export function AmountCell({
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

export function AnalysisProgress({
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
