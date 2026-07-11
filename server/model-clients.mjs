export async function callChatCompletions({
  apiKey,
  baseUrl,
  model,
  messages,
  fetchImpl = fetch,
}) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  return extractChatCompletionText(await response.json());
}

export async function callArkResponses({
  apiKey,
  baseUrl,
  model,
  prompt,
  imageUrl = "",
  fetchImpl = fetch,
}) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/responses`;
  const content = [];
  if (imageUrl) {
    content.push({ type: "input_image", image_url: imageUrl });
  }
  content.push({ type: "input_text", text: prompt });

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      thinking: { type: "disabled" },
      max_output_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Seed2.0 调用失败 ${response.status}: ${detail.slice(0, 240)}`);
  }

  return extractArkResponseText(await response.json());
}

export function extractChatCompletionText(payload) {
  const message = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(message)) {
    const text = message.map((item) => item?.text ?? "").join("\n").trim();
    if (text) {
      return text;
    }
  }
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  throw new Error("模型未返回可解析内容");
}

export function extractArkResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const text = Array.isArray(payload?.output)
    ? payload.output
        .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
        .filter((item) => item?.type === "output_text" && typeof item.text === "string")
        .map((item) => item.text)
        .join("\n")
        .trim()
    : "";

  if (text) {
    return text;
  }

  throw new Error("Seed2.0 未返回可解析内容");
}
