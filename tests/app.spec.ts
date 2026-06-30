import { expect, test } from "@playwright/test";

test("管理月度消费、上传票据、迁移下月和触发导出", async ({ page }) => {
  const app = page.locator(".print-shell");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz8eVgAAAABJRU5ErkJggg==",
    "base64",
  );
  let analyzeCallCount = 0;

  await page.route("**/api/bills/e2e-test", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "e2e-test",
            currentMonth: "2024-05",
            expenses: [],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ bill: await route.request().postDataJSON() }),
    });
  });

  await page.route("**/api/bills/e2e-test/analyze-expenses", async (route) => {
    analyzeCallCount += 1;
    const expenses =
      analyzeCallCount === 1
        ? [
            {
              id: "test-uber-1",
              date: "2024-05-28",
              description: "Uber Receipt",
              category: "交通",
              originalAmount: 22.8,
              currency: "USD",
              merchant: "Uber",
              status: "unreported",
              note: "模型识别",
              source: "上传图片",
              confidence: 95,
              attachment: {
                id: "att-uber",
                name: "uber-receipt.png",
                mimeType: "image/png",
                size: 68,
                url: "api/bills/e2e-test/attachments/att-uber",
              },
            },
            {
              id: "test-uber-2",
              date: "2024-05-27",
              description: "Uber Receipt 2",
              category: "交通",
              originalAmount: 164,
              currency: "CNY",
              merchant: "Uber",
              status: "unreported",
              note: "模型识别",
              source: "上传图片",
              confidence: 91,
              attachment: {
                id: "att-uber",
                name: "uber-receipt.png",
                mimeType: "image/png",
                size: 68,
                url: "api/bills/e2e-test/attachments/att-uber",
              },
            },
          ]
        : [
            {
              id: "test-clipboard-1",
              date: "2024-05-26",
              description: "Clipboard Receipt",
              category: "办公",
              originalAmount: 30,
              currency: "CNY",
              merchant: "Clipboard Shop",
              status: "unreported",
              note: "剪贴板图片",
              source: "粘贴图片",
              confidence: 90,
            },
          ];

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        expenses,
        warnings: [],
        models: {
          vision: "qwen-vl-plus",
        },
      }),
    });
  });

  await page.route("**/api/bills/e2e-test/attachments/att-uber", async (route) => {
    await route.fulfill({
      body: png,
      contentType: "image/png",
    });
  });

  await page.goto("/#bill=e2e-test");

  await expect(app.getByRole("heading", { name: "月度消费管理" })).toBeVisible();
  await expect(app.getByRole("button", { name: "选择月份" })).toContainText("2024年5月");
  await expect(app.getByText("当月总金额（人民币）")).toBeVisible();
  await expect(app.getByText("当前月份暂无消费记录")).toBeVisible();

  const uploadZone = app.getByRole("button", { name: "上传消费截图或 PDF" });
  const dropData = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["receipt"], "uber-receipt.png", { type: "image/png" }));
    return dataTransfer;
  });
  await uploadZone.dispatchEvent("drop", { dataTransfer: dropData });

  await expect(app.getByText(/已生成 2 条/)).toBeVisible({ timeout: 4000 });
  await expect(app.getByText("Uber Receipt", { exact: true })).toBeVisible();
  await expect(app.locator("thead th").filter({ hasText: /^金额$/ })).toBeVisible();
  await expect(app.locator("thead th").filter({ hasText: "金额（原币）" })).toHaveCount(0);
  await expect(app.locator("thead th").filter({ hasText: "金额（CNY）" })).toHaveCount(0);
  await expect(app.getByText("（原币 $22.80）")).toBeVisible();
  await expect(app.getByText("¥164.39")).toBeVisible();
  await expect(app.locator('button[title="删除"]')).toHaveCount(0);

  await app.getByText("（原币 $22.80）").click();
  const amountInput = app.locator('input[aria-label="修改金额"]').first();
  await expect(amountInput).toHaveValue("22.8");
  await amountInput.fill("30");
  await expect(amountInput).toHaveValue("30");
  await expect(app.getByText("¥216.30")).toBeVisible();
  await expect(app.locator("p.text-3xl").filter({ hasText: "¥380.30" })).toBeVisible();
  await amountInput.press("Enter");
  await expect(app.getByText("（原币 $30.00）")).toBeVisible();

  const categorySelect = app.getByLabel("修改消费类型").first();
  await categorySelect.selectOption("差旅");
  await expect(categorySelect).toHaveValue("差旅");

  const statusSelect = app.getByLabel("修改报销状态").first();
  await statusSelect.selectOption("reported");
  await expect(statusSelect).toHaveValue("reported");
  await statusSelect.selectOption("unreported");
  await expect(statusSelect).toHaveValue("unreported");

  await uploadZone.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["receipt"], "clipboard.png", { type: "image/png" }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dataTransfer });
    element.dispatchEvent(event);
  });
  await expect(app.getByText("Clipboard Receipt", { exact: true })).toBeVisible({ timeout: 4000 });

  const sourceButtons = app.locator('button[title="uber-receipt.png"]');
  await expect(sourceButtons).toHaveCount(2);

  await sourceButtons.first().click();
  await expect(page.getByRole("button", { name: "关闭预览" })).toBeVisible();
  await page.getByRole("button", { name: "关闭预览" }).click();

  await app.getByRole("button", { name: "结转到下月" }).click();

  await expect(app.getByRole("button", { name: "选择月份" })).toContainText("2024年6月");
  await expect(app.getByText("Uber Receipt（结转）", { exact: true })).toBeVisible();
  const carriedRow = app.locator("tbody tr").filter({ hasText: "Uber Receipt（结转）" }).first();
  await expect(carriedRow).toContainText("2024/06/01");
  await expect(carriedRow).toContainText("原日期 2024/05/28");

  await app.getByPlaceholder("搜索商家、备注").fill("Uber Receipt（结转）");
  await expect(app.getByText("共 1 条记录")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await app.getByRole("button", { name: "导出 PDF" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^月度消费-2024-06-全部-搜索-UberReceipt（结转）-\d+\.pdf$/,
  );
});
