import assert from "node:assert/strict";
import test from "node:test";
import {
  callArkResponses,
  extractArkResponseText,
  extractChatCompletionText,
} from "./model-clients.mjs";

test("extracts text from chat completions and Ark Responses payloads", () => {
  assert.equal(
    extractChatCompletionText({ choices: [{ message: { content: "{\"expenses\":[]}" } }] }),
    "{\"expenses\":[]}",
  );
  assert.equal(
    extractArkResponseText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "{\"expenses\":[]}" }],
        },
      ],
    }),
    "{\"expenses\":[]}",
  );
});

test("sends image receipts to the Ark Responses API", async () => {
  let requestUrl = "";
  let requestBody = null;
  const result = await callArkResponses({
    apiKey: "test-key",
    baseUrl: "https://ark.example/api/v3/",
    model: "doubao-seed-2-0-pro-260215",
    prompt: "识别票据",
    imageUrl: "data:image/png;base64,AAAA",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ output_text: "{\"expenses\":[]}" }),
      };
    },
  });

  assert.equal(requestUrl, "https://ark.example/api/v3/responses");
  assert.equal(requestBody.model, "doubao-seed-2-0-pro-260215");
  assert.deepEqual(requestBody.thinking, { type: "disabled" });
  assert.deepEqual(requestBody.input[0].content, [
    { type: "input_image", image_url: "data:image/png;base64,AAAA" },
    { type: "input_text", text: "识别票据" },
  ]);
  assert.equal(result, "{\"expenses\":[]}");
});
