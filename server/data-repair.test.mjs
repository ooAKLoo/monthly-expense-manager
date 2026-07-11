import assert from "node:assert/strict";
import test from "node:test";
import { repairBill } from "../scripts/repair-expense-data.mjs";

test("repairs confirmed ChatGPT AUD rows without changing record metadata", () => {
  const expense = {
    id: "chatgpt-1",
    date: "2026-07-31",
    description: "ChatGPT 订阅",
    merchant: "ChatGPT",
    originalAmount: 185.29,
    currency: "USD",
    status: "unreported",
    note: "IMG_7498",
    evidenceText: "Total $185.29",
  };
  const result = repairBill({ id: "bill-1", expenses: [expense] });

  assert.equal(result.actions[0].action, "update_currency");
  assert.equal(result.bill.expenses[0].currency, "AUD");
  assert.equal(result.bill.expenses[0].id, expense.id);
  assert.equal(result.bill.expenses[0].status, expense.status);
  assert.match(result.bill.expenses[0].currencyEvidence, /AUD 185\.29/);
  assert.equal(repairBill(result.bill).actions.length, 0);
});

test("recovers glue gun payment from evidence or removes a discount-only row", () => {
  const baseExpense = {
    id: "glue-gun",
    date: "2026-07-23",
    description: "绿林细嘴热熔胶枪成人手工（结转）",
    merchant: "绿林官方旗舰店",
    originalAmount: 4,
    currency: "CNY",
  };

  const recovered = repairBill({
    expenses: [
      {
        ...baseExpense,
        evidenceText: "商品金额 ¥39.90；优惠 ¥4.00；实付款 ¥35.90",
      },
    ],
  });
  assert.equal(recovered.actions[0].action, "update_amount");
  assert.equal(recovered.bill.expenses[0].originalAmount, 35.9);

  const removed = repairBill({
    expenses: [{ ...baseExpense, evidenceText: "优惠金额 ¥4.00" }],
  });
  assert.equal(removed.actions[0].action, "remove_discount_only_record");
  assert.equal(removed.bill.expenses.length, 0);
  assert.equal(repairBill(removed.bill).actions.length, 0);
});

test("repairs all confirmed 共减 order rows in original and carried months", () => {
  const bill = {
    expenses: [
      {
        id: "scissors",
        date: "2026-07-23",
        description: "天天特卖工厂 裁缝剪刀（结转）",
        merchant: "天天特卖工厂",
        originalAmount: 2.4,
        evidenceText: "合计 共减¥2.4 ¥16.45",
      },
      {
        id: "tape",
        date: "2026-06-23",
        description: "购买3M双面魔术贴带背胶衣服专用",
        merchant: "3M瑜天扩专卖店",
        originalAmount: 0.8,
        evidenceText: "实付款 共减¥0.8 ¥8.1",
      },
    ],
  };

  const result = repairBill(bill);
  assert.deepEqual(
    result.bill.expenses.map((expense) => expense.originalAmount),
    [16.45, 8.1],
  );
  assert.deepEqual(
    result.actions.map((action) => action.action),
    ["update_amount", "update_amount"],
  );
});
