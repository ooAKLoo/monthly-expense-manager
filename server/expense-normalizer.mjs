const categories = new Set(["交通", "餐饮", "购物", "住房", "办公", "差旅", "订阅"]);

const cnyPaymentContextPattern =
  /支付宝|微信支付|银联|云闪付|余额充值|余额|付款|已付款|支付成功|收款|交易成功|国内商户|中文收款方|借记卡|储蓄卡|中国银行|工商银行|农业银行|建设银行|招商银行|交通银行|邮储银行|中信银行|光大银行|民生银行|浦发银行|广发银行|华夏银行|平安银行|BOC\s+Debit\s+Card/i;
const chineseMerchantPattern =
  /[\u4e00-\u9fa5]{2,}(?:有限公司|公司|商户|商行|店|科技|餐饮|酒店|银行|超市|便利|集团)/;
const amountContextPattern =
  /金额|实付|付款|支付|交易|合计|总共|总计|充值|扣款|消费|收款|total|amount|paid|payment|transaction/i;
const identifierContextPattern =
  /订单号|商户订单|运单号|单号|流水号|手机号|卡号|尾号|order\s*no|merchant\s*order|tracking|serial|phone|card/i;

export function normalizeCategory(value) {
  return categories.has(value) ? value : "办公";
}

export function normalizeCurrency(value) {
  if (value === "USD" || value === "TWD") {
    return value;
  }
  return "CNY";
}

export function normalizeAmount(value) {
  const amount = typeof value === "string" ? parseAmountToken(value) : Number(value);
  const absoluteAmount = Math.abs(amount);
  return Number.isFinite(absoluteAmount) && absoluteAmount > 0 ? Number(absoluteAmount.toFixed(2)) : 0;
}

export function resolveOriginalAmount(expense) {
  const declaredAmountText = normalizeAmount(expense?.amountText);
  if (declaredAmountText > 0) {
    return declaredAmountText;
  }

  const parsed =
    extractLikelyAmount(expense?.evidenceText) ??
    extractLikelyAmount(expense?.currencyEvidence);

  return parsed ?? normalizeAmount(expense?.originalAmount ?? expense?.amount);
}

export function inferCurrencyFromExpense(expense) {
  const normalized = normalizeCurrency(expense?.currency);
  const text = collectEvidenceText(expense);

  if (hasExplicitTwdCurrencyEvidence(text)) {
    return "TWD";
  }

  if (hasExplicitCnyCurrencyEvidence(text)) {
    return "CNY";
  }

  if (hasExplicitUsdCurrencyEvidence(text)) {
    return "USD";
  }

  if (hasLikelyCnyPaymentContext(text)) {
    return "CNY";
  }

  return normalized;
}

export function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return 80;
  }
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

export function isLikelyFalsePositiveExpense(expense) {
  const text = collectEvidenceText(expense);
  const generatedSource = /上传|模型|AI|截图|PDF/.test(expense?.source ?? "");
  const logisticsSignal = /物流|运输|运费|快递|速通|运单|订单号|单号|tracking|express/i.test(text);
  const trackingOnlySignal = /(?:订单号|运单号|单号|tracking)\s*[：:]?\s*[A-Z0-9-]{8,}/i.test(text);
  const explicitAmountEvidence =
    hasExplicitAmountEvidence(expense?.amountText) || hasExplicitAmountEvidence(expense?.evidenceText);
  const explicitShippingAmount = hasExplicitShippingAmount(expense?.evidenceText);
  const amount = normalizeAmount(expense?.originalAmount ?? expense?.amount);

  if (amount <= 0) {
    return true;
  }

  if (generatedSource && isIdentifierLikeAmount(amount) && !explicitAmountEvidence) {
    return true;
  }

  if (generatedSource && identifierContextPattern.test(text) && amount >= 100000 && !explicitAmountEvidence) {
    return true;
  }

  if (generatedSource && logisticsSignal && trackingOnlySignal && amount <= 1 && !explicitAmountEvidence) {
    return true;
  }

  if (generatedSource && logisticsSignal && amount <= 1 && !explicitShippingAmount) {
    return true;
  }

  return false;
}

export function hasExplicitAmountEvidence(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  return extractLikelyAmount(value) !== null;
}

function extractLikelyAmount(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const text = normalizeMoneyText(value);
  const currencyMarked = findCurrencyMarkedAmount(text);
  if (currencyMarked !== null) {
    return currencyMarked;
  }

  if (!amountContextPattern.test(text)) {
    return null;
  }

  return findBestContextAmount(text);
}

function findCurrencyMarkedAmount(text) {
  const patterns = [
    /(?:NT\$|NTD|TWD|USD|US\$|RMB|CNY|¥|￥|\$)\s*([+\-]?\s*\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)/gi,
    /([+\-]?\s*\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:元|块|人民币|人民幣|USD|CNY|TWD|NTD|美元|美金)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = parseAmountToken(match[1]);
      if (amount > 0) {
        return amount;
      }
    }
  }

  return null;
}

function findBestContextAmount(text) {
  const candidates = [];
  const pattern = /(^|[^\d])([+\-]?\s*\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d])/g;

  for (const match of text.matchAll(pattern)) {
    const raw = match[2];
    const start = match.index + match[1].length;
    const end = start + raw.length;
    const amount = parseAmountToken(raw);
    if (amount <= 0) {
      continue;
    }

    const token = raw.replace(/[\s,+-]/g, "");
    const context = text.slice(Math.max(0, start - 36), Math.min(text.length, end + 36));
    let score = 0;
    if (amountContextPattern.test(context)) score += 60;
    if (/[-]/.test(raw)) score += 30;
    if (/\.\d{1,2}/.test(raw)) score += 20;
    if (identifierContextPattern.test(context)) score -= 80;
    if (looksLikeDateOrTime(token, context)) score -= 80;
    if (/^\d{5,}$/.test(token) && !/\.\d{1,2}/.test(raw)) score -= 60;

    if (score > 0) {
      candidates.push({ amount, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0]?.amount ?? null;
}

function parseAmountToken(value) {
  if (typeof value !== "string") {
    return Number(value);
  }

  const cleaned = normalizeMoneyText(value)
    .replace(/(?:NT\$|NTD|TWD|USD|US\$|RMB|CNY|¥|￥|\$|元|块|人民币|人民幣|美元|美金)/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  const match = cleaned.match(/[+-]?\d+(?:\.\d{1,2})?/);
  return match ? Math.abs(Number(match[0])) : Number.NaN;
}

function normalizeMoneyText(value) {
  return value.replace(/[−–—]/g, "-");
}

function looksLikeDateOrTime(token, context) {
  if (/^\d{4}$/.test(token) && /(?:20\d{2}|19\d{2})[-/年]/.test(context)) {
    return true;
  }
  if (/^\d{1,2}$/.test(token) && /[:：]\d{2}|\d{2}[:：]/.test(context)) {
    return true;
  }
  return /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[:：]\d{2}/.test(context) && !/\.\d{1,2}/.test(token);
}

function isIdentifierLikeAmount(amount) {
  return Number.isInteger(amount) && amount >= 10000000;
}

function hasExplicitTwdCurrencyEvidence(value) {
  return /(?:NT\$|NTD|TWD|新台币|新臺幣)/i.test(value);
}

function hasExplicitUsdCurrencyEvidence(value) {
  return /(?:USD|US\$|美元|美金|U\.S\.?\s*dollars?|\bdollars?\b|\$)\s*-?\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|美元|美金|\bdollars?\b)/i.test(
    value,
  );
}

function hasExplicitCnyCurrencyEvidence(value) {
  return /(?:¥|￥|RMB|CNY|人民币|人民幣|元|块)\s*-?\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:元|块|人民币|人民幣|RMB|CNY)/i.test(
    value,
  );
}

function hasLikelyCnyPaymentContext(value) {
  return cnyPaymentContextPattern.test(value) || chineseMerchantPattern.test(value);
}

function hasExplicitShippingAmount(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return /(?:运费|物流费|快递费|运输费)[^\d¥￥$]{0,8}(?:¥|￥|\$)?\s*\d[\d,]*(?:\.\d{1,2})?|(?:¥|￥|\$)?\s*\d[\d,]*(?:\.\d{1,2})?[^\d]{0,8}(?:运费|物流费|快递费|运输费)/.test(
    value,
  );
}

function collectEvidenceText(expense) {
  return [
    expense?.amountText,
    expense?.currencyEvidence,
    expense?.description,
    expense?.merchant,
    expense?.note,
    expense?.source,
    expense?.paymentMethod,
    expense?.evidenceText,
  ]
    .filter(Boolean)
    .join(" ");
}
