# USD1Pay 测试环境监控站 — 设计文档

> 状态:**已批准方向**,落地中。本文件是真理来源,描述系统该长什么样、为什么这样设计、以及边界在哪里。实施步骤见 [`plan.md`](./plan.md)。

## 1. 目标与背景

为 **USD1Pay**(BSC 稳定币支付网关,支持 USD1 / USDT / USDC BEP-20)的**测试环境**提供一个轻量运维监控看板,部署在 Vercel 上。

网关本体是 Node.js + TypeScript + Express + PostgreSQL,已对外暴露 HTTP 接口。本站**不重新实现网关逻辑**,只通过 HTTP 消费网关接口并做可视化。

### 1.1 第一阶段范围(MVP,已实现脚手架)

第一屏聚焦**支付状态计数 + 网关健康度**:

- **支付状态计数**:CREATED / PENDING / CONFIRMING / CONFIRMED / COMPLETED / FAILED / EXPIRED —— 数字卡片 + 状态徽章,来源 `GET /metrics`
- **网关健康度**:整体 UP/DOWN、getLogs 策略(per-address / bulk)、区块游标差距(`last_processed_block` 与链高 `chainHead` 之差 = `blockLag`)、watch set 大小,来源 `GET /health`
- **自动轮询**(每 4s)+ 最后刷新时间 + 手动刷新
- **明确错误态**:超时 / 无法连接 / 上游非 2xx / 服务端配置缺失,分别提示,绝不静默

### 1.2 非目标(本阶段不做)

- 不直连测试库 PostgreSQL(深度数据观测后续走网关**新增只读接口**)
- 不在应用代码里实现登录/鉴权(交给 Vercel Deployment Protection)
- 不写网关业务逻辑、不发链上交易(测试支付操作台是后续 roadmap)
- 不做多租户、不做告警通知(后续可加)

## 2. 架构

### 2.1 总体形态

```
浏览器 (TanStack Query 轮询)
   │  只调用本站 /api/*,不知道网关地址
   ▼
Next.js Route Handlers  (app/api/*)   ← 轻后端代理,server-only
   │  附加 Bearer token、超时、错误归一化、响应规整
   ▼
USD1Pay 测试网关  (GET /health, /metrics, …)
```

### 2.2 不可动摇的架构原则

1. **密钥不出服务端**:`GATEWAY_BASE_URL`、`GATEWAY_ADMIN_TOKEN` 只通过 `process.env` 在 Route Handler 中使用。`lib/env.ts` 与 `lib/gateway.ts` 均 `import "server-only"`,一旦被客户端 bundle 引用即编译报错。环境变量**不得**带 `NEXT_PUBLIC_` 前缀。
2. **前端只调用本站 `/api/*`**:浏览器永不直连测试网关,也不知道其真实地址。
3. **不直连数据库**:深度观测走网关只读接口。
4. **错误绝不静默**:每个 Route Handler 在失败时返回结构化 `ApiError`(`kind` + `message`),前端据 `kind` 渲染明确错误态。

### 2.3 模块边界(每个文件单一职责)

| 文件                       | 职责                                                             | 依赖                        | 客户端可引用?   |
| -------------------------- | ---------------------------------------------------------------- | --------------------------- | --------------- |
| `lib/env.ts`               | 校验并缓存必需环境变量,缺失即抛错                                | `process.env`               | 否(server-only) |
| `lib/gateway.ts`           | 网关 fetch(带 token/超时)+ 响应归一化                            | `env.ts`, `types.ts`        | 否(server-only) |
| `lib/types.ts`             | 归一化后的视图模型与错误契约,无密钥                              | 无                          | 是              |
| `lib/api-client.ts`        | 浏览器侧 fetch,只打 `/api/*`,把 `ApiError` 抛成 `ApiClientError` | `types.ts`                  | 是              |
| `app/api/health/route.ts`  | 代理 → 网关 `/health`                                            | `gateway.ts`                | —(服务端路由)   |
| `app/api/metrics/route.ts` | 代理 → 网关 `/metrics`                                           | `gateway.ts`                | —(服务端路由)   |
| `components/dashboard/*`   | 看板 UI(状态卡片、健康面板、错误态、刷新指示)                    | `api-client.ts`, `types.ts` | 是              |

### 2.4 数据流与错误契约

成功:网关原始响应 → `normalizeHealth` / `normalizeMetrics` 转为 `HealthView` / `MetricsView` → Route Handler 返回 JSON → `api-client` 透传 → TanStack Query 缓存渲染。

失败:`gateway.ts` 把失败归一为 `{ ok:false, error:{kind,...}, httpStatus }`,Route Handler 用 `httpStatus`(500/502/504)返回 `{ error }`;`api-client` 检测到 `ApiError` 形状即抛 `ApiClientError(kind, message)`;`ErrorBanner` 据 `kind` 显示对应文案与「重试」。

`kind` 取值:`config`(配置缺失 500)、`upstream`(网关非 2xx,502)、`timeout`(504)、`network`(504)、`parse`。

### 2.5 归一化的"防御式"设计

网关的 `/health`、`/metrics` 精确字段命名尚未冻结。归一化器**容忍多种命名**(snake_case / camelCase / 嵌套 `indexer`/`state`、Prometheus 文本暴露格式),用候选键列表 `pick()` 取值,并始终保留 `raw` 以便调试。一旦网关字段冻结,可收紧归一化器并补精确测试。

## 3. 技术栈

- **Next.js 16(App Router)+ TypeScript 5** —— 与网关同语言,Route Handler 天然做代理
- **Tailwind CSS v4 + shadcn/ui** —— 运维看板 UI
- **TanStack Query v5** —— 数据获取 + 轮询
- **Vitest + Testing Library** —— 单元/组件测试(见 §4)
- **Prettier + ESLint(eslint-config-next)** —— 格式化与静态检查
- **GitHub Actions** —— CI(install → lint → typecheck → format:check → test → build)
- **pnpm**;Node 20+
- **部署 Vercel** —— Deployment Protection 做访问控制,代码不写鉴权

## 4. 测试策略

| 层级            | 范围                                                                                 | 工具                     |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| 单元            | `lib/gateway.ts` 归一化器(纯函数,最高价值)、`lib/env.ts` 校验、`api-client` 错误映射 | Vitest                   |
| 路由            | `app/api/*` Route Handler 成功 + 错误契约(mock `gateway.ts`)                         | Vitest                   |
| 组件(可选,后续) | `ErrorBanner` / `StatusCounts` 渲染态                                                | Vitest + Testing Library |

归一化器是本系统**风险最高**的逻辑(要兼容未知 wire format),优先覆盖。CI 门禁:lint、typecheck、format:check、test、build 全绿才允许合并。

## 5. 部署与访问控制

- Vercel 项目;环境变量在 **Settings → Environment Variables** 配置(不带 `NEXT_PUBLIC_`)。
- **Deployment Protection** 对 Production 与 Preview 都开启(Vercel Authentication 或 Password Protection)。
- 如需 CI/探针访问,用 **Protection Bypass for Automation** token。

## 6. Roadmap(后续阶段,各自独立成 issue)

依赖网关后续暴露/冻结的接口,届时各自补 spec 与精确测试:

1. 链配置展示(`GET /api/v1/info`)
2. 最近支付流水列表(`GET /api/v1/payments`,SSE `/events` 实时状态)
3. Webhook 投递历史与重放(`GET /bep20/:token/logs/`)
4. 测试网余额(热钱包 BNB + 各 token)
5. 发起测试支付操作台

## 7. 决策记录

- **为什么 Next.js 全栈而非 Vite SPA + 独立函数**:前后端同语言、类型共享、Route Handler 一体化代理、Vercel 一等公民,心智负担最低。
- **为什么不直连数据库**:少一条暴露测试库的网络路径,符合"密钥/数据不出网关边界"的原则。
- **为什么鉴权交给 Vercel**:这是内部测试工具,零鉴权代码即可获得密码/SSO 保护,避免自研认证的维护与风险。
- **为什么归一化器先宽后紧**:网关字段未冻结,先容忍多命名保证可用,字段冻结后再收紧并补精确测试。
