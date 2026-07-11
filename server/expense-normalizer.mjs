const categories = new Set(["交通", "餐饮", "购物", "住房", "办公", "差旅", "订阅"]);

const cnyPaymentContextPattern =
  /支付宝|微信支付|银联|云闪付|余额充值|余额|付款|已付款|支付成功|收款|交易成功|国内商户|中文收款方|借记卡|储蓄卡|中国银行|工商银行|农业银行|建设银行|招商银行|交通银行|邮储银行|中信银行|光大银行|民生银行|浦发银行|广发银行|华夏银行|平安银行|BOC\s+Debit\s+Card/i;
const chineseMerchantPattern =
  /[\u4e00-\u9fa5]{2,}(?:有限公司|公司|商户|商行|店|科技|餐饮|酒店|银行|超市|便利|集团)/;
const amountContextPattern =
  /金额|实付|付款|支付|交易|合计|总共|总计|充值|扣款|消费|收款|total|amount|paid|payment|transaction/i;
const finalPaymentContextPattern =
  /订单实付|实付(?:款|金额)?|实际(?:支付|付款)(?:金额)?|付款金额|支付金额|已支付|已付款|成交金额|扣款金额|amount\s*(?:paid|charged)|paid\s*(?:amount|total)|total\s*paid|grand\s*total|amount\s*due/i;
const totalAmountContextPattern =
  /商品(?:金额|总额|总价)|订单(?:金额|总额|总价)|应付(?:金额)?|合计|总计|总额|小计|共计|总共|subtotal|total|amount/i;
const discountContextPattern =
  /优惠(?:金额|券)?|优惠券|折扣|立减|满减|减免|共减|共优惠|已优惠|抵扣|补贴|红包|已省|节省|省下|划线价|原价|discount|coupon|voucher|saving/i;
const identifierContextPattern =
  /订单号|商户订单|运单号|单号|流水号|手机号|卡号|尾号|order\s*no|merchant\s*order|tracking|serial|phone|card/i;

export function normalizeCategory(value) {
  return categories.has(value) ? value : "办公";
}

export function normalizeCurrency(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "USD" || normalized === "AUD" || normalized === "TWD") {
    return normalized;
  }
  return "CNY";
}

export function normalizeAmount(value) {
  const amount = typeof value === "string" ? parseAmountToken(value) : Number(value);
  const absoluteAmount = Math.abs(amount);
  return Number.isFinite(absoluteAmount) && absoluteAmount > 0 ? Number(absoluteAmount.toFixed(2)) : 0;
}

export function resolveOriginalAmount(expense) {
  const evidenceText = [expense?.evidenceText, expense?.amountText, expense?.currencyEvidence]
    .filter(Boolean)
    .join(" ");
  const preferredPaymentAmount = extractPreferredPaymentAmount(evidenceText);
  if (preferredPaymentAmount !== null) {
    return preferredPaymentAmount;
  }

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

  if (hasExplicitAudCurrencyEvidence(text)) {
    return "AUD";
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

  if (generatedSource && isDiscountAmountWithoutFinalPayment(text, amount)) {
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
  const candidates = findAmountCandidates(text)
    .filter((candidate) => candidate.currencyMarked || amountContextPattern.test(text))
    .filter((candidate) => candidate.cue?.kind !== "discount")
    .filter((candidate) => candidate.score > 0)
    .sort(compareAmountCandidates);

  return candidates[0]?.amount ?? null;
}

function extractPreferredPaymentAmount(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const candidates = findAmountCandidates(normalizeMoneyText(value));
  const finalPayments = candidates
    .filter((candidate) => candidate.cue?.kind === "final")
    .sort(compareAmountCandidates);
  if (finalPayments.length > 0) {
    return finalPayments[0].amount;
  }

  if (candidates.some((candidate) => candidate.cue?.kind === "discount")) {
    return null;
  }

  const totals = candidates
    .filter((candidate) => candidate.cue?.kind === "total")
    .sort(compareAmountCandidates);
  return totals[0]?.amount ?? null;
}

function findAmountCandidates(text) {
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
    const before = text.slice(Math.max(0, start - 28), start);
    const after = text.slice(end, Math.min(text.length, end + 24));
    const currencyMarked = hasCurrencyMarkerBefore(before) || hasCurrencyMarkerAfter(after);
    const cue = findNearestAmountCue(text, start);
    let score = 0;
    if (currencyMarked) score += 70;
    if (amountContextPattern.test(context)) score += 50;
    if (/[-]/.test(raw)) score += 30;
    if (/\.\d{1,2}/.test(raw)) score += 20;
    if (cue?.kind === "final") score += 400 - cue.distance;
    if (cue?.kind === "total") score += 220 - cue.distance;
    if (cue?.kind === "discount") score -= 500;
    if (identifierContextPattern.test(context)) score -= 80;
    if (looksLikeDateOrTime(token, context)) score -= 80;
    if (/^\d{5,}$/.test(token) && !/\.\d{1,2}/.test(raw)) score -= 60;

    candidates.push({ amount, score, start, currencyMarked, cue });
  }

  return candidates;
}

function compareAmountCandidates(left, right) {
  return right.score - left.score || right.start - left.start;
}

function findNearestAmountCue(text, amountStart) {
  const prefixStart = Math.max(0, amountStart - 40);
  let prefix = text.slice(prefixStart, amountStart);
  const earlierAmounts = [
    ...prefix.matchAll(/[+\-]?\s*\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?/g),
  ];
  const nearestEarlierAmount = earlierAmounts.at(-1);
  if (nearestEarlierAmount) {
    prefix = prefix.slice(
      (nearestEarlierAmount.index ?? 0) + nearestEarlierAmount[0].length,
    );
  }
  const cues = [
    ...findCues(prefix, finalPaymentContextPattern, "final"),
    ...findCues(prefix, discountContextPattern, "discount"),
    ...findCues(prefix, totalAmountContextPattern, "total"),
  ];

  cues.sort((left, right) => {
    if (left.distance !== right.distance) {
      return left.distance - right.distance;
    }
    const priority = { final: 3, discount: 2, total: 1 };
    return priority[right.kind] - priority[left.kind];
  });
  return cues[0] ?? null;
}

function findCues(value, pattern, kind) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  const cues = [];
  for (const match of value.matchAll(matcher)) {
    cues.push({
      kind,
      distance: value.length - ((match.index ?? 0) + match[0].length),
    });
  }
  return cues;
}

function hasCurrencyMarkerBefore(value) {
  return /(?:NT\$|NTD|TWD|AU\$|A\$|AUD|USD|US\$|RMB|CNY|¥|￥|\$)\s*$/i.test(value);
}

function hasCurrencyMarkerAfter(value) {
  return /^\s*(?:元|块|人民币|人民幣|AUD|澳元|澳币|Australian\s+dollars?|USD|CNY|TWD|NTD|美元|美金)/i.test(
    value,
  );
}

function parseAmountToken(value) {
  if (typeof value !== "string") {
    return Number(value);
  }

  const cleaned = normalizeMoneyText(value)
    .replace(/(?:NT\$|NTD|TWD|AU\$|A\$|AUD|澳元|澳币|Australian\s+dollars?|USD|US\$|RMB|CNY|¥|￥|\$|元|块|人民币|人民幣|美元|美金)/gi, "")
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

function hasExplicitAudCurrencyEvidence(value) {
  return /(?:^|[^A-Z])(?:AUD|AU\$|A\$|澳元|澳币|澳幣|Australian\s+dollars?)\s*-?\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:AUD|澳元|澳币|澳幣|Australian\s+dollars?)/i.test(
    value,
  );
}

function hasExplicitUsdCurrencyEvidence(value) {
  return /(?:USD|US\$|美元|美金|U\.S\.?\s*dollars?|\bdollars?\b)\s*-?\d|(?<![A-Z])\$\s*-?\d|\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|美元|美金|\bdollars?\b)/i.test(
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

function isDiscountAmountWithoutFinalPayment(value, amount) {
  const candidates = findAmountCandidates(normalizeMoneyText(value));
  if (candidates.some((candidate) => candidate.cue?.kind === "final")) {
    return false;
  }

  return candidates.some(
    (candidate) =>
      candidate.cue?.kind === "discount" && Math.abs(candidate.amount - amount) < 0.005,
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
