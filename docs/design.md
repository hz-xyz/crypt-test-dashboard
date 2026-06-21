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
- 不写网关业务逻辑、本站**不自行广播链上交易**(操作台只请求网关分配收款地址,测试者自行向该地址转测试币)
- 不做多租户、不做告警通知(后续可加)

> **范围更新(R5 提前)**:原 Roadmap 第 5 项「发起测试支付操作台」已**提前实施**,目的是为正在迭代的支付网关提供一个能跑通完整支付+回调链路的测试平台。它新增本站第一条**写/副作用路径**与第一个**回调接收端**,见 §2.2 原则 5–6 与 §2.6 数据流。

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
5. **写/副作用路径同样经服务端代理**(R5):发起测试支付走网关 CryptAPI 风格 `GET /bep20/{token}/create/`(创建即分配链上收款地址,属副作用)。前端只 `POST /api/payments`,绝不直连网关;callback URL、转出地址等参数在服务端拼装。
6. **回调接收端(R5,新方向「网关 → 本站」)**:网关向本站 `POST` 异步回调。接收端的不可动摇约束:
   - **对原始字节验签**:`x-ca-signature` 是网关用 RSA 私钥对 body 原始字节做的 RSA-SHA256(base64),公钥取自网关 `GET /pubkey/` 并缓存。必须读 `arrayBuffer()` 原始字节验签,**不得**先 `JSON.parse` 再 `JSON.stringify`。
   - **应答契约**:返回 HTTP `200` 且响应体文本含 `ok`(不区分大小写),否则网关判失败并按指数退避重试。
   - **仅内存、仅本地**:收到的回调只进**内存环形缓冲**(模块级,容量上限 N),供 UI 轮询读回。**部署到多实例会丢数据**——本特性按「本地 `next dev` 单进程」设计,生产多实例可靠收回调属非目标(后续如需,换 KV/Redis 共享存储)。

### 2.3 模块边界(每个文件单一职责)

| 文件                                | 职责                                                                                                  | 依赖                               | 客户端可引用?   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------- |
| `lib/env.ts`                        | 校验并缓存必需环境变量,缺失即抛错                                                                     | `process.env`                      | 否(server-only) |
| `lib/gateway.ts`                    | 网关 fetch(带 token/超时)+ 响应归一化                                                                 | `env.ts`, `types.ts`               | 否(server-only) |
| `lib/types.ts`                      | 归一化后的视图模型与错误契约,无密钥                                                                   | 无                                 | 是              |
| `lib/api-client.ts`                 | 浏览器侧 fetch,只打 `/api/*`,把 `ApiError` 抛成 `ApiClientError`                                      | `types.ts`                         | 是              |
| `app/api/health/route.ts`           | 代理 → 网关 `/health`                                                                                 | `gateway.ts`                       | —(服务端路由)   |
| `app/api/metrics/route.ts`          | 代理 → 网关 `/metrics`                                                                                | `gateway.ts`                       | —(服务端路由)   |
| `components/dashboard/*`            | 看板 UI(状态卡片、健康面板、错误态、刷新指示)                                                         | `api-client.ts`, `types.ts`        | 是              |
| **R5 操作台模块**                   |                                                                                                       |                                    |                 |
| `lib/payments.ts`                   | 创建支付(GET+query)、查单笔、拉取并缓存 `/pubkey/`、验签、归一化(创建响应 / 查单 wei→币本位 / 回调体) | `env.ts`, `types.ts`               | 否(server-only) |
| `lib/callback-store.ts`             | 内存环形缓冲:`record()` / `listByRef()` / `listRecent()`,按 `ref` 关联回调                            | `types.ts`                         | 否(server-only) |
| `app/api/payments/route.ts`         | POST(UI→):生成 `ref` 与 callback URL → 调网关创建 → 返回 `{ ref, addressIn, callbackUrl, raw }`       | `payments.ts`, `env.ts`            | —(服务端路由)   |
| `app/api/payments/[id]/route.ts`    | GET:代理查单笔 `GET /api/v1/payments/{id}`,金额 wei→币本位                                            | `payments.ts`                      | —(服务端路由)   |
| `app/api/webhooks/usd1pay/route.ts` | POST(网关→):读原始字节、验签、按 `ref` 入缓冲、返回 `200 "ok"`(Node runtime)                          | `payments.ts`, `callback-store.ts` | —(服务端路由)   |
| `app/api/webhooks/route.ts`         | GET:UI 轮询读最近回调(可按 `ref` 过滤)                                                                | `callback-store.ts`                | —(服务端路由)   |
| `components/console/*`              | 操作台 UI(发起表单、收款地址、回调时间线、权威终态)                                                   | `api-client.ts`, `types.ts`        | 是              |

### 2.4 数据流与错误契约

成功:网关原始响应 → `normalizeHealth` / `normalizeMetrics` 转为 `HealthView` / `MetricsView` → Route Handler 返回 JSON → `api-client` 透传 → TanStack Query 缓存渲染。

失败:`gateway.ts` 把失败归一为 `{ ok:false, error:{kind,...}, httpStatus }`,Route Handler 用 `httpStatus`(500/502/504)返回 `{ error }`;`api-client` 检测到 `ApiError` 形状即抛 `ApiClientError(kind, message)`;`ErrorBanner` 据 `kind` 显示对应文案与「重试」。

`kind` 取值:`config`(配置缺失 500)、`upstream`(网关非 2xx,502)、`timeout`(504)、`network`(504)、`parse`。

### 2.5 归一化的"防御式"设计

网关的 `/health`、`/metrics` 精确字段命名尚未冻结。归一化器**容忍多种命名**(snake_case / camelCase / 嵌套 `indexer`/`state`、Prometheus 文本暴露格式),用候选键列表 `pick()` 取值,并始终保留 `raw` 以便调试。一旦网关字段冻结,可收紧归一化器并补精确测试。

### 2.6 R5 操作台:发起、追踪与回调接收

网关支付接口为 **CryptAPI 风格**(权威文档:`usd1pay/docs/payment-callback-integration-guide.md`),无鉴权,限流 60/min/IP。关键约束已冻结,故归一化器可写**精确**而非防御式。

**接口事实(决定设计):**

- 创建是 `GET /bep20/{token}/create/?callback=...&address=...`(`token` 小写),**响应不含 payment id**,只回 `address_in`。
- callback URL 是**幂等去重键**:同一 callback 重复创建返回同一笔。故每次发起必须用**唯一** callback URL。
- payment id(`uuid`)只在**回调体**、查单接口、托管页 `/pay/{id}` 出现。
- 创建的**业务错误也返回 HTTP 200**,靠 `status:"error"` 区分。
- 查单 `GET /api/v1/payments/{id}` 的金额(`amount_received`/`fee`)是 **18 位精度最小单位字符串**,需 ÷10^18。

**数据流(等回调拿 uuid → 查单笔;logs 作创建后到回调前的进度视图):**

```
浏览器 /console
  │ ① POST /api/payments  { token, address, confirmations?, pending? }
  ▼
app/api/payments  ── 生成 ref(nonce)与 callback={PUBLIC_APP_URL}/api/webhooks/usd1pay?ref={ref}
  │ ② GET /bep20/{token}/create/?callback=...&address=...
  ▼
网关 ── 返回 address_in ──▶ UI 展示收款地址;测试者向其转测试币
  │
  │ ③(进度)UI 轮询 GET /api/webhooks?ref= 看是否收到回调;
  │     同时轮询 GET /bep20/{token}/logs/?callback= 看链上入账/投递历史
  │ ④ 网关确认转出后 POST 回调 → app/api/webhooks/usd1pay?ref=
  │     验签(/pubkey/)→ 入内存环形缓冲 → 返回 200 "ok"
  │ ⑤ UI 从缓冲读到带 uuid 的回调 → 轮询 GET /api/payments/{uuid} 展示权威终态
  ▼
COMPLETED / FAILED / EXPIRED(终态)
```

**新增环境变量**:

- `PUBLIC_APP_URL`(默认 `http://localhost:3000`),仅服务端用于拼装交给网关的**绝对** callback URL。它必须是网关能回访到的地址(本地联调即本机端口;若网关在容器内,用宿主机可达地址)。
- `DEFAULT_PAYOUT_ADDRESS`(**可选**,无默认值):测试支付的默认转出地址 `address_out`。配了它,`/console` 表单预填该值、且 `POST /api/payments` 在未传 `address` 时兜底用它;没配则该字段必填。免去联调时每次手敲地址。

两者均**不带** `NEXT_PUBLIC_`(转出地址非密钥,但仍只在服务端读取,经 `/console` 服务端页以 prop 传给客户端表单,不进客户端 bundle 的环境读取路径)。

**错误契约扩展**:§2.4 的 `kind` 联合为 R5 追加 `gateway`——创建接口的**业务错误返回 HTTP 200 + `status:"error"`**,归一化时据此判失败并映射为 `kind:"gateway"`(携带网关 `error` 文案);限流 `429` 复用 `upstream` 并带 `status:429`。前端 `ErrorBanner` 据 `kind` 渲染对应文案。

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

1. 链配置展示(`GET /api/v1/info`)— ✅ 已实现
2. 最近支付流水列表(`GET /api/v1/payments`,SSE `/events` 实时状态)
3. Webhook 投递历史与重放(`GET /bep20/:token/logs/`)
4. 测试网余额(热钱包 BNB + 各 token)
5. **发起测试支付操作台 — 🚧 已提前实施(本设计 §2.6)**,因需测试平台验证网关改动

> R5 原排在最后,现因「需要一个能跑通完整支付+回调的测试平台来验证网关迭代」而提前到 R1 之后、R2–R4 之前。R2/R3 与 R5 共享 `GET /api/v1/payments` 与 logs 接口,可在 R5 落地后顺势补全。

## 7. 决策记录

- **为什么 Next.js 全栈而非 Vite SPA + 独立函数**:前后端同语言、类型共享、Route Handler 一体化代理、Vercel 一等公民,心智负担最低。
- **为什么不直连数据库**:少一条暴露测试库的网络路径,符合"密钥/数据不出网关边界"的原则。
- **为什么鉴权交给 Vercel**:这是内部测试工具,零鉴权代码即可获得密码/SSO 保护,避免自研认证的维护与风险。
- **为什么归一化器先宽后紧**:网关字段未冻结,先容忍多命名保证可用,字段冻结后再收紧并补精确测试。
- **(R5)为什么把 R5 提前**:支付网关正在迭代,需要一个能发起支付并接收回调、跑通完整链路的测试平台来验证改动。R5 的接口契约(CryptAPI 风格)已冻结,可写精确实现。
- **(R5)为什么用「等回调拿 uuid 再查单笔」而非 logs 反查为主**:回调是商户对账的权威依据,也正是要测的核心链路;以回调到达为触发、再查 `/api/v1/payments/{uuid}` 拿权威终态最贴近真实接入。但回调到达前 UI 会「盲」,故**保留 logs 反查**作为创建后到回调前的进度视图(看链上是否入账、卡在哪一步),兼顾「回调坏掉时也能看到进度」的调试需求。
- **(R5)为什么回调只进内存、仅本地**:本特性服务于「本地起网关 + 操作台联调」,内存环形缓冲零依赖最省心;多实例可靠收回调需共享存储(KV/Redis),非当前目标,明确写入非目标避免误用。
- **(R5)为什么坚持对原始字节验签**:这既是 CryptAPI 接入要求,也顺带验证了网关签名实现是否正确——对「测网关」本身有价值。验签失败仍记录(标 `signatureValid:false`)以便观测,不静默丢弃。
