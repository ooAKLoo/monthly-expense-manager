import { expect, test } from "@playwright/test";

test("管理月度消费、上传票据、迁移下月和触发导出", async ({ page }) => {
  await page.goto("/");
  const app = page.locator(".print-shell");

  await expect(app.getByRole("heading", { name: "月度消费管理" })).toBeVisible();
  await expect(app.getByRole("button", { name: "选择月份" })).toContainText("2024年5月");
  await expect(app.getByText("当月总金额（人民币）")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "uber-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("receipt"),
  });

  await expect(app.getByText(/已生成 2 条/)).toBeVisible({ timeout: 4000 });
  await expect(app.getByText("Uber Receipt", { exact: true })).toBeVisible();

  await app.getByRole("button", { name: /下月预览/ }).click();

  await expect(app.getByRole("button", { name: "选择月份" })).toContainText("2024年6月");
  await expect(app.getByText("Office Rent")).toBeVisible();
  await expect(app.getByText("Uber Receipt（结转）", { exact: true })).toBeVisible();

  await app.getByPlaceholder("搜索商家、备注").fill("Uber Receipt（结转）");
  await expect(app.getByText("共 1 条记录")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await app.getByRole("button", { name: "导出 PDF" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(
    /^月度消费-2024-06-全部-搜索-UberReceipt（结转）-\d+\.pdf$/,
  );
});
