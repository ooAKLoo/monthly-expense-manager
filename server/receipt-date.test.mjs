import assert from "node:assert/strict";
import test from "node:test";
import {
  getReceiptFallbackDate,
  getShanghaiDate,
  normalizeRecognizedReceiptDate,
  normalizeReferenceDate,
} from "./receipt-date.mjs";

test("uses the upload reference date for Today instead of the full-range end", () => {
  const referenceDate = normalizeReferenceDate("2026-07-11", "2026-07");
  const fallbackDate = getReceiptFallbackDate("2026-07", "2026-07-31", referenceDate);

  assert.equal(fallbackDate, "2026-07-11");
  assert.equal(
    normalizeRecognizedReceiptDate("", { month: "2026-07", fallbackDate, referenceDate }),
    "2026-07-11",
  );
  assert.equal(
    normalizeRecognizedReceiptDate("2026-07-31", { month: "2026-07", fallbackDate, referenceDate }),
    "2026-07-11",
  );
  assert.equal(
    normalizeRecognizedReceiptDate("2026-07-09", { month: "2026-07", fallbackDate, referenceDate }),
    "2026-07-09",
  );
});

test("keeps the selected range end as fallback for a historical month", () => {
  const referenceDate = normalizeReferenceDate("2026-07-11", "2026-06");
  assert.equal(referenceDate, "");
  assert.equal(getReceiptFallbackDate("2026-06", "2026-06-23", referenceDate), "2026-06-23");
});

test("uses Asia/Shanghai when the server needs a reference date", () => {
  assert.equal(getShanghaiDate(new Date("2026-07-10T16:30:00.000Z")), "2026-07-11");
});
