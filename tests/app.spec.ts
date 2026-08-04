import { expect, test } from "@playwright/test";

test("跨月份管理未报销消费、上传票据和触发导出", async ({ page }) => {
  const app = page.locator(".print-shell");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz8eVgAAAABJRU5ErkJggg==",
    "base64",
  );
  let analyzeCallCount = 0;
  let latestSavedBill: Record<string, unknown> | null = null;

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

    latestSavedBill = await route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ bill: latestSavedBill }),
    });
  });

  await page.route("**/api/bills/e2e-test/attachments", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        attachments: [
          {
            id: "att-contract",
            name: "contract.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 8,
            url: "api/bills/e2e-test/attachments/att-contract",
          },
          {
            id: "att-archive",
            name: "evidence.zip",
            mimeType: "application/zip",
            size: 7,
            url: "api/bills/e2e-test/attachments/att-archive",
          },
        ],
      }),
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
              date: "2024-04-27",
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

  await expect(app.getByRole("heading", { name: "消费报销管理" })).toBeVisible();
  await expect(app.getByText("全部待报销", { exact: true })).toBeVisible();
  await expect(app.getByText("待报销总金额（人民币）")).toBeVisible();
  await expect(app.getByText("这里暂时没有消费记录")).toBeVisible();

  const uploadZone = app.getByRole("button", { name: "上传消费截图或 PDF" });
  const dropData = await page.evaluateHandle(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["receipt"], "uber-receipt.png", { type: "image/png" }));
    return dataTransfer;
  });
  await uploadZone.dispatchEvent("drop", { dataTransfer: dropData });

  await expect(app.getByText(/已生成 2 条/)).toBeVisible({ timeout: 4000 });
  await expect(app.getByText("Uber Receipt", { exact: true })).toBeVisible();
  await expect(app.getByText("2024/04/27", { exact: true })).toBeVisible();
  await expect(app.locator("thead th").filter({ hasText: /^金额$/ })).toBeVisible();
  await expect(app.locator("thead th").filter({ hasText: "金额（原币）" })).toHaveCount(0);
  await expect(app.locator("thead th").filter({ hasText: "金额（CNY）" })).toHaveCount(0);
  await expect(app.getByText("（原币 $22.80）")).toBeVisible();
  await expect(app.getByText("¥164.39")).toBeVisible();
  await expect(app.locator('button[title="删除"]')).toHaveCount(0);

  const searchInput = app.getByPlaceholder("搜索商家、备注");
  await searchInput.click();
  await expect(searchInput).toBeFocused();

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
  await expect(app.getByText("Uber Receipt", { exact: true })).toHaveCount(0);
  await app.getByRole("button", { name: /已报销/ }).first().click();
  await expect(app.getByText("2024年5月", { exact: true })).toBeVisible();
  const reportedStatusSelect = app.getByRole("combobox", { name: /修改报销状态/ }).first();
  await expect(reportedStatusSelect).toContainText("已报销");
  await reportedStatusSelect.press("ArrowDown");
  await expect(reportedStatusSelect).toHaveAttribute("aria-expanded", "true");
  const unreportedOption = page.getByRole("option", { name: "未报销", exact: true });
  const unreportedOptionId = await unreportedOption.getAttribute("id");
  expect(unreportedOptionId).toBeTruthy();
  await expect(reportedStatusSelect).toHaveAttribute("aria-activedescendant", unreportedOptionId!);
  await reportedStatusSelect.press("Enter");
  await app.getByRole("button", { name: /未报销/ }).first().click();
  const unreportedStatusSelect = app.getByRole("combobox", { name: /修改报销状态/ }).first();
  await expect(unreportedStatusSelect).toContainText("未报销");
  await unreportedStatusSelect.click();
  await unreportedStatusSelect.press("Escape");
  await expect(unreportedStatusSelect).toHaveAttribute("aria-expanded", "false");

  await page.evaluate(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["receipt"], "clipboard.png", { type: "image/png" }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: dataTransfer });
    document.body.dispatchEvent(event);
  });
  await expect(app.getByText("Clipboard Receipt", { exact: true })).toBeVisible({ timeout: 4000 });

  const sourceButtons = app.locator('button[title="uber-receipt.png"]');
  await expect(sourceButtons).toHaveCount(2);

  await sourceButtons.first().click();
  await expect(page.getByRole("button", { name: "关闭预览" })).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭预览" })).toBeFocused();
  await page.getByRole("button", { name: "关闭预览" }).click();

  const attachmentChooser = page.waitForEvent("filechooser");
  await app.getByRole("button", { name: "为 Uber Receipt 添加附件" }).click();
  const chooser = await attachmentChooser;
  await chooser.setFiles([
    { name: "contract.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("contract") },
    { name: "evidence.zip", mimeType: "application/zip", buffer: Buffer.from("archive") },
  ]);
  await expect(app.getByText("已为该记录添加 2 个附件")).toBeVisible();
  const uberRow = app.locator("tbody tr").filter({ hasText: "Uber Receipt" }).first();
  await expect(uberRow.getByText("3 个")).toBeVisible();
  await expect(uberRow.getByRole("link", { name: "下载附件 contract.docx" })).toBeVisible();
  await expect(uberRow.getByRole("link", { name: "下载附件 evidence.zip" })).toBeVisible();
  expect(analyzeCallCount).toBe(2);
  await expect(page.locator('iframe[title="contract.docx"]')).toHaveCount(0);
  await app.getByPlaceholder("搜索商家、备注").fill("contract.docx");
  await expect(app.getByText("共 1 条记录")).toBeVisible();
  await app.getByPlaceholder("搜索商家、备注").fill("");
  await expect.poll(() => {
    const expenses = (latestSavedBill?.expenses ?? []) as Array<{ id?: string; attachments?: unknown[] }>;
    return expenses.find((expense) => expense.id === "test-uber-1")?.attachments?.length ?? 0;
  }).toBe(2);

  await app.getByPlaceholder("搜索商家、备注").fill("Uber Receipt");
  await expect(app.getByText("共 2 条记录")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await app.getByRole("button", { name: "导出 PDF" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^消费明细-全部月份-未报销-搜索-UberReceipt-\d+\.pdf$/,
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
      const body = await route.request().postDataJSON();
      expect(body.rangeStart).toBe("2026-07-01");
      expect(body.rangeEnd).toBe("2026-07-31");
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

test("旧结转记录合并回原消费且保留共享附件", async ({ page }) => {
  const attachment = {
    id: "shared-receipt",
    name: "shared.png",
    mimeType: "image/png",
    size: 68,
    url: "api/bills/reanalyze-shared/attachments/shared-receipt",
  };
  const originalExpenses = [
    {
      id: "original-record",
      date: "2026-06-23",
      description: "原始消费",
      category: "购物",
      originalAmount: 10,
      currency: "CNY",
      merchant: "共享商家",
      status: "reported",
      note: "原记录",
      source: "上传图片",
      attachment,
    },
    {
      id: "carried-record",
      date: "2026-07-01",
      description: "原始消费（结转）",
      category: "购物",
      originalAmount: 10,
      currency: "CNY",
      merchant: "共享商家",
      status: "unreported",
      note: "结转记录",
      source: "自动迁移",
      attachment,
    },
  ];
  let savedExpenses = originalExpenses;

  await page.route("**/api/bills/reanalyze-shared", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "reanalyze-shared",
            currentMonth: "2026-07",
            dateRange: { start: "2026-07-01", end: "2026-07-31" },
            expenses: originalExpenses,
          },
        }),
      });
      return;
    }
    const bill = await route.request().postDataJSON();
    savedExpenses = bill.expenses;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ bill }) });
  });
  await page.route("**/api/bills/reanalyze-shared/attachments/shared-receipt", async (route) => {
    await route.fulfill({ body: Buffer.from("image"), contentType: "image/png" });
  });
  await page.route(
    "**/api/bills/reanalyze-shared/attachments/shared-receipt/reanalyze-expenses",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          expenses: [
            {
              ...originalExpenses[1],
              id: "model-repaired",
              originalAmount: 18.8,
              evidenceText: "实付款 ¥18.80",
            },
          ],
          warnings: [],
          models: { active: "doubao-seed-2-0-lite-260428" },
        }),
      });
    },
  );

  await page.goto("/#bill=reanalyze-shared");
  await expect(page.getByText("原始消费（结转）", { exact: true })).toHaveCount(0);
  await expect(page.locator(".print-shell").getByText("2026/06/23", { exact: true })).toBeVisible();
  await page.locator('button[title="shared.png"]').click();
  await page.getByRole("button", { name: "重新识别并修复" }).click();
  await expect(page.locator("tbody.divide-y").getByText("¥18.80")).toBeVisible();
  await expect.poll(
    () => savedExpenses.find((expense) => expense.id === "original-record")?.originalAmount,
  ).toBe(18.8);
  await expect.poll(() => savedExpenses.map((expense) => expense.id)).toEqual(["original-record"]);
});

test("支持跨页全选、Shift 连选和确认后批量删除", async ({ page }) => {
  const expenses = Array.from({ length: 10 }, (_, index) => ({
    id: `selection-${index + 1}`,
    date: `2024-05-${String(20 - index).padStart(2, "0")}`,
    description: `记录 ${index + 1}`,
    category: "办公",
    originalAmount: index + 1,
    currency: "CNY",
    merchant: `商家 ${index + 1}`,
    status: "unreported",
    note: "选择测试",
    source: "手动记录",
  }));
  let latestSavedExpenses = expenses;

  await page.route("**/api/bills/selection-test", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "selection-test",
            currentMonth: "2024-05",
            dateRange: { start: "2024-05-01", end: "2024-05-31" },
            expenses,
          },
        }),
      });
      return;
    }

    const bill = await route.request().postDataJSON();
    latestSavedExpenses = bill.expenses;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ bill }) });
  });

  await page.goto("/#bill=selection-test");
  const app = page.locator(".print-shell");
  const selectAll = app.getByRole("checkbox", { name: "全选当前筛选结果" });
  await selectAll.click();
  await expect(selectAll).toHaveAttribute("aria-checked", "true");
  await expect(app.getByText("已选择 10 条")).toBeVisible();

  await app.getByRole("button", { name: "下一页" }).click();
  await expect(app.getByRole("checkbox", { name: /记录 9$/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await app.getByRole("button", { name: "取消选择" }).click();
  await app.getByRole("button", { name: "上一页" }).click();

  await app.getByRole("checkbox", { name: /记录 1$/ }).click();
  await app
    .getByRole("checkbox", { name: /记录 4$/ })
    .click({ modifiers: ["Shift"] });
  await expect(app.getByText("已选择 4 条")).toBeVisible();
  await expect(selectAll).toHaveAttribute("aria-checked", "mixed");

  const bulkStatusSelect = app.getByRole("combobox", { name: /批量修改报销状态/ });
  await bulkStatusSelect.click();
  await page.getByRole("option", { name: "未报销", exact: true }).click();
  await expect(app.getByText("已将 4 条消费记录改为未报销")).toBeVisible();
  await expect(
    app.locator("tbody tr").filter({ hasText: "记录 1" }).getByRole("combobox", { name: /修改报销状态/ }),
  ).toContainText("未报销");
  await expect(
    app.locator("tbody tr").filter({ hasText: "记录 4" }).getByRole("combobox", { name: /修改报销状态/ }),
  ).toContainText("未报销");

  await app.getByRole("button", { name: "删除 4 条" }).click();
  const deleteDialog = page.getByRole("dialog", { name: /删除 4 条消费记录/ });
  await expect(deleteDialog).toContainText("删除 4 条消费记录");
  await expect(deleteDialog.getByRole("button", { name: "取消" })).toBeFocused();
  await deleteDialog.getByRole("button", { name: "取消" }).click();
  await expect(app.getByText("记录 1", { exact: true })).toBeVisible();

  await app.getByRole("button", { name: "删除 4 条" }).click();
  await deleteDialog.getByRole("button", { name: "确认删除" }).click();
  await expect(app.getByText("记录 1", { exact: true })).toHaveCount(0);
  await expect(app.getByText("记录 4", { exact: true })).toHaveCount(0);
  await expect(app.getByText("共 6 条记录")).toBeVisible();
  await expect.poll(() => latestSavedExpenses.map((expense) => expense.id)).not.toContain(
    "selection-1",
  );
  expect(latestSavedExpenses).toHaveLength(6);

  const settleButton = app.getByRole("button", { name: /全部标记为已报销/ });
  await settleButton.click();
  await expect(app.getByText("已将 6 条消费标记为已报销")).toBeVisible();
  await expect(app.getByText("这里暂时没有消费记录")).toBeVisible();
  await app.getByRole("button", { name: /已报销/ }).first().click();
  await expect(app.getByText("共 6 条记录")).toBeVisible();
});

test("自动保存串行提交，旧快照不会覆盖新状态", async ({ page }) => {
  const expense = {
    id: "save-order-record",
    date: "2024-05-20",
    description: "保存顺序测试",
    category: "办公",
    originalAmount: 88,
    currency: "CNY",
    merchant: "测试商家",
    status: "unreported",
    note: "",
    source: "手动记录",
  };
  let putCount = 0;
  const savedPayloads: Array<{ expenses: Array<{ status: string }> }> = [];
  let markFirstStarted!: () => void;
  let releaseFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve;
  });
  const firstRelease = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  await page.route("**/api/bills/save-order-test", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "save-order-test",
            currentMonth: "2024-05",
            dateRange: { start: "2024-05-01", end: "2024-05-31" },
            expenses: [expense],
          },
        }),
      });
      return;
    }

    putCount += 1;
    savedPayloads.push(await route.request().postDataJSON());
    if (putCount === 1) {
      markFirstStarted();
      await firstRelease;
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/#bill=save-order-test");
  await firstStarted;
  const statusSelect = page.getByRole("combobox", { name: /修改报销状态/ });
  await statusSelect.click();
  await page.getByRole("option", { name: "已报销", exact: true }).click();
  await page.waitForTimeout(650);
  expect(putCount).toBe(1);

  releaseFirst();
  await expect.poll(() => putCount).toBe(2);
  expect(savedPayloads.at(-1)?.expenses[0].status).toBe("reported");
});

test("PDF 附件可点击后直接内嵌预览", async ({ page }) => {
  const expense = {
    id: "pdf-preview-record",
    date: "2024-05-20",
    description: "PDF 附件测试",
    category: "办公",
    originalAmount: 88,
    currency: "CNY",
    merchant: "测试商家",
    status: "unreported",
    note: "",
    source: "上传 PDF",
    attachment: {
      id: "pdf-preview-attachment",
      name: "补充票据.PDF",
      // 复现部分浏览器上传 PDF 时给出的通用 MIME 类型。
      mimeType: "application/octet-stream",
      size: 128,
      url: "api/bills/pdf-preview-test/attachments/pdf-preview-attachment",
    },
  };

  await page.route("**/api/bills/pdf-preview-test", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          bill: {
            id: "pdf-preview-test",
            currentMonth: "2024-05",
            dateRange: { start: "2024-05-01", end: "2024-05-31" },
            expenses: [expense],
          },
        }),
      });
      return;
    }

    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route(
    "**/api/bills/pdf-preview-test/attachments/pdf-preview-attachment",
    async (route) => {
      expect(route.request().url()).not.toContain("download=1");
      await route.fulfill({
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": "inline; filename*=UTF-8''%E8%A1%A5%E5%85%85%E7%A5%A8%E6%8D%AE.PDF",
          "X-Content-Type-Options": "nosniff",
        },
        body: "%PDF-1.4\n%%EOF",
      });
    },
  );

  await page.goto("/#bill=pdf-preview-test");
  const previewButton = page.getByRole("button", { name: "预览附件 补充票据.PDF" });
  await previewButton.click();

  const dialog = page.getByRole("dialog", { name: "补充票据.PDF" });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByTitle("PDF 预览：补充票据.PDF");
  await expect(preview).toHaveAttribute(
    "src",
    /api\/bills\/pdf-preview-test\/attachments\/pdf-preview-attachment$/,
  );
  await expect(preview).not.toHaveAttribute("sandbox");
  await expect(dialog.getByRole("link", { name: "下载" })).toHaveAttribute("href", /download=1/);
});
