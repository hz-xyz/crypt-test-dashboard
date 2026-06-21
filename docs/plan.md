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

- **R1**:链配置展示(`GET /api/v1/info`)— ✅ 已实现
- **R2**:最近支付流水列表 + SSE 实时状态(`GET /api/v1/payments`,`/events`)
- **R3**:Webhook 投递历史与重放(`GET /bep20/:token/logs/`)
- **R4**:测试网余额(热钱包 BNB + 各 token)
- **R5**:发起测试支付操作台 — 🚧 **已提前,见下方「阶段三」**(为验证网关迭代需要测试平台)

> **优先级调整**:R5 接口契约(CryptAPI 风格)已冻结、且测试网关改动急需一个能跑通「发起支付 → 接收回调」的平台,故 R5 提前到 R2–R4 之前,独立成「阶段三」。R2/R3 与之共享 `GET /api/v1/payments` 与 logs 接口,可在 R5 后顺势补全。

---

## 阶段三:R5 发起测试支付操作台(提前实施)

> **Goal:** 提供一个独立的 `/console` 操作台,能向网关发起测试支付、展示收款地址、跟踪进度,并**接收并验签网关回调**,跑通完整支付链路,用于验证支付网关的迭代改动。
>
> **设计依据:** [`design.md`](./design.md) §2.6 与 §2.2 原则 5–6。接口契约(CryptAPI 风格)见 `usd1pay/docs/payment-callback-integration-guide.md`,**已冻结**,故归一化器写精确实现 + 精确测试。
>
> **追踪策略:** 等回调拿 `uuid` → 查 `GET /api/v1/payments/{uuid}` 拿权威终态;`GET /bep20/{token}/logs/?callback=` 作为回调到达前的进度视图。
>
> **运行前提:** 本地 `next dev` 单进程(回调进内存环形缓冲);callback URL 必须是网关能回访的地址。逐 task 建 issue、逐个合并。

### 关键接口事实(写代码前必记)

- 创建:`GET {BASE}/bep20/{token}/create/?callback={URLENC}&address={ADDR_OUT}`,`token` 小写 `usd1|usdt|usdc`,可选 `confirmations`(1–1000)、`pending=1`。**无鉴权**,限流 60/min/IP(超出 429)。
- 创建响应:`{ status:"success", address_in, address_out, callback_url, minimum_transaction_coin, priority }`;**无 payment id**。**业务错误也返回 HTTP 200**:`{ status:"error", error:"..." }`。
- callback URL 是**幂等去重键** → 每次发起用唯一 URL(带 `ref` nonce)。
- 查单:`GET {BASE}/api/v1/payments/{id}` → `{ id, token, address_in, amount_expected, amount_received, status, fee, tx_hash_in, tx_hash_out, created_at, updated_at }`;金额是 **18 位精度最小单位字符串**(÷10^18);不存在返回 `404 {"error":"Payment not found"}`。
- 回调:`POST {callback}`,头 `x-ca-signature` = RSA-SHA256(原始 body 字节)的 base64;公钥取自 `GET {BASE}/pubkey/`(PEM,`text/plain`)。body 见 design §3.2(`uuid`、`txid_in/out`、`value_coin`、`pending`、`confirmations` 等)。**必须对原始字节验签**,并返回 `200` + 文本含 `ok`,否则网关重试。

---

### Task R5.1: 类型、env 与错误契约扩展

**Files:**

- Modify: `lib/env.ts`(加 `PUBLIC_APP_URL`)
- Modify: `lib/types.ts`(加 `CreatePaymentInput` / `CreatePaymentView` / `PaymentView` / `CallbackRecord`;扩 `ApiError.kind`)
- Modify: `.env.example`(文档化 `PUBLIC_APP_URL`)
- Modify: `test/env.test.ts`(覆盖新变量)

- [ ] **Step 1: env 加 `PUBLIC_APP_URL` 与 `DEFAULT_PAYOUT_ADDRESS`**

  在 `Env` 接口加 `PUBLIC_APP_URL: string` 与 `DEFAULT_PAYOUT_ADDRESS?: string`;`readEnv()` 里:

  ```ts
  // Our own externally-reachable base URL, used ONLY server-side to build the
  // absolute callback URL handed to the gateway. NOT secret, NOT NEXT_PUBLIC_.
  const PUBLIC_APP_URL = (
    process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "");

  // Optional default payout address (address_out) to pre-fill the console form
  // and to fall back to server-side when a create request omits `address`.
  // Empty/unset means the form field is required.
  const DEFAULT_PAYOUT_ADDRESS =
    process.env.DEFAULT_PAYOUT_ADDRESS?.trim() || undefined;
  ```

  返回对象补 `PUBLIC_APP_URL` 与 `DEFAULT_PAYOUT_ADDRESS`。

- [ ] **Step 2: types 加 R5 视图模型 + 扩错误 kind**

  `ApiError.error.kind` 联合追加 `"gateway"`(创建业务错误,HTTP 200 + `status:"error"`)。429 复用 `"upstream"` 并带 `status: 429`。新增:

  ```ts
  export interface CreatePaymentInput {
    token: "usd1" | "usdt" | "usdc";
    address?: string; // address_out;省略时服务端兜底用 DEFAULT_PAYOUT_ADDRESS
    confirmations?: number;
    pending?: boolean;
  }
  export interface CreatePaymentView {
    ref: string; // 本站生成的关联 nonce
    addressIn: string; // 收款地址
    callbackUrl: string; // 交给网关的唯一 callback URL
    raw: unknown;
    fetchedAt: string;
  }
  export interface PaymentView {
    id: string;
    token?: string;
    addressIn?: string;
    status: string; // 见状态机,未知值原样透传
    amountReceived?: string; // 已 ÷10^18 的币本位字符串
    fee?: string; // 同上
    txHashIn?: string | null;
    txHashOut?: string | null;
    createdAt?: string;
    updatedAt?: string;
    raw: unknown;
    fetchedAt: string;
  }
  export interface CallbackRecord {
    ref: string;
    uuid?: string;
    signatureValid: boolean;
    receivedAt: string;
    body: unknown; // 解析后的回调体(原始字节已用于验签)
  }
  ```

- [ ] **Step 3: `.env.example` 文档化**(含 `PUBLIC_APP_URL` 与可选 `DEFAULT_PAYOUT_ADDRESS`);`test/env.test.ts` 补「`PUBLIC_APP_URL` 未设默认 localhost:3000 / 末尾斜杠规整」「`DEFAULT_PAYOUT_ADDRESS` 未设为 undefined、设了被 trim」用例。

- [ ] **Step 4:** `pnpm typecheck && pnpm test` 通过后提交 `feat(r5): types, env PUBLIC_APP_URL, gateway error kind`。

---

### Task R5.2: `lib/payments.ts` — 网关客户端、验签与归一化(+ 测试)

把 `gateway.ts` 的低层 `gatewayFetch` 导出复用(GET + 超时 + 错误归一化),在其上实现 R5 的创建/查单/公钥/验签与归一化。

**Files:**

- Modify: `lib/gateway.ts`(`export` 低层 `gatewayFetch`,供复用,避免重复实现 token/超时/错误归一化)
- Create: `lib/payments.ts`
- Create: `test/payments.normalize.test.ts`、`test/payments.signature.test.ts`

- [ ] **Step 1: 复用低层 fetch** — 将 `gateway.ts` 的 `gatewayFetch` 改为 `export`(签名不变)。

- [ ] **Step 2: `lib/payments.ts` 骨架**(`import "server-only"`):
  - `createPayment(input, callbackUrl): Promise<GatewayResult<CreatePaymentView>>` — 拼 `/bep20/{token}/create/?callback=&address=&confirmations?=&pending?=`(`encodeURIComponent` callback),调 `gatewayFetch`;**先判业务错误**:响应 `status === "error"` → 返回 `{ ok:false, httpStatus:502, error:{ kind:"gateway", message: raw.error } }`;成功 → `normalizeCreate`。
  - `fetchPaymentById(id): Promise<GatewayResult<PaymentView>>` — `gatewayFetch('/api/v1/payments/'+id)`;404 由低层映射为 `upstream`(状态 404)。
  - `fetchPubkey(): Promise<string>` — `GET {BASE}/pubkey/`,缓存模块级单例(测试可 reset)。
  - `verifyCallbackSignature(rawBody: Buffer, signatureB64: string, pubkeyPem: string): boolean` — `crypto.verify("sha256", rawBody, pubkeyPem, Buffer.from(signatureB64,"base64"))`,异常即 `false`。
  - 归一化:`normalizeCreate`、`normalizePayment`(`amount_received`/`fee` 字符串 ÷10^18 → 币本位字符串,见下)、`normalizeCallbackBody`(取 `uuid` 等)。

  wei→币本位(18 位)用字符串安全换算,避免 `Number` 丢精度:

  ```ts
  // "10000000000000000000" -> "10". 纯字符串移位,18 位定点。
  function weiToCoin(wei: string, decimals = 18): string {
    /* ... */
  }
  ```

- [ ] **Step 3: 测试**
  - `payments.normalize.test.ts`:创建成功/业务错误、查单 wei→币本位(整数与带小数)、回调体取 `uuid`。
  - `payments.signature.test.ts`:测试内 `crypto.generateKeyPairSync("rsa",{modulusLength:2048})`,对样例 body 签名 → 验签 `true`;改一字节 body 或换 key → `false`。stub `fetchPubkey` 返回测试公钥。

- [ ] **Step 4:** `pnpm test` 通过后提交 `feat(r5): payments gateway client, signature verify, normalizers + tests`。

---

### Task R5.3: `lib/callback-store.ts` — 内存环形缓冲(+ 测试)

**Files:**

- Create: `lib/callback-store.ts`
- Create: `test/callback-store.test.ts`

- [ ] **Step 1:** `import "server-only"`;模块级 `const CAP = 50; let buf: CallbackRecord[] = [];`
  - `record(r: CallbackRecord): void` — push,超 `CAP` 丢最旧。
  - `listByRef(ref: string): CallbackRecord[]` — 过滤,新→旧。
  - `listRecent(limit = CAP): CallbackRecord[]` — 新→旧。
  - `__resetForTest()`(仅测试用)。

- [ ] **Step 2:** `callback-store.test.ts`:超容量淘汰最旧、按 `ref` 过滤、返回顺序(最新在前)。

- [ ] **Step 3:** 提交 `feat(r5): in-memory callback ring buffer + tests`。

---

### Task R5.4: 路由 — 创建 / 查单 / 回调接收 / 回调读取(+ 测试)

**Files:**

- Create: `app/api/payments/route.ts`(POST)
- Create: `app/api/payments/[id]/route.ts`(GET)
- Create: `app/api/webhooks/usd1pay/route.ts`(POST,Node runtime)
- Create: `app/api/webhooks/route.ts`(GET)
- Modify: `lib/api-client.ts`(加 `postJson` + `createPayment` / `fetchPayment` / `fetchCallbacks`)
- Create: `test/payments-routes.test.ts`、`test/webhook-route.test.ts`

> ⚠️ 写路由前先读 `node_modules/next/dist/docs/` 对应 Route Handler 指南(本仓库 Next 16 与训练数据可能不同),特别是动态段 `[id]` 的 `params` 形态、`runtime`/`dynamic` 导出、读取原始 body 的方式。

- [ ] **Step 1: `app/api/payments/route.ts`(POST)** — 解析 body(`CreatePaymentInput`),`address = input.address?.trim() || env.DEFAULT_PAYOUT_ADDRESS`;两者皆空 → 返回 `{ error:{ kind:"config", message:"未提供转出地址,且未配置 DEFAULT_PAYOUT_ADDRESS" } }`(400/500)。`ref = crypto.randomUUID()`,`callbackUrl = ${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?ref=${ref}`,调 `createPayment`,失败按既有契约用 `httpStatus` 返回 `{ error }`,成功返回 `CreatePaymentView`。

- [ ] **Step 2: `app/api/payments/[id]/route.ts`(GET)** — 调 `fetchPaymentById`,同既有 health/metrics 路由的成功/错误返回模式。

- [ ] **Step 3: `app/api/webhooks/usd1pay/route.ts`(POST)** — 关键实现:

  ```ts
  export const runtime = "nodejs";
  export const dynamic = "force-dynamic";

  export async function POST(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ref = url.searchParams.get("ref") ?? "";
    const raw = Buffer.from(await req.arrayBuffer()); // 原始字节,勿 parse 再 stringify
    const sig = req.headers.get("x-ca-signature") ?? "";

    let signatureValid = false;
    try {
      signatureValid = verifyCallbackSignature(raw, sig, await fetchPubkey());
    } catch {
      signatureValid = false; // 拉公钥/验签异常都记为未验证,不静默
    }

    let body: unknown = null;
    try { body = JSON.parse(raw.toString("utf8")); } catch { /* keep null */ }
    const uuid = /* 从 body 取 uuid */;

    record({ ref, uuid, signatureValid, receivedAt: new Date().toISOString(), body });

    // 始终回 200 ok 以便观测happy path(v1 不做「故意失败测重试」开关)
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  }
  ```

- [ ] **Step 4: `app/api/webhooks/route.ts`(GET)** — 读 `?ref=` 过滤,返回 `listByRef(ref)`(无 `ref` 则 `listRecent()`)。

- [ ] **Step 5: `lib/api-client.ts`** — 加 `postJson<T>(path, body)`(沿用 `getJson` 的错误映射,`method:"POST"` + JSON 头),并导出 `createPayment(input)`、`fetchPayment(id)`、`fetchCallbacks(ref)`。

- [ ] **Step 6: 测试**
  - `payments-routes.test.ts`:mock `@/lib/payments`,验创建成功返回 `CreatePaymentView`、业务错误返回 `gateway` kind;查单成功/404。
  - `webhook-route.test.ts`:mock `@/lib/payments`(`fetchPubkey`/`verifyCallbackSignature`)与 `@/lib/callback-store`;构造带 `x-ca-signature` 的 POST,断言**返回 200 且文本含 `ok`**、`record` 被以正确 `ref`/`signatureValid` 调用;坏签名仍 200 且 `signatureValid:false`。

- [ ] **Step 7:** `pnpm test && pnpm build` 通过后提交 `feat(r5): payment + webhook route handlers + api-client + tests`。

---

### Task R5.5: 操作台 UI — `/console`

独立页,与只读监控盘分离。TanStack Query 轮询。

**Files:**

- Create: `app/console/page.tsx`(服务端组件:读 `env.DEFAULT_PAYOUT_ADDRESS`,以 prop 传给表单作默认值)
- Create: `components/console/create-payment-form.tsx`(token/address/confirmations/pending;`address` 默认值取自 prop,未配则留空且必填)
- Create: `components/console/payment-tracker.tsx`(收款地址 + 进度时间线 + 权威终态)
- Create: `components/console/callback-log.tsx`(回调列表 + 验签徽章 + 原始体折叠)
- (可选)Modify: dashboard 顶部加 `/console` 入口链接

- [ ] **Step 1:** 发起表单 → `createPayment` → 拿到 `{ ref, addressIn, callbackUrl }`,展示 `address_in`(可附二维码 `GET {BASE}/api/v1/payments/{id}/qr` 后续再说,v1 纯文本+复制)。
- [ ] **Step 2:** 追踪:轮询 `fetchCallbacks(ref)`;一旦出现带 `uuid` 的回调 → 轮询 `fetchPayment(uuid)` 显示权威 `status`/金额;并展示(可选)logs 进度。错误态复用既有 `ErrorBanner` + `ApiClientError.kind`。
- [ ] **Step 3:** `callback-log` 显示每条回调的 `signatureValid` 徽章(绿/红)、`pending`、`confirmations`、可展开原始 JSON。
- [ ] **Step 4:**(可选,轻量)`create-payment-form` 渲染/校验的组件测试。
- [ ] **Step 5:** `pnpm lint && pnpm typecheck && pnpm build` 通过后提交 `feat(r5): /console operator UI`。

---

### Task R5.6: 文档与本地联调清单

**Files:**

- Modify: `README.md`(加「R5 操作台:本地联调」小节)

- [ ] **Step 1:** README 写清:① 设 `PUBLIC_APP_URL` 为网关可回访的本机地址;② 起网关 + `pnpm dev`;③ 在 `/console` 选 token、填 `address_out`、发起;④ 向 `address_in` 转测试币;⑤ 观察回调到达 + 验签徽章 + 权威终态。
- [ ] **Step 2:** 写明**约束**:回调仅内存、仅本地单进程,部署多实例会丢;callback URL 唯一性靠 `ref`;限流 60/min/IP;金额按 ÷10^18 展示。
- [ ] **Step 3:** 提交 `docs(r5): console local integration guide`。

---

## R5 自检(写完计划后的回看)

- **覆盖**:R5.1 类型/env/错误契约;R5.2 网关客户端+验签+归一化;R5.3 回调缓冲;R5.4 四个路由+客户端;R5.5 操作台 UI;R5.6 文档。完整覆盖 design §2.6 数据流五步与原则 5–6。
- **契约一致**:创建无 id、业务错误走 HTTP 200、callback 幂等去重、金额 18 位精度、验签对原始字节、应答含 `ok` —— 均来自冻结的接口文档,逐条落到对应 task。
- **不投机**:接口已冻结,归一化器写精确实现;唯一「宽容」处是对未知 `status` 值原样透传。
- **安全**:`PUBLIC_APP_URL` 不带 `NEXT_PUBLIC_`;网关地址/参数仍只在服务端;前端只调本站 `/api/*`;回调验签是确认来源的唯一手段,失败仍记录不静默。
