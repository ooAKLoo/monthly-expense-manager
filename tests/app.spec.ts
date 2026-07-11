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

  const categorySelect = app.getByRole("combobox", { name: /修改消费类型/ }).first();
  await categorySelect.click();
  await expect(categorySelect).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("option", { name: "差旅", exact: true }).click();
  await expect(categorySelect).toContainText("差旅");
  await expect(categorySelect).toHaveAttribute("aria-expanded", "false");

  const statusSelect = app.getByRole("combobox", { name: /修改报销状态/ }).first();
  await statusSelect.click();
  await page.getByRole("option", { name: "已报销", exact: true }).click();
  await expect(statusSelect).toContainText("已报销");
  await statusSelect.press("ArrowDown");
  await statusSelect.press("Enter");
  await expect(statusSelect).toContainText("未报销");
  await statusSelect.click();
  await statusSelect.press("Escape");
  await expect(statusSelect).toHaveAttribute("aria-expanded", "false");

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

test("澳元按 AUD 汇率展示且订单使用实付金额", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz8eVgAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("**/api/bills/aud-test", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "aud-test",
            currentMonth: "2026-07",
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

  await page.route("**/api/bills/aud-test/analyze-expenses", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        expenses: [
          {
            id: "chatgpt-aud-1",
            date: "2026-07-31",
            description: "ChatGPT 订阅",
            category: "订阅",
            originalAmount: 185.29,
            currency: "AUD",
            merchant: "ChatGPT",
            status: "unreported",
            note: "IMG_7498",
            source: "上传图片",
            confidence: 98,
            evidenceText: "Total A$185.29 AUD",
          },
          {
            id: "chatgpt-aud-2",
            date: "2026-07-31",
            description: "ChatGPT 订阅",
            category: "订阅",
            originalAmount: 152.84,
            currency: "AUD",
            merchant: "ChatGPT",
            status: "unreported",
            note: "IMG_7499",
            source: "上传图片",
            confidence: 98,
            evidenceText: "Total AU$152.84",
          },
          {
            id: "glue-gun-paid",
            date: "2026-07-23",
            description: "绿林细嘴热熔胶枪成人手工",
            category: "购物",
            originalAmount: 25.9,
            currency: "CNY",
            merchant: "绿林官方旗舰店",
            status: "unreported",
            note: "",
            source: "上传图片",
            confidence: 96,
            evidenceText: "商品总额 ¥29.90；优惠金额 ¥4.00；实付款 ¥25.90",
            attachment: {
              id: "att-glue",
              name: "glue-gun.png",
              mimeType: "image/png",
              size: 68,
              url: "api/bills/aud-test/attachments/att-glue",
            },
          },
        ],
        warnings: [],
        models: { vision: "qwen-vl-plus" },
      }),
    });
  });

  await page.route("**/api/bills/aud-test/attachments/att-glue", async (route) => {
    await route.fulfill({ body: png, contentType: "image/png" });
  });

  await page.route(
    "**/api/bills/aud-test/attachments/att-glue/reanalyze-expenses",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          expenses: [
            {
              id: "glue-gun-repaired",
              date: "2026-07-23",
              description: "绿林细嘴热熔胶枪成人手工",
              category: "购物",
              originalAmount: 35.9,
              currency: "CNY",
              merchant: "绿林官方旗舰店",
              status: "unreported",
              note: "重新识别",
              source: "上传图片",
              confidence: 98,
              evidenceText: "商品金额 ¥39.90；优惠 ¥4.00；实付款 ¥35.90",
              attachment: {
                id: "att-glue",
                name: "glue-gun.png",
                mimeType: "image/png",
                size: 68,
                url: "api/bills/aud-test/attachments/att-glue",
              },
            },
          ],
          warnings: [],
          models: {
            activeProvider: "seed",
            active: "doubao-seed-2-0-lite-260428",
          },
        }),
      });
    },
  );

  await page.goto("/#bill=aud-test");
  const uploadZone = page.getByRole("button", { name: "上传消费截图或 PDF" });
  const dropData = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["receipt"], "expenses.png", { type: "image/png" }));
    return dataTransfer;
  });
  await uploadZone.dispatchEvent("drop", { dataTransfer: dropData });

  await expect(page.getByText(/已生成 3 条/)).toBeVisible({ timeout: 4000 });
  const tableBody = page.locator("tbody.divide-y");
  await expect(tableBody.getByText("（原币 A$185.29）")).toBeVisible();
  await expect(tableBody.getByText("（原币 A$152.84）")).toBeVisible();
  await expect(tableBody.getByText("¥870.86")).toBeVisible();
  await expect(tableBody.getByText("¥718.35")).toBeVisible();
  await expect(tableBody.getByText("¥25.90")).toBeVisible();
  await expect(page.getByText("¥1,335.94")).toHaveCount(0);
  await expect(page.getByText("¥1,101.98")).toHaveCount(0);

  await page.locator('button[title="glue-gun.png"]').click();
  await page.getByRole("button", { name: "重新识别并修复" }).click();
  await expect(tableBody.getByText("¥35.90")).toBeVisible();
  await expect(page.getByText(/doubao-seed-2-0-lite-260428/)).toBeVisible();
});
