import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { fileURLToPath } from "node:url";
import {
  inferCurrencyFromExpense,
  isLikelyFalsePositiveExpense,
  normalizeCategory,
  normalizeConfidence,
  resolveOriginalAmount,
} from "./expense-normalizer.mjs";
import {
  getMonthDateRange,
  getInlinePreviewMimeType,
  normalizeAttachmentList,
  normalizeAttachmentPayload,
  normalizeDateRange,
} from "./bill-schema.mjs";
import {
  getReceiptFallbackDate,
  normalizeRecognizedReceiptDate,
  normalizeReferenceDate,
} from "./receipt-date.mjs";
import { callArkResponses, callChatCompletions } from "./model-clients.mjs";
import { createBillStore } from "./bill-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env.local"), override: false });
dotenv.config({ path: path.join(rootDir, ".env") });
if (process.env.ARK_ENV_FILE) {
  const arkEnvFile = process.env.ARK_ENV_FILE.replace(/^~(?=\/)/, process.env.HOME ?? "");
  dotenv.config({ path: arkEnvFile, override: false });
}

const app = express();
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 8,
  },
  storage: multer.memoryStorage(),
});

const config = {
  qwenApiKey: process.env.DASHSCOPE_API_KEY ?? "",
  qwenBaseUrl: process.env.DASHSCOPE_API_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwenLlmModel: process.env.DASHSCOPE_LLM_MODEL ?? "qwen3.7-plus",
  qwenVisionModel: process.env.DASHSCOPE_VISION_MODEL ?? "qwen-vl-plus",
  qwenMultimodalModel: process.env.DASHSCOPE_MULTIMODAL_MODEL ?? "qwen-vl-plus",
  seedApiKey: process.env.ARK_API_KEY ?? "",
  seedBaseUrl:
    process.env.ARK_API_BASE_URL ??
    process.env.ARK_BASE_URL ??
    "https://ark.cn-beijing.volces.com/api/v3",
  seedModel: process.env.ARK_RECEIPT_MODEL ?? "doubao-seed-2-0-lite-260428",
  preferredProvider: normalizeProvider(process.env.RECEIPT_AI_PROVIDER) ?? "seed",
  enableModelEval: process.env.ENABLE_MODEL_EVAL === "true",
  useOss: process.env.DASHSCOPE_USE_OSS === "true",
  ossRegion: process.env.OSS_REGION ?? "",
  ossBucket: process.env.OSS_BUCKET ?? "",
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID ?? "",
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? "",
  ossPrefix: process.env.OSS_PREFIX ?? "monthly-expenses",
  dataDir: process.env.EXPENSE_DATA_DIR ?? path.join(rootDir, "data"),
};

const billsDir = path.join(config.dataDir, "bills");
const attachmentsDir = path.join(config.dataDir, "attachments");
const modelEvaluationsDir = path.join(config.dataDir, "model-evaluations");
const receiptPromptVersion = "v5-upload-reference-date";
const maxBillAttachmentCount = 200;
const maxBillAttachmentBytes = 500 * 1024 * 1024;
const maxAttachmentUploadRequestsPerMinute = 10;
const maxGlobalAttachmentUploadRequestsPerMinute = 30;
const attachmentUploadReservations = new Map();
const attachmentUploadHistory = new Map();
let globalAttachmentUploadHistory = [];

await fs.mkdir(billsDir, { recursive: true });
await fs.mkdir(attachmentsDir, { recursive: true });
await fs.mkdir(modelEvaluationsDir, { recursive: true });

const billStore = await createBillStore({
  dataDir: config.dataDir,
  normalizeBill: normalizeBillPayload,
});
const billMigration = await billStore.migrateJsonBills();
if (billMigration.imported > 0) {
  console.log(`Imported ${billMigration.imported} JSON bill(s) into ${billStore.databasePath}`);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    hasApiKey: hasAnyModelProvider(),
    providers: providerAvailability(),
    models: publicModelConfig(),
    oss: {
      enabled: config.useOss,
      configured: isOssConfigured(),
    },
  });
});

app.get("/api/model-config", (_request, response) => {
  response.json({
    providers: providerAvailability(),
    models: publicModelConfig(),
    oss: {
      enabled: config.useOss,
      configured: isOssConfigured(),
      prefix: config.ossPrefix,
    },
  });
});

app.post("/api/bills", async (_request, response) => {
  const bill = createDefaultBill(createId(10));
  await saveBill(bill);
  response.status(201).json({ bill });
});

app.get("/api/bills/:billId", async (request, response) => {
  const billId = normalizeId(request.params.billId);
  if (!billId) {
    response.status(400).json({ error: "账单 ID 无效" });
    return;
  }

  const bill = await readBill(billId);
  response.json({ bill });
});

app.get("/api/bills/:billId/expenses", async (request, response) => {
  const billId = normalizeId(request.params.billId);
  if (!billId) {
    response.status(400).json({ error: "账单 ID 无效" });
    return;
  }

  await readBill(billId);
  response.json(
    billStore.listExpenses(billId, {
      page: request.query.page,
      pageSize: request.query.pageSize,
      start: request.query.start,
      end: request.query.end,
      status: request.query.status,
      query: request.query.query,
    }),
  );
});

app.put("/api/bills/:billId", async (request, response) => {
  const billId = normalizeId(request.params.billId);
  if (!billId) {
    response.status(400).json({ error: "账单 ID 无效" });
    return;
  }

  const bill = normalizeBillPayload(billId, request.body);
  await saveBill(bill);
  response.json({ bill });
});

app.get("/api/bills/:billId/attachments/:attachmentId", async (request, response) => {
  const billId = normalizeId(request.params.billId);
  const attachmentId = normalizeId(request.params.attachmentId);
  if (!billId || !attachmentId) {
    response.status(400).json({ error: "附件地址无效" });
    return;
  }

  const attachment = await readAttachment(billId, attachmentId);
  if (!attachment) {
    response.status(404).json({ error: "附件不存在" });
    return;
  }

  const inlinePreviewMimeType = getInlinePreviewMimeType(attachment);
  const canPreviewInline = request.query.download !== "1" && Boolean(inlinePreviewMimeType);
  response.type(canPreviewInline ? inlinePreviewMimeType : "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "private, max-age=86400");
  response.setHeader(
    "Content-Disposition",
    `${canPreviewInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  );
  response.sendFile(path.join(getBillAttachmentsDir(billId), attachment.filename));
});

app.post("/api/bills/:billId/attachments", upload.array("files"), async (request, response) => {
  try {
    const billId = normalizeId(request.params.billId);
    if (!billId) {
      response.status(400).json({ error: "账单 ID 无效" });
      return;
    }

    const files = request.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      response.status(400).json({ error: "请至少选择一个附件" });
      return;
    }

    const attachments = await storeUploadedAttachments(billId, files);
    response.status(201).json({ attachments });
  } catch (error) {
    if (sendAttachmentPolicyError(error, response)) {
      return;
    }
    console.error(error);
    response.status(500).json({ error: "附件上传服务异常" });
  }
});

app.post("/api/bills/:billId/analyze-expenses", upload.array("files"), async (request, response) => {
  try {
    const billId = normalizeId(request.params.billId);
    if (!billId) {
      response.status(400).json({ error: "账单 ID 无效" });
      return;
    }

    if (!hasAnyModelProvider()) {
      response.status(500).json({ error: "DASHSCOPE_API_KEY 和 ARK_API_KEY 均未配置" });
      return;
    }

    const files = request.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      response.status(400).json({ error: "请上传至少一个消费截图或 PDF" });
      return;
    }

    const month = typeof request.body.month === "string" ? request.body.month : "";
    const rangeStart = normalizeRangeDate(request.body.rangeStart, month);
    const rangeEnd = normalizeRangeDate(request.body.rangeEnd, month);
    const referenceDate = normalizeReferenceDate(request.body.referenceDate, month);
    const exchangeRate = Number(request.body.exchangeRate) || 7.21;
    const audExchangeRate = Number(request.body.audExchangeRate) || 4.7;
    const twdExchangeRate = Number(request.body.twdExchangeRate) || 0.23;
    const requestedProvider = normalizeProvider(request.body.provider);
    const provider = resolveModelProvider(requestedProvider);
    const expenses = [];
    const warnings = [];
    const usedProviders = new Set();
    const attachments = await storeUploadedAttachments(billId, files);

    for (const [index, file] of files.entries()) {
      const attachment = attachments[index];
      try {
        const result = await analyzeFileWithFallback(
          file,
          {
            month,
            rangeStart,
            rangeEnd,
            referenceDate,
            exchangeRate,
            audExchangeRate,
            twdExchangeRate,
            attachment,
          },
          provider,
        );
        if (result.warning) {
          warnings.push(`${file.originalname}: ${result.warning}`);
        }
        usedProviders.add(result.provider);
        expenses.push(...result.expenses);
      } catch (error) {
        await deleteStoredAttachment(billId, attachment.id);
        warnings.push(`${file.originalname}: ${error instanceof Error ? error.message : "识别失败"}`);
      }
    }

    if (expenses.length === 0) {
      response.status(422).json({
        error: warnings[0] ?? "未能识别出消费记录",
        warnings,
      });
      return;
    }

    response.json({
      expenses,
      warnings,
      models: {
        ...publicModelConfig(usedProviders.size === 1 ? [...usedProviders][0] : provider),
        usedProviders: [...usedProviders],
      },
    });
  } catch (error) {
    if (sendAttachmentPolicyError(error, response)) {
      return;
    }
    console.error(error);
    response.status(500).json({ error: "消费识别服务异常" });
  }
});

app.post(
  "/api/bills/:billId/attachments/:attachmentId/reanalyze-expenses",
  async (request, response) => {
    try {
      const billId = normalizeId(request.params.billId);
      const attachmentId = normalizeId(request.params.attachmentId);
      if (!billId || !attachmentId) {
        response.status(400).json({ error: "附件地址无效" });
        return;
      }

      if (!hasAnyModelProvider()) {
        response.status(500).json({ error: "DASHSCOPE_API_KEY 和 ARK_API_KEY 均未配置" });
        return;
      }

      const attachment = await readAttachment(billId, attachmentId);
      if (!attachment) {
        response.status(404).json({ error: "附件不存在，无法重新识别" });
        return;
      }

      const file = await loadStoredAttachmentFile(billId, attachment);
      const provider = resolveModelProvider(normalizeProvider(request.body?.provider));
      const result = await analyzeFileWithFallback(
        file,
        {
          ...analysisOptionsFromBody(request.body),
          attachment: normalizeAttachmentPayload(attachment),
        },
        provider,
      );

      response.json({
        expenses: result.expenses,
        warnings: result.warning ? [result.warning] : [],
        models: publicModelConfig(result.provider),
      });
    } catch (error) {
      console.error(error);
      response.status(500).json({
        error: error instanceof Error ? error.message : "重新识别服务异常",
      });
    }
  },
);

app.post(
  "/api/bills/:billId/compare-expense-models",
  upload.array("files"),
  async (request, response) => {
    try {
      const billId = normalizeId(request.params.billId);
      if (!billId) {
        response.status(400).json({ error: "账单 ID 无效" });
        return;
      }
      if (!config.enableModelEval) {
        response.status(403).json({ error: "模型对比接口未启用，请设置 ENABLE_MODEL_EVAL=true" });
        return;
      }
      if (!isProviderConfigured("seed") || !isProviderConfigured("qwen")) {
        response.status(400).json({ error: "同图对比需要同时配置 ARK_API_KEY 和 DASHSCOPE_API_KEY" });
        return;
      }

      const files = request.files ?? [];
      if (!Array.isArray(files) || files.length === 0) {
        response.status(400).json({ error: "请上传至少一个消费截图或 PDF" });
        return;
      }

      const options = analysisOptionsFromBody(request.body);
      const force = request.body?.force === "true";
      const comparisons = [];
      for (const file of files) {
        const inputHash = createHash("sha256").update(file.buffer).digest("hex");
        const cacheKey = createHash("sha256")
          .update(
            JSON.stringify({
              inputHash,
              options,
              promptVersion: receiptPromptVersion,
              seedModel: config.seedModel,
              qwenVisionModel: config.qwenVisionModel,
              qwenLlmModel: config.qwenLlmModel,
            }),
          )
          .digest("hex");
        if (!force) {
          const cached = await readModelEvaluation(cacheKey);
          if (cached) {
            comparisons.push({ ...cached, cached: true });
            continue;
          }
        }

        const runs = await Promise.all(
          ["seed", "qwen"].map(async (provider) => {
            const startedAt = Date.now();
            try {
              const expenses = await analyzeFile(file, { ...options, attachment: null }, provider);
              return {
                provider,
                model: modelNameForProvider(provider, file.mimetype),
                durationMs: Date.now() - startedAt,
                expenses,
              };
            } catch (error) {
              return {
                provider,
                model: modelNameForProvider(provider, file.mimetype),
                durationMs: Date.now() - startedAt,
                error: error instanceof Error ? error.message : "识别失败",
                expenses: [],
              };
            }
          }),
        );
        const byProvider = Object.fromEntries(runs.map((run) => [run.provider, run]));
        const comparison = {
          filename: file.originalname,
          inputHash,
          cacheKey,
          promptVersion: receiptPromptVersion,
          cached: false,
          providers: byProvider,
          differences: compareExpenseResults(byProvider.seed.expenses, byProvider.qwen.expenses),
        };
        await writeModelEvaluation(cacheKey, comparison);
        comparisons.push(comparison);
      }

      response.json({ comparisons, models: publicModelConfig() });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "模型对比服务异常" });
    }
  },
);

app.use((error, _request, response, next) => {
  if (!(error instanceof multer.MulterError)) {
    next(error);
    return;
  }

  const message =
    error.code === "LIMIT_FILE_SIZE"
      ? "单个文件不能超过 10MB"
      : error.code === "LIMIT_FILE_COUNT"
        ? "每次最多上传 8 个文件"
        : "上传文件不符合限制";
  response.status(400).json({ error: message });
});

const distDir = path.join(rootDir, "dist");
app.use(express.static(distDir));
app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) {
    next();
    return;
  }

  response.sendFile(path.join(distDir, "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
});

function createId(bytes = 12) {
  return randomBytes(bytes).toString("base64url");
}

function normalizeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,80}$/.test(value) ? value : "";
}

function createDefaultBill(id) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    id,
    currentMonth,
    dateRange: getMonthDateRange(currentMonth),
    expenses: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function readBill(id) {
  const stored = billStore.readBill(id);
  if (stored) {
    return stored;
  }
  const bill = createDefaultBill(id);
  await saveBill(bill);
  return bill;
}

async function saveBill(bill) {
  const normalized = normalizeBillPayload(bill.id, bill);
  billStore.saveBill(normalized);
}

function normalizeBillPayload(id, payload) {
  const now = new Date().toISOString();
  const currentMonth =
    typeof payload?.currentMonth === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(payload.currentMonth)
      ? payload.currentMonth
      : createDefaultBill(id).currentMonth;

  return {
    id,
    currentMonth,
    dateRange: normalizeDateRange(payload?.dateRange, currentMonth),
    expenses: Array.isArray(payload?.expenses)
      ? payload.expenses
          .map((expense, index) => normalizeExpensePayload(expense, index, id))
          .filter((expense) => !isLikelyFalsePositiveExpense(expense))
      : [],
    createdAt: typeof payload?.createdAt === "string" ? payload.createdAt : now,
    updatedAt: now,
  };
}

function normalizeExpensePayload(expense, index, billId) {
  const attachment = normalizeAttachmentPayload(expense?.attachment, billId);
  return {
    id: stringOrFallback(expense?.id, `expense-${Date.now()}-${index}`),
    date: normalizeDate(expense?.date, new Date().toISOString().slice(0, 10)),
    description: stringOrFallback(expense?.description, "消费记录"),
    category: normalizeCategory(expense?.category),
    originalAmount: resolveOriginalAmount(expense),
    currency: inferCurrencyFromExpense(expense),
    merchant: stringOrFallback(expense?.merchant, "未知商家"),
    status: expense?.status === "reported" ? "reported" : "unreported",
    note: stringOrFallback(expense?.note, ""),
    source: stringOrFallback(expense?.source, "上传票据"),
    recurring: Boolean(expense?.recurring),
    confidence: normalizeConfidence(expense?.confidence),
    attachment,
    attachments: normalizeAttachmentList(expense?.attachments, billId).filter(
      (item) => item.id !== attachment?.id,
    ),
    amountText: stringOrFallback(expense?.amountText, ""),
    currencyEvidence: stringOrFallback(expense?.currencyEvidence, ""),
    paymentMethod: stringOrFallback(expense?.paymentMethod, ""),
    evidenceText: stringOrFallback(expense?.evidenceText, ""),
  };
}

function getBillAttachmentsDir(billId) {
  return path.join(attachmentsDir, billId);
}

function createAttachmentPolicyError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendAttachmentPolicyError(error, response) {
  if (!Number.isInteger(error?.statusCode)) {
    return false;
  }
  response.status(error.statusCode).json({ error: error.message });
  return true;
}

function registerAttachmentUploadAttempt(billId) {
  const now = Date.now();
  const windowStart = now - 60_000;
  globalAttachmentUploadHistory = globalAttachmentUploadHistory.filter(
    (timestamp) => timestamp >= windowStart,
  );
  if (globalAttachmentUploadHistory.length >= maxGlobalAttachmentUploadRequestsPerMinute) {
    throw createAttachmentPolicyError("附件上传服务繁忙，请稍后再试", 429);
  }
  const recent = (attachmentUploadHistory.get(billId) ?? []).filter(
    (timestamp) => timestamp >= windowStart,
  );
  if (recent.length >= maxAttachmentUploadRequestsPerMinute) {
    throw createAttachmentPolicyError("附件上传过于频繁，请稍后再试", 429);
  }
  recent.push(now);
  globalAttachmentUploadHistory.push(now);
  attachmentUploadHistory.set(billId, recent);

  if (attachmentUploadHistory.size > 5_000) {
    for (const [id, timestamps] of attachmentUploadHistory) {
      if (timestamps.every((timestamp) => timestamp < windowStart)) {
        attachmentUploadHistory.delete(id);
      }
    }
  }
}

async function getBillAttachmentUsage(billId) {
  const directory = getBillAttachmentsDir(billId);
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { count: 0, bytes: 0 };
    }
    throw error;
  }

  const files = entries.filter((entry) => entry.isFile());
  const sizes = await Promise.all(
    files.map(async (entry) => {
      try {
        return (await fs.stat(path.join(directory, entry.name))).size;
      } catch (error) {
        if (error?.code === "ENOENT") {
          return 0;
        }
        throw error;
      }
    }),
  );
  return {
    count: Math.ceil(files.length / 2),
    bytes: sizes.reduce((sum, size) => sum + size, 0),
  };
}

async function reserveAttachmentUpload(billId, files) {
  registerAttachmentUploadAttempt(billId);
  const incoming = {
    count: files.length,
    bytes: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
  };
  const usage = await getBillAttachmentUsage(billId);
  const reserved = attachmentUploadReservations.get(billId) ?? { count: 0, bytes: 0 };

  if (usage.count + reserved.count + incoming.count > maxBillAttachmentCount) {
    throw createAttachmentPolicyError(
      `单个账单最多保存 ${maxBillAttachmentCount} 个附件`,
      413,
    );
  }
  if (usage.bytes + reserved.bytes + incoming.bytes > maxBillAttachmentBytes) {
    throw createAttachmentPolicyError("单个账单附件总容量不能超过 500MB", 413);
  }

  attachmentUploadReservations.set(billId, {
    count: reserved.count + incoming.count,
    bytes: reserved.bytes + incoming.bytes,
  });
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const current = attachmentUploadReservations.get(billId) ?? { count: 0, bytes: 0 };
    const next = {
      count: Math.max(0, current.count - incoming.count),
      bytes: Math.max(0, current.bytes - incoming.bytes),
    };
    if (next.count === 0 && next.bytes === 0) {
      attachmentUploadReservations.delete(billId);
    } else {
      attachmentUploadReservations.set(billId, next);
    }
  };
}

async function deleteStoredAttachment(billId, attachmentId) {
  const directory = getBillAttachmentsDir(billId);
  const metadataPath = path.join(directory, `${attachmentId}.json`);
  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    await Promise.allSettled([
      metadata?.filename ? fs.unlink(path.join(directory, metadata.filename)) : Promise.resolve(),
      fs.unlink(metadataPath),
    ]);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function storeUploadedAttachments(billId, files) {
  const release = await reserveAttachmentUpload(billId, files);
  const attachments = [];
  try {
    for (const file of files) {
      attachments.push(await saveAttachment(billId, file));
    }
    return attachments;
  } catch (error) {
    await Promise.allSettled(
      attachments.map((attachment) => deleteStoredAttachment(billId, attachment.id)),
    );
    throw error;
  } finally {
    release();
  }
}

async function saveAttachment(billId, file) {
  const id = createId(12);
  const billAttachmentsDir = getBillAttachmentsDir(billId);
  await fs.mkdir(billAttachmentsDir, { recursive: true });
  const safeOriginalName = file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-");
  const extension = path.extname(safeOriginalName) || mimeExtension(file.mimetype);
  const filename = `${id}.data${extension}`;
  const attachment = {
    id,
    name: file.originalname,
    mimeType: file.mimetype || "application/octet-stream",
    size: file.size,
    filename,
    url: `api/bills/${billId}/attachments/${id}`,
  };

  const filePath = path.join(billAttachmentsDir, filename);
  const metadataPath = path.join(billAttachmentsDir, `${id}.json`);
  try {
    await fs.writeFile(filePath, file.buffer);
    await fs.writeFile(metadataPath, JSON.stringify(attachment, null, 2), "utf8");
  } catch (error) {
    await Promise.allSettled([fs.unlink(filePath), fs.unlink(metadataPath)]);
    throw error;
  }

  return normalizeAttachmentPayload(attachment);
}

async function readAttachment(billId, attachmentId) {
  try {
    const raw = await fs.readFile(path.join(getBillAttachmentsDir(billId), `${attachmentId}.json`), "utf8");
    const attachment = JSON.parse(raw);
    if (!attachment?.filename || attachment.id !== attachmentId) {
      return null;
    }
    return attachment;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function loadStoredAttachmentFile(billId, attachment) {
  const buffer = await fs.readFile(path.join(getBillAttachmentsDir(billId), attachment.filename));
  return {
    buffer,
    originalname: stringOrFallback(attachment.name, attachment.filename),
    mimetype: stringOrFallback(attachment.mimeType, "application/octet-stream"),
    size: buffer.length,
  };
}

function compareExpenseResults(seedExpenses, qwenExpenses) {
  const fields = ["date", "description", "category", "originalAmount", "currency", "merchant"];
  const differences = [];
  const count = Math.max(seedExpenses.length, qwenExpenses.length);
  for (let index = 0; index < count; index += 1) {
    const seed = seedExpenses[index] ?? null;
    const qwen = qwenExpenses[index] ?? null;
    if (!seed || !qwen) {
      differences.push({ index, field: "expense", seed, qwen });
      continue;
    }
    for (const field of fields) {
      if (seed[field] !== qwen[field]) {
        differences.push({ index, field, seed: seed[field], qwen: qwen[field] });
      }
    }
  }
  return differences;
}

async function readModelEvaluation(cacheKey) {
  try {
    const raw = await fs.readFile(path.join(modelEvaluationsDir, `${cacheKey}.json`), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeModelEvaluation(cacheKey, comparison) {
  const target = path.join(modelEvaluationsDir, `${cacheKey}.json`);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(comparison, null, 2), "utf8");
  await fs.rename(temporary, target);
}

function mimeExtension(mimeType) {
  if (mimeType === "application/pdf") {
    return ".pdf";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  return ".bin";
}

function normalizeProvider(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "seed" || normalized === "ark" || normalized === "volcark") {
    return "seed";
  }
  if (normalized === "qwen" || normalized === "dashscope") {
    return "qwen";
  }
  return null;
}

function isProviderConfigured(provider) {
  return provider === "seed" ? Boolean(config.seedApiKey) : Boolean(config.qwenApiKey);
}

function hasAnyModelProvider() {
  return isProviderConfigured("seed") || isProviderConfigured("qwen");
}

function providerAvailability() {
  return {
    seed: isProviderConfigured("seed"),
    qwen: isProviderConfigured("qwen"),
  };
}

function resolveModelProvider(requestedProvider = null) {
  const candidates = [requestedProvider, config.preferredProvider, "seed", "qwen"].filter(Boolean);
  const provider = candidates.find((candidate) => isProviderConfigured(candidate));
  if (!provider) {
    throw new Error("没有可用的票据识别模型，请配置 ARK_API_KEY 或 DASHSCOPE_API_KEY");
  }
  return provider;
}

function modelNameForProvider(provider, mimeType = "image/") {
  if (provider === "seed") {
    return config.seedModel;
  }
  return mimeType === "application/pdf"
    ? config.qwenLlmModel
    : config.qwenVisionModel || config.qwenMultimodalModel;
}

function publicModelConfig(provider = null) {
  const activeProvider = hasAnyModelProvider() ? resolveModelProvider(provider) : null;
  return {
    llm: config.qwenLlmModel,
    vision: config.qwenVisionModel,
    multimodal: config.qwenMultimodalModel,
    seed: config.seedModel,
    activeProvider,
    active: activeProvider ? modelNameForProvider(activeProvider) : "",
  };
}

function isOssConfigured() {
  return Boolean(
    config.ossRegion &&
      config.ossBucket &&
      config.ossAccessKeyId &&
      config.ossAccessKeySecret,
  );
}

function analysisOptionsFromBody(body) {
  const month = typeof body?.month === "string" ? body.month : "";
  return {
    month,
    rangeStart: normalizeRangeDate(body?.rangeStart, month),
    rangeEnd: normalizeRangeDate(body?.rangeEnd, month),
    referenceDate: normalizeReferenceDate(body?.referenceDate, month),
    exchangeRate: Number(body?.exchangeRate) || 7.21,
    audExchangeRate: Number(body?.audExchangeRate) || 4.7,
    twdExchangeRate: Number(body?.twdExchangeRate) || 0.23,
  };
}

function normalizeRangeDate(value, month) {
  if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])-\d{2}$/.test(value)) {
    return "";
  }
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
    return "";
  }
  const range = getMonthDateRange(month);
  return value >= range.start && value <= range.end ? value : "";
}

async function analyzeFileWithFallback(file, options, provider) {
  try {
    const expenses = await analyzeFile(file, options, provider);
    if (expenses.length === 0) {
      throw new Error("模型结果未包含可验证的消费记录");
    }
    return {
      expenses,
      provider,
      warning: "",
    };
  } catch (error) {
    const fallbackProvider = provider === "seed" ? "qwen" : "seed";
    if (!isProviderConfigured(fallbackProvider)) {
      throw error;
    }

    const expenses = await analyzeFile(file, options, fallbackProvider);
    return {
      expenses,
      provider: fallbackProvider,
      warning: `${modelNameForProvider(provider, file.mimetype)} 失败，已回退 ${modelNameForProvider(fallbackProvider, file.mimetype)}：${error instanceof Error ? error.message : "识别失败"}`,
    };
  }
}

async function analyzeFile(file, options, provider) {
  if (file.mimetype.startsWith("image/")) {
    return analyzeImage(file, options, provider);
  }

  if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
    return analyzePdf(file, options, provider);
  }

  throw new Error("仅支持图片或 PDF 文件");
}

async function analyzeImage(file, options, provider) {
  const imageUrl = await getModelFileUrl(file);
  const prompt = createReceiptPrompt({
    filename: file.originalname,
    month: options.month,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    referenceDate: options.referenceDate,
    exchangeRate: options.exchangeRate,
    audExchangeRate: options.audExchangeRate,
    twdExchangeRate: options.twdExchangeRate,
    mode: "image",
  });
  const systemText =
    "你是严谨的中文财务票据识别助手。只输出 JSON，不输出解释。无法确定的字段使用合理短文本，不要编造大额消费。";
  const content =
    provider === "seed"
      ? await callArkResponses({
          apiKey: config.seedApiKey,
          baseUrl: config.seedBaseUrl,
          model: config.seedModel,
          prompt: `${systemText}\n\n${prompt}`,
          imageUrl,
        })
      : await callChatCompletions({
          apiKey: config.qwenApiKey,
          baseUrl: config.qwenBaseUrl,
          model: config.qwenVisionModel || config.qwenMultimodalModel,
          messages: [
            { role: "system", content: systemText },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        });

  return normalizeExpenses(
    parseModelJson(content),
    file.originalname,
    options.month,
    options.attachment,
    file.mimetype,
    options.rangeEnd,
    options.referenceDate,
  );
}

async function analyzePdf(file, options, provider) {
  const parser = new PDFParse({ data: file.buffer });
  const data = await parser.getText();
  await parser.destroy();
  const text = data.text?.trim();

  if (!text) {
    throw new Error("该 PDF 未包含可提取文本，请上传消费截图或文本型 PDF");
  }

  const systemText =
    "你是严谨的中文财务票据整理助手。只输出 JSON，不输出解释。无法确定的字段使用合理短文本。";
  const prompt = `${createReceiptPrompt({
    filename: file.originalname,
    month: options.month,
    rangeStart: options.rangeStart,
    rangeEnd: options.rangeEnd,
    referenceDate: options.referenceDate,
    exchangeRate: options.exchangeRate,
    audExchangeRate: options.audExchangeRate,
    twdExchangeRate: options.twdExchangeRate,
    mode: "pdf-text",
  })}\n\nPDF 文本：\n${text.slice(0, 12000)}`;
  const content =
    provider === "seed"
      ? await callArkResponses({
          apiKey: config.seedApiKey,
          baseUrl: config.seedBaseUrl,
          model: config.seedModel,
          prompt: `${systemText}\n\n${prompt}`,
        })
      : await callChatCompletions({
          apiKey: config.qwenApiKey,
          baseUrl: config.qwenBaseUrl,
          model: config.qwenLlmModel,
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: prompt },
          ],
        });

  return normalizeExpenses(
    parseModelJson(content),
    file.originalname,
    options.month,
    options.attachment,
    file.mimetype,
    options.rangeEnd,
    options.referenceDate,
  );
}

async function getModelFileUrl(file) {
  if (config.useOss && isOssConfigured()) {
    return uploadToOss(file);
  }

  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

async function uploadToOss(file) {
  const { default: OSS } = await import("ali-oss");
  const client = new OSS({
    accessKeyId: config.ossAccessKeyId,
    accessKeySecret: config.ossAccessKeySecret,
    bucket: config.ossBucket,
    region: config.ossRegion,
  });
  const safeName = file.originalname.replace(/[^\w.-]+/g, "-");
  const objectName = `${config.ossPrefix}/${Date.now()}-${safeName}`;

  await client.put(objectName, file.buffer, {
    headers: {
      "Content-Type": file.mimetype,
    },
  });

  return client.signatureUrl(objectName, { expires: 900 });
}

function createReceiptPrompt({
  filename,
  month,
  rangeStart,
  rangeEnd,
  referenceDate,
  exchangeRate,
  audExchangeRate,
  twdExchangeRate,
  mode,
}) {
  const monthHint = month ? `${month} 月` : "当前月份";
  const validRange =
    /^\d{4}-\d{2}-\d{2}$/.test(rangeStart ?? "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(rangeEnd ?? "") &&
    rangeStart <= rangeEnd;
  const fallbackDate = getReceiptFallbackDate(month, validRange ? rangeEnd : "", referenceDate);
  const referenceDateHint = referenceDate || fallbackDate;
  return `请从${mode === "image" ? "消费截图/票据图片" : "PDF 文本"}中识别消费记录并整理成 JSON。
文件名：${filename}
月份提示：${monthHint}
日期提示：只使用票据中能够证明实际支付/扣款的日期；“Today/今天”按上传参考日 ${referenceDateHint} 处理；“下次扣费、续费、到期、周期结束”等计划日期不能作为消费日期。没有实际支付日期时使用 ${fallbackDate}。
汇率：1 USD = ${exchangeRate} CNY；1 AUD = ${audExchangeRate} CNY；1 TWD = ${twdExchangeRate} CNY

输出格式必须是严格 JSON：
{
  "expenses": [
    {
      "date": "YYYY-MM-DD",
      "description": "消费描述",
      "category": "交通|餐饮|购物|住房|办公|差旅|订阅",
      "originalAmount": 123.45,
      "currency": "CNY|USD|AUD|TWD",
      "amountText": "截图/PDF 中最终实付金额的完整原文，例如 实付款 ¥88.00、Total A$185.29、NT$3,300.00",
      "currencyEvidence": "能证明币种的原文，例如 ¥、元、USD、US$、AUD、A$、AU$、NT$；没有就填空字符串",
      "paymentMethod": "付款方式/支付通道原文，例如 BOC Debit Card(5018)",
      "merchant": "商家",
      "status": "unreported",
      "note": "备注",
      "recurring": false,
      "confidence": 0-100,
      "evidenceText": "截图/PDF 中能证明这笔金额的原文片段"
    }
  ]
}

规则：
- 只返回 JSON，不要 Markdown。
- 如果票据中有多笔消费，全部列出。
- status 默认 unreported，除非票据明确写已报销。
- date 缺失、只出现 Today/今天、日期含糊，或只出现未来的续费/到期计划日期时，使用上述上传参考日/兜底日期；不要因为筛选范围的结束日而猜测消费日期。
- category 必须从枚举中选择。
- 金额是原始币种金额，不要把 USD、AUD 或 TWD 改写成 CNY；前端会换算人民币。
- originalAmount 和 amountText 必须对应消费者最终实际支付/扣款的金额。优先识别“实付、实付款、实际支付、支付金额、付款金额、已支付、成交金额、Total paid、Amount charged、Grand total”。
- 优惠金额不是消费金额。绝不能把“优惠、优惠券、折扣、立减、满减、红包、补贴、抵扣、已省、节省、原价、划线价”对应的数字写入 originalAmount 或 amountText。
- 多金额订单必须比较金额标签，例如“商品总额 ¥29.90，优惠 ¥4.00，实付款 ¥25.90”只能输出 originalAmount: 25.90、amountText: "实付款 ¥25.90"，不能输出 29.90 或 4.00，也不能把优惠另建为消费记录。
- 如果图片只显示优惠金额而最终实付金额不可见，不要生成该笔消费，不要用商品原价减优惠自行推算。
- originalAmount 必须来自 amountText，去掉支出负号后输出正数；不要从订单号、商户订单号、卡号尾号、手机号、时间、积分中取数。
- NT$、NTD、TWD、新台币必须输出 currency: "TWD"，例如 NT$3,300.00 输出 originalAmount: 3300, currency: "TWD"。
- AUD、A$、AU$、澳元、澳币、Australian dollars 必须输出 currency: "AUD"，例如 A$185.29 输出 originalAmount: 185.29, currency: "AUD"；A$ 和 AU$ 绝不是 USD。
- 裸 "$" 只有在票据没有 AUD/A$/AU$/其他国家币种证据时才能判为 USD；明确币种代码和带国家前缀的货币符号优先于裸 "$"。
- 支付宝、微信支付、银联、银行借记卡/储蓄卡、中文收款方或国内商户的付款详情页，如果 amountText 只显示“-100.00/100.00”且 currencyEvidence 为空，currency 必须输出 "CNY"。
- 不要因为页面字段是英文（如 Transaction successful、Payment method）就推断为 USD；币种必须来自金额符号、币种词或明确支付上下文。
- 支出截图里的负号只表示扣款方向，originalAmount 使用正数，例如“-100.00”输出 100。
- 只有截图/PDF 中出现明确金额时才生成消费记录；订单号、运单号、手机号、二维码文字、收款码信息不能当作金额。
- “总共/合计 677，含运费”只是一笔总额，不要再拆出一笔物流/运费；除非图片里另有明确“运费 xx 元”。
- 如果只看到物流公司和单号，但没有物流费用金额，不要生成物流运输费记录。
- evidenceText 必须包含可见金额原文和关键上下文。多金额订单要同时保留商品金额、优惠和最终实付附近的原文，例如“商品总额 ¥29.90；优惠 ¥4.00；实付款 ¥25.90”；其他例子包括“-100.00 Transaction successful, BOC Debit Card(5018)”“总共677，含运费”“Total A$185.29 AUD”。
- confidence 根据识别把握度给 0-100。`;
}

function parseModelJson(content) {
  const trimmed = content.trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return direct;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    const parsed = tryParseJson(fenced.trim());
    if (parsed) {
      return parsed;
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParseJson(trimmed.slice(start, end + 1));
    if (parsed) {
      return parsed;
    }
  }

  throw new Error("模型返回内容不是有效 JSON");
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeExpenses(
  payload,
  filename,
  month,
  attachment,
  mimeType = "",
  rangeEnd = "",
  referenceDate = "",
) {
  const rawExpenses = Array.isArray(payload) ? payload : payload.expenses;
  if (!Array.isArray(rawExpenses)) {
    throw new Error("模型 JSON 中缺少 expenses 数组");
  }

  const fallbackDate = getReceiptFallbackDate(month, rangeEnd, referenceDate);
  return rawExpenses.map((expense, index) => {
    const source = (attachment?.mimeType || mimeType).startsWith("image/") ? "上传图片" : "上传 PDF";
    return {
      id: `ai-${createId(8)}-${index}`,
      date: normalizeRecognizedReceiptDate(expense.date, {
        month,
        fallbackDate,
        referenceDate,
      }),
      description: stringOrFallback(expense.description, "消费记录"),
      category: normalizeCategory(expense.category),
      originalAmount: resolveOriginalAmount(expense),
      currency: inferCurrencyFromExpense({ ...expense, source }),
      merchant: stringOrFallback(expense.merchant, "未知商家"),
      status: expense.status === "reported" ? "reported" : "unreported",
      note: stringOrFallback(expense.note, filename.replace(/\.[^/.]+$/, "").slice(0, 24)),
      source,
      recurring: Boolean(expense.recurring),
      confidence: normalizeConfidence(expense.confidence),
      attachment,
      attachments: [],
      amountText: stringOrFallback(expense.amountText, ""),
      currencyEvidence: stringOrFallback(expense.currencyEvidence, ""),
      paymentMethod: stringOrFallback(expense.paymentMethod, ""),
      evidenceText: stringOrFallback(expense.evidenceText, ""),
    };
  }).filter((expense) => !isLikelyFalsePositiveExpense(expense));
}

function normalizeDate(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\//g, "-");
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : fallback;
}

function stringOrFallback(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const port = Number(process.env.API_PORT) || 8788;
const host = process.env.API_HOST || "127.0.0.1";
const server = app.listen(port, host, () => {
  console.log(`Expense AI API listening on http://${host}:${port}`);
});
server.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
process.stdin.resume();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
