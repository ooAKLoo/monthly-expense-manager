import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOriginalAmount } from "../server/expense-normalizer.mjs";

const chatGptAudAmounts = new Set([185.29, 152.84]);
const discountedOrderRules = [
  { merchant: /天天特卖工厂/, description: /剪刀/, mistakenAmount: 2.4 },
  { merchant: /3M瑜天扩专卖店/i, description: /魔术贴/, mistakenAmount: 0.8 },
  { merchant: /绿林官方旗舰店/, description: /热熔胶枪/, mistakenAmount: 4 },
];

export function repairBill(bill) {
  if (!Array.isArray(bill?.expenses)) {
    return { bill, actions: [] };
  }

  const actions = [];
  const expenses = [];
  for (const expense of bill.expenses) {
    if (isConfirmedChatGptAud(expense)) {
      const updated = {
        ...expense,
        currency: "AUD",
        currencyEvidence: `AUD ${Number(expense.originalAmount).toFixed(2)}（用户确认）`,
      };
      expenses.push(updated);
      actions.push({
        id: expense.id,
        action: "update_currency",
        reason: "用户确认 A$/AUD 被误识别为 USD",
        before: { currency: expense.currency, originalAmount: expense.originalAmount },
        after: { currency: "AUD", originalAmount: expense.originalAmount },
      });
      continue;
    }

    if (isKnownDiscountOrder(expense)) {
      const resolvedAmount = resolveOriginalAmount(expense);
      if (resolvedAmount > 0 && Math.abs(resolvedAmount - 4) > 0.005) {
        expenses.push({ ...expense, originalAmount: resolvedAmount });
        actions.push({
          id: expense.id,
          action: "update_amount",
          reason: "从原始证据中的实付字段恢复金额",
          before: { originalAmount: expense.originalAmount },
          after: { originalAmount: resolvedAmount },
        });
      } else {
        actions.push({
          id: expense.id,
          action: "remove_discount_only_record",
          reason: "¥4.00 已确认为优惠金额，缺少可验证的实付金额",
          before: { originalAmount: expense.originalAmount, currency: expense.currency },
          after: null,
        });
      }
      continue;
    }

    expenses.push(expense);
  }

  return {
    bill: actions.length > 0 ? { ...bill, expenses } : bill,
    actions,
  };
}

function isConfirmedChatGptAud(expense) {
  return (
    expense?.date === "2026-07-31" &&
    /ChatGPT/i.test(`${expense?.description ?? ""} ${expense?.merchant ?? ""}`) &&
    expense?.currency === "USD" &&
    chatGptAudAmounts.has(Number(expense?.originalAmount))
  );
}

function isKnownDiscountOrder(expense) {
  if (expense?.date !== "2026-06-23" && expense?.date !== "2026-07-23") {
    return false;
  }
  return discountedOrderRules.some(
    (rule) =>
      rule.merchant.test(expense?.merchant ?? "") &&
      rule.description.test(expense?.description ?? "") &&
      Math.abs(Number(expense?.originalAmount) - rule.mistakenAmount) < 0.005,
  );
}

async function run() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dataDirIndex = args.indexOf("--data-dir");
  const dataDir = path.resolve(
    dataDirIndex >= 0 && args[dataDirIndex + 1]
      ? args[dataDirIndex + 1]
      : process.env.EXPENSE_DATA_DIR || path.resolve("data"),
  );
  const billsDir = path.join(dataDir, "bills");
  const entries = await fs.readdir(billsDir, { withFileTypes: true });
  const reports = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const target = path.join(billsDir, entry.name);
    const raw = await fs.readFile(target, "utf8");
    const original = JSON.parse(raw);
    const result = repairBill(original);
    if (result.actions.length === 0) {
      continue;
    }

    reports.push({ file: target, actions: result.actions });
    if (apply) {
      const backup = `${target}.backup-${Date.now()}`;
      const temporary = `${target}.${process.pid}.tmp`;
      await fs.copyFile(target, backup);
      await fs.writeFile(temporary, JSON.stringify(result.bill, null, 2), "utf8");
      await fs.rename(temporary, target);
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", dataDir, reports }, null, 2));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  await run();
}
