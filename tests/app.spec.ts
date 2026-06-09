import { expect, test } from "@playwright/test";

test("管理月度消费、上传票据、迁移下月和触发导出", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        window.sessionStorage.setItem("pdf-exported", "true");
      },
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "月度消费管理" })).toBeVisible();
  await expect(page.getByText("2024年5月")).toBeVisible();
  await expect(page.getByText("当月总金额（人民币）")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "uber-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("receipt"),
  });

  await expect(page.getByText(/已生成 2 条/)).toBeVisible({ timeout: 4000 });
  await expect(page.getByText("Uber Receipt", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /下月预览/ }).click();

  await expect(page.getByText("2024年6月")).toBeVisible();
  await expect(page.getByText("Office Rent")).toBeVisible();
  await expect(page.getByText("Uber Receipt（结转）", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "导出 PDF" }).click();
  await expect
    .poll(() => page.evaluate(() => window.sessionStorage.getItem("pdf-exported")))
    .toBe("true");
});
