# 月度消费管理

React + TypeScript + Vite + Tailwind CSS + lucide-react 实现的单页月度消费管理界面。

## 功能

- 月度消费总览、报销/未报销统计、消费笔数
- 上传消费截图或 PDF 后自动整理为表格
- 美元、澳元和新台币消费按各自汇率折算人民币
- 识别 A$/AU$/AUD 等澳元标记，区分美元裸 `$`
- 多金额订单优先提取实付金额，排除优惠、折扣、券和立减金额
- 支持 Seed2.0 Lite 票据识别，Qwen 在 Seed 不可用时自动回退
- 可从原始附件重新识别并替换错误记录
- AI 分类分析交互状态
- 未报销项目和固定月度花费迁移到下个月
- 浏览器打印导出 PDF

## 开发

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

默认优先使用 `doubao-seed-2-0-lite-260428`。在 `.env.local` 配置 `ARK_API_KEY` 后启用 Seed2.0；未配置或 Seed 调用失败时，会回退到现有 Qwen 模型。

## 模型 A/B 对比

同图对比默认关闭，避免每次上传产生双模型费用。临时设置 `ENABLE_MODEL_EVAL=true` 并同时配置 `ARK_API_KEY`、`DASHSCOPE_API_KEY` 后调用：

```bash
curl -F "files=@receipt.png" \
  -F "month=2026-07" \
  http://127.0.0.1:8788/api/bills/your-bill-id/compare-expense-models
```

结果同时返回 Seed2.0 与 Qwen 的标准化记录、耗时和字段差异；相同图片、模型和提示词会读取缓存。需要强制重测时额外传入 `-F "force=true"`。

当前冒烟测试结果见 [`docs/model-evaluation.md`](docs/model-evaluation.md)。

## 错误数据修复

先预览精确匹配的修复内容：

```bash
npm run repair:data
```

确认后应用，并为修改前的账单 JSON 创建备份：

```bash
npm run repair:data -- --apply
```

两条已确认的 ChatGPT 记录只修正为 AUD；绿林记录若证据中有“实付款”则恢复该金额，否则移除错误的 ¥4 优惠记录，等待从原附件重新识别。

## 构建

```bash
npm run build
```

## 测试

```bash
npm run test:unit
npm run test:e2e
```
