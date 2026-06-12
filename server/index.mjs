import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { PDFParse } from "pdf-parse";
import { fileURLToPath } from "node:url";
import {
  inferCurrencyFromExpense,
  isLikelyFalsePositiveExpense,
  normalizeCategory,
  normalizeConfidence,
  resolveOriginalAmount,
} from "./expense-normalizer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });
dotenv.config({ path: path.join(rootDir, ".env") });

const app = express();
const upload = multer({
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 8,
  },
  storage: multer.memoryStorage(),
});

const config = {
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
  baseUrl: process.env.DASHSCOPE_API_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
  llmModel: process.env.DASHSCOPE_LLM_MODEL ?? "qwen3.7-plus",
  visionModel: process.env.DASHSCOPE_VISION_MODEL ?? "qwen-vl-plus",
  multimodalModel: process.env.DASHSCOPE_MULTIMODAL_MODEL ?? "qwen-vl-plus",
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

await fs.mkdir(billsDir, { recursive: true });
await fs.mkdir(attachmentsDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    hasApiKey: Boolean(config.apiKey),
    models: publicModelConfig(),
    oss: {
      enabled: config.useOss,
      configured: isOssConfigured(),
    },
  });
});

app.get("/api/model-config", (_request, response) => {
  response.json({
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

  response.type(attachment.mimeType);
  response.setHeader("Cache-Control", "private, max-age=86400");
  response.setHeader(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
  );
  response.sendFile(path.join(getBillAttachmentsDir(billId), attachment.filename));
});

app.post("/api/bills/:billId/analyze-expenses", upload.array("files"), async (request, response) => {
  try {
    const billId = normalizeId(request.params.billId);
    if (!billId) {
      response.status(400).json({ error: "账单 ID 无效" });
      return;
    }

    if (!config.apiKey) {
      response.status(500).json({ error: "本地 DASHSCOPE_API_KEY 未配置" });
      return;
    }

    const files = request.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      response.status(400).json({ error: "请上传至少一个消费截图或 PDF" });
      return;
    }

    const month = typeof request.body.month === "string" ? request.body.month : "";
    const exchangeRate = Number(request.body.exchangeRate) || 7.21;
    const expenses = [];
    const warnings = [];

    for (const file of files) {
      const attachment = await saveAttachment(billId, file);
      try {
        const result = await analyzeFile(file, { month, exchangeRate, attachment });
        expenses.push(...result);
      } catch (error) {
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
      models: publicModelConfig(),
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "消费识别服务异常" });
  }
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
  return {
    id,
    currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    expenses: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function getBillPath(id) {
  return path.join(billsDir, `${id}.json`);
}

async function readBill(id) {
  try {
    const raw = await fs.readFile(getBillPath(id), "utf8");
    return normalizeBillPayload(id, JSON.parse(raw));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    const bill = createDefaultBill(id);
    await saveBill(bill);
    return bill;
  }
}

async function saveBill(bill) {
  await fs.mkdir(billsDir, { recursive: true });
  const normalized = normalizeBillPayload(bill.id, bill);
  const target = getBillPath(normalized.id);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(temporary, target);
}

function normalizeBillPayload(id, payload) {
  const now = new Date().toISOString();
  const currentMonth =
    typeof payload?.currentMonth === "string" && /^\d{4}-\d{2}$/.test(payload.currentMonth)
      ? payload.currentMonth
      : createDefaultBill(id).currentMonth;

  return {
    id,
    currentMonth,
    expenses: Array.isArray(payload?.expenses)
      ? payload.expenses.map(normalizeExpensePayload).filter((expense) => !isLikelyFalsePositiveExpense(expense))
      : [],
    createdAt: typeof payload?.createdAt === "string" ? payload.createdAt : now,
    updatedAt: now,
  };
}

function normalizeExpensePayload(expense, index) {
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
    attachment: normalizeAttachmentPayload(expense?.attachment),
    evidenceText: stringOrFallback(expense?.evidenceText, ""),
  };
}

function normalizeAttachmentPayload(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const id = normalizeId(attachment.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: stringOrFallback(attachment.name, "上传附件"),
    mimeType: stringOrFallback(attachment.mimeType, "application/octet-stream"),
    size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
    url: stringOrFallback(attachment.url, ""),
  };
}

function getBillAttachmentsDir(billId) {
  return path.join(attachmentsDir, billId);
}

async function saveAttachment(billId, file) {
  const id = createId(12);
  const billAttachmentsDir = getBillAttachmentsDir(billId);
  await fs.mkdir(billAttachmentsDir, { recursive: true });
  const safeOriginalName = file.originalname.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-");
  const extension = path.extname(safeOriginalName) || mimeExtension(file.mimetype);
  const filename = `${id}${extension}`;
  const attachment = {
    id,
    name: file.originalname,
    mimeType: file.mimetype || "application/octet-stream",
    size: file.size,
    filename,
    url: `api/bills/${billId}/attachments/${id}`,
  };

  await fs.writeFile(path.join(billAttachmentsDir, filename), file.buffer);
  await fs.writeFile(
    path.join(billAttachmentsDir, `${id}.json`),
    JSON.stringify(attachment, null, 2),
    "utf8",
  );

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

function mimeExtension(mimeType) {
  if (mimeType === "application/pdf") {
    return ".pdf";
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
  return ".jpg";
}

function publicModelConfig() {
  return {
    llm: config.llmModel,
    vision: config.visionModel,
    multimodal: config.multimodalModel,
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

async function analyzeFile(file, options) {
  if (file.mimetype.startsWith("image/")) {
    return analyzeImage(file, options);
  }

  if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
    return analyzePdf(file, options);
  }

  throw new Error("仅支持图片或 PDF 文件");
}

async function analyzeImage(file, options) {
  const imageUrl = await getModelFileUrl(file);
  const content = await callChatCompletions({
    model: config.visionModel || config.multimodalModel,
    messages: [
      {
        role: "system",
        content:
          "你是严谨的中文财务票据识别助手。只输出 JSON，不输出解释。无法确定的字段使用合理短文本，不要编造大额消费。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: createReceiptPrompt({ filename: file.originalname, month: options.month, exchangeRate: options.exchangeRate, mode: "image" }) },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return normalizeExpenses(parseModelJson(content), file.originalname, options.month, options.attachment);
}

async function analyzePdf(file, options) {
  const parser = new PDFParse({ data: file.buffer });
  const data = await parser.getText();
  await parser.destroy();
  const text = data.text?.trim();

  if (!text) {
    throw new Error("该 PDF 未包含可提取文本，请上传消费截图或文本型 PDF");
  }

  const content = await callChatCompletions({
    model: config.llmModel,
    messages: [
      {
        role: "system",
        content:
          "你是严谨的中文财务票据整理助手。只输出 JSON，不输出解释。无法确定的字段使用合理短文本。",
      },
      {
        role: "user",
        content: `${createReceiptPrompt({
          filename: file.originalname,
          month: options.month,
          exchangeRate: options.exchangeRate,
          mode: "pdf-text",
        })}\n\nPDF 文本：\n${text.slice(0, 12000)}`,
      },
    ],
  });

  return normalizeExpenses(parseModelJson(content), file.originalname, options.month, options.attachment);
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

function createReceiptPrompt({ filename, month, exchangeRate, mode }) {
  const monthHint = month ? `${month} 月` : "当前月份";
  return `请从${mode === "image" ? "消费截图/票据图片" : "PDF 文本"}中识别消费记录并整理成 JSON。
文件名：${filename}
月份提示：${monthHint}
汇率：1 USD = ${exchangeRate} CNY

输出格式必须是严格 JSON：
{
  "expenses": [
    {
      "date": "YYYY-MM-DD",
      "description": "消费描述",
      "category": "交通|餐饮|购物|住房|办公|差旅|订阅",
      "originalAmount": 123.45,
      "currency": "CNY|USD|TWD",
      "amountText": "截图/PDF 中原样可见的金额文本，例如 -100.00、¥88.00、NT$3,300.00",
      "currencyEvidence": "能证明币种的原文，例如 ¥、元、USD、$、NT$；没有就填空字符串",
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
- date 缺失时使用月份提示内最可能日期；仍无法判断时使用该月最后一天。
- category 必须从枚举中选择。
- 金额是原始币种金额，不要把 USD 或 TWD 改写成 CNY；前端会换算人民币。
- originalAmount 必须来自 amountText，去掉支出负号后输出正数；不要从订单号、商户订单号、卡号尾号、手机号、时间、积分中取数。
- NT$、NTD、TWD、新台币必须输出 currency: "TWD"，例如 NT$3,300.00 输出 originalAmount: 3300, currency: "TWD"。
- 支付宝、微信支付、银联、银行借记卡/储蓄卡、中文收款方或国内商户的付款详情页，如果 amountText 只显示“-100.00/100.00”且 currencyEvidence 为空，currency 必须输出 "CNY"。
- 不要因为页面字段是英文（如 Transaction successful、Payment method）就推断为 USD；币种必须来自金额符号、币种词或明确支付上下文。
- 支出截图里的负号只表示扣款方向，originalAmount 使用正数，例如“-100.00”输出 100。
- 只有截图/PDF 中出现明确金额时才生成消费记录；订单号、运单号、手机号、二维码文字、收款码信息不能当作金额。
- “总共/合计 677，含运费”只是一笔总额，不要再拆出一笔物流/运费；除非图片里另有明确“运费 xx 元”。
- 如果只看到物流公司和单号，但没有物流费用金额，不要生成物流运输费记录。
- evidenceText 必须包含可见金额原文和关键上下文，例如“-100.00 Transaction successful, BOC Debit Card(5018)”或“总共677，含运费”或“¥ 88.00”。
- confidence 根据识别把握度给 0-100。`;
}

async function callChatCompletions({ model, messages }) {
  const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型调用失败 ${response.status}: ${detail.slice(0, 240)}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(message)) {
    return message.map((item) => item.text ?? "").join("\n");
  }
  if (typeof message === "string") {
    return message;
  }

  throw new Error("模型未返回可解析内容");
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

function normalizeExpenses(payload, filename, month, attachment) {
  const rawExpenses = Array.isArray(payload) ? payload : payload.expenses;
  if (!Array.isArray(rawExpenses)) {
    throw new Error("模型 JSON 中缺少 expenses 数组");
  }

  const fallbackDate = getFallbackDate(month);
  return rawExpenses.map((expense, index) => {
    const source = attachment?.mimeType?.startsWith("image/") ? "上传图片" : "上传 PDF";
    return {
      id: `ai-${createId(8)}-${index}`,
      date: normalizeDate(expense.date, fallbackDate),
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
      evidenceText: stringOrFallback(expense.evidenceText, ""),
    };
  }).filter((expense) => !isLikelyFalsePositiveExpense(expense));
}

function getFallbackDate(month) {
  const match = typeof month === "string" ? month.match(/^(\d{4})-(\d{2})$/) : null;
  if (!match) {
    return new Date().toISOString().slice(0, 10);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${year}-${String(monthIndex).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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
