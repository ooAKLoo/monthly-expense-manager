import assert from "node:assert/strict";
import test from "node:test";
import {
  inferCurrencyFromExpense,
  isLikelyFalsePositiveExpense,
  resolveOriginalAmount,
} from "./expense-normalizer.mjs";

test("normalizes Chinese payment details without explicit currency as CNY", () => {
  const expense = {
    amountText: "-100.00",
    currency: "USD",
    description: "火山引擎2101067458余额充值",
    merchant: "北京火山引擎科技有限公司",
    paymentMethod: "BOC Debit Card(5018)",
    source: "上传图片",
    evidenceText: "-100.00 Transaction successful, Payment method BOC Debit Card(5018)",
  };

  const normalized = {
    ...expense,
    originalAmount: resolveOriginalAmount(expense),
  };

  assert.equal(normalized.originalAmount, 100);
  assert.equal(inferCurrencyFromExpense(normalized), "CNY");
  assert.equal(isLikelyFalsePositiveExpense(normalized), false);
});

test("keeps explicit USD evidence as USD", () => {
  const expense = {
    amountText: "$22.80",
    currency: "CNY",
    description: "Uber Receipt",
    merchant: "Uber",
    note: "客户拜访",
    source: "上传图片",
    evidenceText: "Total $22.80",
  };

  assert.equal(resolveOriginalAmount(expense), 22.8);
  assert.equal(inferCurrencyFromExpense(expense), "USD");
});

test("keeps explicit TWD evidence as TWD", () => {
  const expense = {
    amountText: "NT$3,300.00",
    currency: "CNY",
    description: "Hotel",
    merchant: "台北酒店",
    source: "上传图片",
    evidenceText: "總計 NT$3,300.00",
  };

  assert.equal(resolveOriginalAmount(expense), 3300);
  assert.equal(inferCurrencyFromExpense(expense), "TWD");
});

test("rejects order numbers without visible amount evidence", () => {
  const expense = {
    originalAmount: 202606032200142,
    currency: "CNY",
    description: "订单号 2026060322001422981405009442",
    merchant: "未知商家",
    source: "上传图片",
    evidenceText: "Order No. 2026060322001422981405009442",
  };

  assert.equal(isLikelyFalsePositiveExpense(expense), true);
});

test("extracts context amounts without currency markers", () => {
  const expense = {
    currency: "CNY",
    description: "物流费用",
    merchant: "物流商",
    source: "上传图片",
    evidenceText: "总共677，含运费",
  };

  assert.equal(resolveOriginalAmount(expense), 677);
  assert.equal(inferCurrencyFromExpense(expense), "CNY");
});
