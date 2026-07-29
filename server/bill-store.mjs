import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const schemaVersion = "1";

export async function createBillStore({ dataDir, normalizeBill }) {
  const databasePath = path.join(dataDir, "monthly-expenses.sqlite");
  const billsDir = path.join(dataDir, "bills");
  const database = new DatabaseSync(databasePath);

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      current_month TEXT NOT NULL,
      range_start TEXT NOT NULL,
      range_end TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      bill_id TEXT NOT NULL,
      id TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      status TEXT NOT NULL,
      category TEXT NOT NULL,
      search_text TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (bill_id, id),
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS expenses_bill_date
      ON expenses (bill_id, expense_date DESC, position ASC);
    CREATE INDEX IF NOT EXISTS expenses_bill_status_date
      ON expenses (bill_id, status, expense_date DESC);
    CREATE INDEX IF NOT EXISTS expenses_bill_category_date
      ON expenses (bill_id, category, expense_date DESC);
  `);

  const statements = {
    readBill: database.prepare(`
      SELECT id, current_month, range_start, range_end, created_at, updated_at
      FROM bills
      WHERE id = ?
    `),
    readExpenses: database.prepare(`
      SELECT payload_json
      FROM expenses
      WHERE bill_id = ?
      ORDER BY position ASC
    `),
    upsertBill: database.prepare(`
      INSERT INTO bills (id, current_month, range_start, range_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        current_month = excluded.current_month,
        range_start = excluded.range_start,
        range_end = excluded.range_end,
        updated_at = excluded.updated_at
    `),
    upsertExpense: database.prepare(`
      INSERT INTO expenses (
        bill_id, id, expense_date, status, category, search_text,
        payload_json, position, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bill_id, id) DO UPDATE SET
        expense_date = excluded.expense_date,
        status = excluded.status,
        category = excluded.category,
        search_text = excluded.search_text,
        payload_json = excluded.payload_json,
        position = excluded.position,
        updated_at = excluded.updated_at
    `),
    deleteExpenses: database.prepare("DELETE FROM expenses WHERE bill_id = ?"),
    getMetadata: database.prepare("SELECT value FROM app_metadata WHERE key = ?"),
    setMetadata: database.prepare(`
      INSERT INTO app_metadata (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `),
  };

  function saveBill(normalizedBill) {
    database.exec("BEGIN IMMEDIATE");
    try {
      statements.upsertBill.run(
        normalizedBill.id,
        normalizedBill.currentMonth,
        normalizedBill.dateRange.start,
        normalizedBill.dateRange.end,
        normalizedBill.createdAt,
        normalizedBill.updatedAt,
      );
      statements.deleteExpenses.run(normalizedBill.id);
      normalizedBill.expenses.forEach((expense, position) => {
        statements.upsertExpense.run(
          normalizedBill.id,
          expense.id,
          expense.date,
          expense.status,
          expense.category,
          expenseSearchText(expense),
          JSON.stringify(expense),
          position,
          normalizedBill.updatedAt,
        );
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readBill(id) {
    const row = statements.readBill.get(id);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      currentMonth: row.current_month,
      dateRange: {
        start: row.range_start,
        end: row.range_end,
      },
      expenses: statements.readExpenses.all(id).map(({ payload_json: payload }) => JSON.parse(payload)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function listExpenses(billId, options = {}) {
    const page = positiveInteger(options.page, 1, 1_000_000);
    const pageSize = positiveInteger(options.pageSize, 20, 100);
    const where = ["bill_id = ?"];
    const values = [billId];

    if (isDate(options.start)) {
      where.push("expense_date >= ?");
      values.push(options.start);
    }
    if (isDate(options.end)) {
      where.push("expense_date <= ?");
      values.push(options.end);
    }
    if (options.status === "reported" || options.status === "unreported") {
      where.push("status = ?");
      values.push(options.status);
    }
    const query = typeof options.query === "string" ? options.query.trim().toLocaleLowerCase() : "";
    if (query) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      values.push(`%${escapeLike(query)}%`);
    }

    const condition = where.join(" AND ");
    const total = Number(
      database.prepare(`SELECT COUNT(*) AS count FROM expenses WHERE ${condition}`).get(...values)
        .count,
    );
    const offset = (page - 1) * pageSize;
    const rows = database
      .prepare(`
        SELECT payload_json
        FROM expenses
        WHERE ${condition}
        ORDER BY expense_date DESC, position ASC
        LIMIT ? OFFSET ?
      `)
      .all(...values, pageSize, offset);

    return {
      expenses: rows.map(({ payload_json: payload }) => JSON.parse(payload)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async function migrateJsonBills() {
    if (statements.getMetadata.get("json_migration_version")?.value === schemaVersion) {
      return { imported: 0 };
    }

    let entries = [];
    try {
      entries = await fs.readdir(billsDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    let imported = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const id = entry.name.slice(0, -5);
      if (readBill(id)) {
        continue;
      }
      const raw = JSON.parse(await fs.readFile(path.join(billsDir, entry.name), "utf8"));
      saveBill(normalizeBill(id, raw));
      imported += 1;
    }
    statements.setMetadata.run("json_migration_version", schemaVersion);
    return { imported };
  }

  return {
    databasePath,
    listExpenses,
    migrateJsonBills,
    readBill,
    saveBill,
  };
}

function expenseSearchText(expense) {
  return [
    expense.description,
    expense.merchant,
    expense.note,
    expense.category,
    expense.source,
    expense.paymentMethod,
    expense.evidenceText,
    expense.attachment?.name,
    ...(expense.attachments ?? []).map((attachment) => attachment?.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}
