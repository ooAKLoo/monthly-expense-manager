import assert from "node:assert/strict";
import test from "node:test";
import {
  inferCurrencyFromExpense,
  isLikelyFalsePositiveExpense,
  normalizeCurrency,
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

test("recognizes explicit AUD before generic dollar evidence", () => {
  const cases = [
    {
      amountText: "A$185.29",
      currencyEvidence: "A$ / AUD",
      evidenceText: "ChatGPT Subscription Total A$185.29 AUD",
      expectedAmount: 185.29,
    },
    {
      amountText: "AU$152.84",
      currencyEvidence: "AU$",
      evidenceText: "ChatGPT Subscription Total AU$152.84",
      expectedAmount: 152.84,
    },
  ];

  for (const item of cases) {
    const expense = {
      ...item,
      currency: "USD",
      description: "ChatGPT 订阅",
      merchant: "ChatGPT",
      source: "上传图片",
    };

    assert.equal(resolveOriginalAmount(expense), item.expectedAmount);
    assert.equal(inferCurrencyFromExpense(expense), "AUD");
  }

  assert.equal(normalizeCurrency("AUD"), "AUD");
  assert.equal(inferCurrencyFromExpense({ currency: "AUD" }), "AUD");
});

test("prefers the final paid amount over item total and discount", () => {
  const expense = {
    amountText: "优惠金额 ¥4.00",
    originalAmount: 4,
    currency: "CNY",
    description: "绿林细嘴热熔胶枪成人手工",
    merchant: "绿林官方旗舰店",
    source: "上传图片",
    evidenceText: "商品总额 ¥29.90；优惠金额 ¥4.00；实付款 ¥25.90",
  };

  assert.equal(resolveOriginalAmount(expense), 25.9);
  assert.equal(isLikelyFalsePositiveExpense({ ...expense, originalAmount: 25.9 }), false);
});

test("treats 共减 as a discount and keeps the following paid amount", () => {
  const cases = [
    ["合计 共减¥2.4 ¥16.45", 16.45],
    ["实付款 共减¥0.8 ¥8.1", 8.1],
    ["实付款 共减¥4 ¥17.9", 17.9],
  ];

  for (const [evidenceText, expected] of cases) {
    assert.equal(
      resolveOriginalAmount({
        originalAmount: Number(evidenceText.match(/共减¥([\d.]+)/)?.[1]),
        currency: "CNY",
        source: "上传图片",
        evidenceText,
      }),
      expected,
    );
  }
});

test("rejects a discount-only amount as an expense", () => {
  const expense = {
    amountText: "优惠金额 ¥4.00",
    originalAmount: 4,
    currency: "CNY",
    description: "订单优惠",
    merchant: "绿林官方旗舰店",
    source: "上传图片",
    evidenceText: "优惠金额 ¥4.00",
  };

  assert.equal(isLikelyFalsePositiveExpense(expense), true);
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
