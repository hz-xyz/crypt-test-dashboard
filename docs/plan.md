# USD1Pay 测试监控站 — 实施计划

> **For agentic workers:** 用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐 task 执行。步骤用 `- [ ]` 复选框跟踪。每个 Task 对应一个 GitHub issue,逐个实现、逐个合并。

**Goal:** 在已搭好的 Next.js 16 脚手架(已实现状态计数 + 健康度首屏)之上,补齐工程底座(运行/测试/格式化/CI)并为核心逻辑补测试,使项目可持续、可安全迭代。

**Architecture:** 见 [`design.md`](./design.md)。前端只调用本站 `/api/*`,Route Handler 作为 server-only 代理转发到测试网关。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Tailwind v4 / shadcn/ui / TanStack Query v5 / Vitest / Prettier / ESLint / GitHub Actions / pnpm。

> ⚠️ **Next.js 16 注意**:本版本与训练数据可能不同。改动涉及 Next API 时,先读 `node_modules/next/dist/docs/` 对应指南。

---

## 阶段一:工程底座(Foundation)— 本计划聚焦,逐 task 建 issue

### Task 1: 基础设置 — 运行 / 测试 / 格式化 / CI

把脚手架变成一个有完整门禁的工程:补齐脚本、Prettier、Vitest 测试框架(含一个 smoke test)、GitHub Actions CI。

**Files:**

- Modify: `package.json`(scripts、devDependencies、engines、packageManager)
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/smoke.test.ts`
- Create: `.github/workflows/ci.yml`
- Create: `.nvmrc`

- [ ] **Step 1: 装开发依赖**

```bash
cd /Users/huazhang/dev/ai/riema/crypt-test-dashboard
pnpm add -D prettier vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event
```

- [ ] **Step 2: 写 Prettier 配置**

`.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80
}
```

`.prettierignore`:

```
.next
node_modules
pnpm-lock.yaml
public
*.tsbuildinfo
coverage
```

- [ ] **Step 3: 写 Vitest 配置**

`vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Native tsconfig `paths` resolution (Vite/Vitest built-in).
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
```

`test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: 写 smoke test(只测无 server-only 依赖的纯函数)**

`test/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isApiError } from "@/lib/types";

describe("test harness smoke", () => {
  it("isApiError accepts a well-formed error", () => {
    expect(isApiError({ error: { kind: "timeout", message: "x" } })).toBe(true);
  });

  it("isApiError rejects a plain object", () => {
    expect(isApiError({ up: true })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
```

- [ ] **Step 5: 更新 package.json scripts 与元信息**

把 `scripts` 改为:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

并在顶层补:

```json
"engines": { "node": ">=20" },
"packageManager": "pnpm@10.18.3"
```

(`packageManager` 版本对齐本机 `pnpm -v`。)

- [ ] **Step 6: 写 `.nvmrc`**

`.nvmrc`:

```
20
```

- [ ] **Step 7: 本地跑通全部门禁**

Run:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: 全部通过;`pnpm test` 显示 smoke 2 个用例 PASS。
若 `format:check` 报已有文件不符,先 `pnpm format` 再提交(格式化属本 task 范围)。

- [ ] **Step 8: 写 CI**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # pnpm version comes from the "packageManager" field in package.json.
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
        env:
          GATEWAY_BASE_URL: http://127.0.0.1:8080
          GATEWAY_ADMIN_TOKEN: ci-placeholder
```

- [ ] **Step 9: 提交**

```bash
git add -A
git commit -m "chore: add tooling, prettier, vitest harness, and CI"
```

---

### Task 2: 单元测试 — 网关归一化器

为 `lib/gateway.ts` 的 `normalizeHealth` / `normalizeMetrics` 补特征化测试,锁定当前(防御式)行为,作为后续收紧归一化的安全网。

**Files:**

- Modify: `vitest.config.ts`(为 `server-only` 加 alias)
- Create: `test/stubs/server-only.ts`
- Create: `test/gateway.normalize.test.ts`

- [ ] **Step 1: 加 server-only stub 与 alias**

> `lib/gateway.ts` 顶部 `import "server-only"`。该包在非 RSC 的 Node/Vitest 环境会在 import 时抛错,需 alias 到空模块。

`test/stubs/server-only.ts`:

```ts
// Empty stub so server-only modules can be imported under Vitest.
export {};
```

在 `vitest.config.ts` 已有的 `resolve` 块里加 `alias`(与 `tsconfigPaths: true` 并存):

```ts
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": new URL("./test/stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
```

- [ ] **Step 2: 写归一化测试(先看它们失败前先确认能 import)**

`test/gateway.normalize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeHealth, normalizeMetrics } from "@/lib/gateway";

describe("normalizeMetrics", () => {
  it("flat status->count object", () => {
    const v = normalizeMetrics({ CREATED: 3, COMPLETED: 10 });
    expect(v.statusCounts).toEqual({ CREATED: 3, COMPLETED: 10 });
    expect(v.total).toBe(13);
  });

  it("nested under counts, uppercases keys", () => {
    const v = normalizeMetrics({ counts: { pending: 2, completed: 5 } });
    expect(v.statusCounts).toEqual({ PENDING: 2, COMPLETED: 5 });
    expect(v.total).toBe(7);
  });

  it("prometheus text with status label", () => {
    const text =
      'payment_status_total{status="CREATED"} 3\npayment_status_total{status="FAILED"} 1';
    const v = normalizeMetrics(text);
    expect(v.statusCounts).toEqual({ CREATED: 3, FAILED: 1 });
    expect(v.total).toBe(4);
  });
});

describe("normalizeHealth", () => {
  it("derives up + blockLag from a healthy payload", () => {
    const v = normalizeHealth({
      status: "ok",
      getLogsStrategy: "bulk",
      lastProcessedBlock: 100,
      chainHead: 115,
      watchSetSize: 4,
    });
    expect(v.up).toBe(true);
    expect(v.getLogsStrategy).toBe("bulk");
    expect(v.blockLag).toBe(15);
    expect(v.watchSetSize).toBe(4);
  });

  it("marks down on a failing status string", () => {
    expect(normalizeHealth({ status: "down" }).up).toBe(false);
  });

  it("defaults up=true and preserves raw for non-object payloads", () => {
    const v = normalizeHealth("pong");
    expect(v.up).toBe(true);
    expect(v.raw).toBe("pong");
  });
});
```

- [ ] **Step 3: 跑测试**

Run: `pnpm test`
Expected: 全部 PASS(共 8 用例)。若 `@/lib/gateway` import 因 server-only 抛错,检查 Step 1 alias 路径。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "test: characterize gateway normalizers"
```

---

### Task 3: 单元测试 — 环境校验与客户端错误映射

覆盖 `lib/env.ts`(必需变量缺失即抛、超时校验、末尾斜杠规整)与 `lib/api-client.ts`(把 `ApiError` 抛成 `ApiClientError`)。

**Files:**

- Create: `test/env.test.ts`
- Create: `test/api-client.test.ts`

- [ ] **Step 1: env 测试(用 resetModules + 动态 import 绕过缓存单例)**

`test/env.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when required vars are missing", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/GATEWAY_BASE_URL/);
  });

  it("strips a trailing slash and defaults timeout to 5000", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080/");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "t");
    vi.stubEnv("GATEWAY_TIMEOUT_MS", "");
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.GATEWAY_BASE_URL).toBe("http://host:8080");
    expect(env.GATEWAY_TIMEOUT_MS).toBe(5000);
  });

  it("rejects a non-positive timeout", async () => {
    vi.stubEnv("GATEWAY_BASE_URL", "http://host:8080");
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "t");
    vi.stubEnv("GATEWAY_TIMEOUT_MS", "-1");
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/positive number/);
  });
});
```

- [ ] **Step 2: api-client 测试(stub 全局 fetch)**

`test/api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, fetchHealth } from "@/lib/api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("api-client", () => {
  it("returns parsed data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ up: true, raw: {}, fetchedAt: "x" })),
    );
    await expect(fetchHealth()).resolves.toMatchObject({ up: true });
  });

  it("throws ApiClientError carrying kind on a normalized error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { kind: "timeout", message: "slow" } }, 504),
        ),
    );
    await expect(fetchHealth()).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "timeout",
    });
    await expect(fetchHealth()).rejects.toBeInstanceOf(ApiClientError);
  });
});
```

- [ ] **Step 3: 跑测试并提交**

Run: `pnpm test`
Expected: 全部 PASS。

```bash
git add -A
git commit -m "test: cover env validation and api-client error mapping"
```

---

### Task 4: 路由测试 — /api/health 与 /api/metrics

验证 Route Handler 在网关成功与失败两种情况下,分别返回归一化数据与正确的 `ApiError` + HTTP 状态。

**Files:**

- Create: `test/api-routes.test.ts`

- [ ] **Step 1: 写路由测试(mock `@/lib/gateway`)**

`test/api-routes.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gateway", () => ({
  fetchHealth: vi.fn(),
  fetchMetrics: vi.fn(),
}));

import { fetchHealth, fetchMetrics } from "@/lib/gateway";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as metricsGET } from "@/app/api/metrics/route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/health", () => {
  it("returns the normalized HealthView on success", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: true,
      data: { up: true, raw: {}, fetchedAt: "x" },
    });
    const res = await healthGET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ up: true });
  });

  it("propagates the error contract and httpStatus on failure", async () => {
    vi.mocked(fetchHealth).mockResolvedValue({
      ok: false,
      httpStatus: 504,
      error: { kind: "timeout", message: "slow" },
    });
    const res = await healthGET();
    expect(res.status).toBe(504);
    await expect(res.json()).resolves.toMatchObject({
      error: { kind: "timeout" },
    });
  });
});

describe("GET /api/metrics", () => {
  it("returns the normalized MetricsView on success", async () => {
    vi.mocked(fetchMetrics).mockResolvedValue({
      ok: true,
      data: { statusCounts: { CREATED: 1 }, total: 1, fetchedAt: "x" },
    });
    const res = await metricsGET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ total: 1 });
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm test`
Expected: 全部 PASS。若 `@/app/...` 别名无法解析,确认 `tsconfig.json` 的 `paths` 含 `@/*` 且 vitest 用了 `vite-tsconfig-paths`。

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "test: cover /api/health and /api/metrics route handlers"
```

---

### Task 5: 部署配置与发布前核对

加上 Vercel 部署配置与一份发布核对清单,确保密钥与访问控制不出错。

**Files:**

- Create: `vercel.json`
- Modify: `README.md`(补「发布前核对」小节)

- [ ] **Step 1: 写 `vercel.json`**

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

- [ ] **Step 2: README 补发布前核对清单**

在 README 「部署到 Vercel」小节后追加:

```markdown
### 发布前核对

- [ ] `GATEWAY_BASE_URL` / `GATEWAY_ADMIN_TOKEN` 已在 Vercel 配置,且**不带** `NEXT_PUBLIC_` 前缀
- [ ] Production 与 Preview 均已开启 Deployment Protection
- [ ] CI 全绿(format/lint/typecheck/test/build)
- [ ] 预览部署打开后,网关连通时显示计数与健康度;断开时显示明确错误态(非崩溃)
```

- [ ] **Step 3: 校验配置不破坏构建并提交**

Run: `pnpm build`
Expected: 构建成功。

```bash
git add -A
git commit -m "chore: add vercel config and release checklist"
```

---

## 自检(写完计划后的回看)

- **覆盖**:Task 1 覆盖「运行/测试/格式化/CI」基础设置;Task 2–4 覆盖现有核心逻辑测试;Task 5 覆盖部署。设计文档 §1.1 的首屏功能脚手架**已实现**,本计划补的是底座与测试。
- **类型一致**:测试中使用的 `HealthView`/`MetricsView`/`ApiError`/`ApiClientError`/`GatewayResult` 均与 `lib/types.ts`、`lib/gateway.ts`、`lib/api-client.ts` 现有定义一致。
- **无占位**:每个 step 含可执行内容与期望输出。

---

## 阶段二:功能 Roadmap(后续,各自独立成 issue 与 spec)

依赖网关后续暴露/冻结的接口,届时各自补 spec、Route Handler、归一化器与精确测试。**不在本计划详述**,避免对未知 wire format 写投机代码:

- **R1**:链配置展示(`GET /api/v1/info`)
- **R2**:最近支付流水列表 + SSE 实时状态(`GET /api/v1/payments`,`/events`)
- **R3**:Webhook 投递历史与重放(`GET /bep20/:token/logs/`)
- **R4**:测试网余额(热钱包 BNB + 各 token)
- **R5**:发起测试支付操作台
