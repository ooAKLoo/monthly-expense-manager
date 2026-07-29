import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBillStore } from "./bill-store.mjs";

function normalizeBill(id, payload) {
  return {
    id,
    currentMonth: payload.currentMonth ?? "2026-07",
    dateRange: payload.dateRange ?? { start: "2026-07-01", end: "2026-07-31" },
    expenses: payload.expenses ?? [],
    createdAt: payload.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: payload.updatedAt ?? "2026-07-29T00:00:00.000Z",
  };
}

function expense(id, date, status, description) {
  return {
    id,
    date,
    description,
    category: "办公",
    originalAmount: 10,
    currency: "CNY",
    merchant: "测试商家",
    status,
    note: "",
    source: "测试",
    recurring: false,
    attachments: [],
  };
}

test("migrates JSON bills once and persists them in SQLite", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bill-store-migration-"));
  try {
    await fs.mkdir(path.join(dataDir, "bills"));
    await fs.writeFile(
      path.join(dataDir, "bills", "bill-one.json"),
      JSON.stringify({
        currentMonth: "2026-07",
        expenses: [expense("expense-one", "2026-07-03", "unreported", "午餐")],
      }),
    );

    const store = await createBillStore({ dataDir, normalizeBill });
    assert.deepEqual(await store.migrateJsonBills(), { imported: 1 });
    assert.deepEqual(await store.migrateJsonBills(), { imported: 0 });
    assert.equal(store.readBill("bill-one").expenses[0].description, "午餐");
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test("filters and paginates expenses with a bounded page size", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bill-store-page-"));
  try {
    const store = await createBillStore({ dataDir, normalizeBill });
    store.saveBill(
      normalizeBill("bill-two", {
        expenses: [
          expense("expense-one", "2026-07-03", "unreported", "团队午餐"),
          expense("expense-two", "2026-07-02", "reported", "办公用品"),
          expense("expense-three", "2026-06-30", "unreported", "六月午餐"),
        ],
      }),
    );

    const firstPage = store.listExpenses("bill-two", {
      start: "2026-07-01",
      end: "2026-07-31",
      status: "unreported",
      query: "午餐",
      page: 1,
      pageSize: 1,
    });
    assert.equal(firstPage.pagination.total, 1);
    assert.equal(firstPage.pagination.totalPages, 1);
    assert.equal(firstPage.expenses[0].id, "expense-one");

    const bounded = store.listExpenses("bill-two", { pageSize: 10_000 });
    assert.equal(bounded.pagination.pageSize, 100);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
