import assert from "node:assert/strict";
import test from "node:test";
import {
  getMonthDateRange,
  getInlinePreviewMimeType,
  isInlinePreviewAttachment,
  normalizeAttachmentList,
  normalizeAttachmentPayload,
  normalizeDateRange,
} from "./bill-schema.mjs";

test("builds and validates an inclusive day range within the active month", () => {
  assert.deepEqual(getMonthDateRange("2024-02"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.deepEqual(
    normalizeDateRange({ start: "2024/02/05", end: "2024/02/20" }, "2024-02"),
    { start: "2024-02-05", end: "2024-02-20" },
  );
});

test("falls back to the full month for reversed or cross-month ranges", () => {
  const fallback = { start: "2024-05-01", end: "2024-05-31" };
  assert.deepEqual(
    normalizeDateRange({ start: "2024-05-20", end: "2024-05-10" }, "2024-05"),
    fallback,
  );
  assert.deepEqual(
    normalizeDateRange({ start: "2024-04-30", end: "2024-05-10" }, "2024-05"),
    fallback,
  );
});

test("normalizes multiple attachments, deduplicates ids and rebuilds bill-local urls", () => {
  const attachments = normalizeAttachmentList(
    [
      {
        id: "attachment-one",
        name: "合同.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 18,
        url: "https://attacker.invalid/file",
      },
      {
        id: "attachment-one",
        name: "重复.zip",
        mimeType: "application/zip",
        size: 20,
        url: "https://attacker.invalid/duplicate",
      },
      {
        id: "attachment-two",
        name: "证据.zip",
        mimeType: "application/zip",
        size: 22,
        url: "ignored",
      },
    ],
    "bill-test-1",
  );

  assert.equal(attachments.length, 2);
  assert.equal(attachments[0].url, "api/bills/bill-test-1/attachments/attachment-one");
  assert.equal(attachments[1].url, "api/bills/bill-test-1/attachments/attachment-two");
  assert.equal(normalizeAttachmentPayload({ id: "bad id", url: "ignored" }), null);
});

test("only trusted raster images and PDFs can render inline", () => {
  assert.equal(isInlinePreviewAttachment({ mimeType: "image/png" }), true);
  assert.equal(isInlinePreviewAttachment({ mimeType: "application/pdf" }), true);
  assert.equal(
    getInlinePreviewMimeType({ name: "收据.PDF", mimeType: "application/octet-stream" }),
    "application/pdf",
  );
  assert.equal(isInlinePreviewAttachment({ name: "收据.pdf.exe", mimeType: "application/octet-stream" }), false);
  assert.equal(isInlinePreviewAttachment({ mimeType: "image/svg+xml" }), false);
  assert.equal(isInlinePreviewAttachment({ mimeType: "text/html" }), false);
  assert.equal(isInlinePreviewAttachment({ mimeType: "application/zip" }), false);
});
