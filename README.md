# USD1Pay · 测试环境监控站

一个面向 **USD1Pay**(BSC 稳定币支付网关,支持 USD1 / USDT / USDC BEP-20)**测试环境**的只读运维监控看板。

本站**不重新实现网关逻辑**,只通过 HTTP 消费网关已暴露的接口。第一屏聚焦:

- **支付状态计数**(CREATED / PENDING / CONFIRMING / CONFIRMED / COMPLETED / FAILED / EXPIRED)— 状态徽章 + 数字卡片,来源 `/metrics`
- **网关健康度** — 整体 UP/DOWN、getLogs 策略(per-address / bulk)、区块游标差距(`last_processed_block` 与链高)、watch set 大小,来源 `/health`
- **链配置** — 链 ID、确认数、token 合约地址、费率,来源 `/api/v1/info`
- **自动轮询**(每 4s)+ 最后刷新时间
- **网关不可达 / 超时 / 报错** 时的明确错误态(超时、无法连接、上游错误、配置缺失分别提示),绝不静默

此外提供一个 **发起测试支付操作台**(`/console`,Roadmap R5):发起测试支付 → 展示收款地址 → 接收并验签网关回调 → 展示权威终态,用于联调验证网关改动。详见下方[「R5 操作台:本地联调」](#r5-操作台本地联调)。

## 架构原则

1. **密钥不出服务端**:网关地址、admin token 等只通过 `process.env` 在 Route Handler(`app/api/*`)里使用。`lib/env.ts` 与 `lib/gateway.ts` 都 `import "server-only"`,一旦被客户端 bundle 引用即编译报错。
2. **前端只调用本站 `/api/*`**:浏览器永不直连测试网关,也不知道网关真实地址。Route Handler 负责转发、附加 token、超时控制与错误归一化。
3. **不直连测试库 PostgreSQL**:深度数据观测后续走网关新增的只读接口,而非从本站直连数据库。
4. **配置走环境变量**:见 `.env.example`;真实 `.env*` 已被忽略。

## 技术栈

- Next.js 16(App Router)+ TypeScript
- Tailwind CSS v4 + shadcn/ui
- TanStack Query(数据获取 + 轮询)
- Route Handlers 作为轻后端代理
- 部署:Vercel(用 Deployment Protection 做访问控制,代码里不写认证逻辑)
- 包管理:pnpm;Node 20+

## 目录结构

```
app/
  api/
    health/route.ts            # 代理 → 网关 /health(归一化为 HealthView)
    metrics/route.ts           # 代理 → 网关 /metrics(归一化为 MetricsView)
    info/route.ts              # 代理 → 网关 /api/v1/info(归一化为 InfoView,链配置)
    payments/route.ts          # POST 发起测试支付(R5)
    payments/[id]/route.ts     # GET 查单笔(R5)
    webhooks/usd1pay/route.ts  # 接收网关回调,验签 + 入缓冲(R5,Node runtime)
    webhooks/route.ts          # GET 读最近回调(R5)
  console/page.tsx             # 操作台页面(R5,服务端读默认转出地址)
  layout.tsx                   # 根布局,挂载 Providers
  providers.tsx                # TanStack Query Provider(client)
  page.tsx                     # 首屏 → <Dashboard/>
components/
  ui/                          # shadcn/ui 原子组件
  dashboard/                   # 看板组件(状态卡片、健康面板、错误态、刷新指示)
  console/                     # 操作台组件(发起表单、追踪、回调时间线)(R5)
lib/
  env.ts                       # 环境变量校验(server-only,缺失即抛错)
  gateway.ts                   # 网关 client + 响应归一化(server-only)
  payments.ts                  # 支付创建/查单/验签/归一化(server-only,R5)
  callback-store.ts            # 回调内存环形缓冲(server-only,R5)
  api-client.ts                # 浏览器侧 fetch 封装(只打 /api/*)
  types.ts                     # 共享类型(client/server 安全,无密钥)
```

## 本地启动

前置:Node 20+、pnpm。

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local
#   编辑 .env.local,填入 GATEWAY_BASE_URL(GATEWAY_ADMIN_TOKEN 仅网关启用鉴权时才需要)

# 3. 启动开发服务器
pnpm dev
# 打开 http://localhost:3000
```

### 网关不可用时的行为

即使网关地址不通 / 未配置,页面也**不会崩溃**:

- 缺少必需环境变量 → 接口返回 `config` 错误,页面显示「服务端配置缺失」。
- 网关连不上 / 超时 → 显示「无法连接网关」/「网关响应超时」并提供「重试」。
- 网关返回非 2xx → 显示「网关返回错误」并带上 HTTP 状态码。

各支付状态卡片在无数据时仍以 0 渲染,保持看板结构稳定。

## R5 操作台:本地联调

操作台用于在本地把支付网关跑通「发起支付 → 接收回调 → 终态」整条链路。**回调只存在内存环形缓冲、仅本地单进程有效**,因此请在本地 `pnpm dev` 下使用(不要依赖部署到 Vercel 后可靠收回调——多实例会丢)。

**前置**:本地起好 USD1Pay 网关,且网关能回访到本站(下一步的 `PUBLIC_APP_URL`)。

```bash
# .env.local 增配(均可选):
#   PUBLIC_APP_URL          本站对外地址,默认 http://localhost:3000;必须是网关能回访到的地址
#                           (网关在 Docker 里时用宿主机可达地址,如 http://host.docker.internal:3000)
#   DEFAULT_PAYOUT_ADDRESS  默认转出地址 address_out,配了则表单预填、创建时可省略 address
pnpm dev
```

**操作流程**:

1. 打开 `http://localhost:3000/console`(或监控盘右上角「发起测试支付 →」)。
2. 选币种、填转出地址 `address_out`(配了 `DEFAULT_PAYOUT_ADDRESS` 则已预填),可选确认数 / pending 回调,点「发起测试支付」。
3. 复制页面上的**收款地址** `address_in`,向其转入对应测试币。
4. 网关确认并转出后会回调本站;回调列表实时出现,带**验签徽章**(对网关 `/pubkey/` 校验签名)。
5. 回调携带 `uuid` 后,操作台自动查询 `/api/v1/payments/{uuid}`,展示**权威终态**(COMPLETED / FAILED / EXPIRED)与到账金额、txid。

**约束与说明**:

- 回调接收端对**原始字节**验 `x-ca-signature`(RSA-SHA256),验签失败仍记录(标红)而非丢弃,应答固定返回 `200 ok`。
- 每次发起用唯一 callback URL(带 `ref` nonce)绕开网关的 callback 幂等去重。
- 网关支付接口**无鉴权**,限流 60 次/分钟/IP(超出 429)。
- 金额按 18 位精度(÷10^18)换算为币本位展示。
- 接口契约见网关仓库 `usd1pay/docs/payment-callback-integration-guide.md`。

## 部署到 Vercel

```bash
# 安装 Vercel CLI(如未安装)
pnpm add -g vercel

# 在项目根目录链接 / 部署
vercel            # 预览部署
vercel --prod     # 生产部署
```

### 配置环境变量(Vercel)

在 Vercel 项目 **Settings → Environment Variables** 添加(或用 CLI):

```bash
vercel env add GATEWAY_BASE_URL
vercel env add GATEWAY_ADMIN_TOKEN  # 可选,仅网关启用鉴权时才需要
vercel env add GATEWAY_TIMEOUT_MS   # 可选
```

> 这些变量只在服务端使用,**不要**加 `NEXT_PUBLIC_` 前缀,否则会被打进浏览器 bundle。

### 开启 Deployment Protection(访问控制)

本站代码里**不写任何认证逻辑**,访问控制完全交给 Vercel 平台:

1. 打开 Vercel 项目 → **Settings → Deployment Protection**。
2. 启用 **Vercel Authentication**(要求访问者用其 Vercel 账号登录,适合内部团队),
   或启用 **Password Protection** 设置一个共享访问密码。
3. 建议对 **Production 与 Preview** 都开启,确保测试看板不被公网匿名访问。
4. 如需让 CI / 监控探针访问,使用 **Protection Bypass for Automation** 生成 bypass token。

> 因为监控的是**测试**网关且看板可读取运行态,务必开启上述保护,避免测试数据 / 网关状态对外暴露。

### 发布前核对

- [ ] `GATEWAY_BASE_URL` 已在 Vercel 配置(网关有鉴权时再加 `GATEWAY_ADMIN_TOKEN`),且**不带** `NEXT_PUBLIC_` 前缀
- [ ] Production 与 Preview 均已开启 Deployment Protection
- [ ] CI 全绿（format / lint / typecheck / test / build）
- [ ] 预览部署打开后,网关连通时显示计数与健康度;断开时显示明确错误态（非崩溃）

## 下一步(已预留结构,本次未实现)

- ✅ 链配置展示(`/api/v1/info`)— 已实现(R1)
- ✅ 发起测试支付操作台 — 已实现(R5,见上)
- 最近支付流水列表 + SSE 实时状态(`/api/v1/payments`、`/events`)
- Webhook 投递历史与重放(`/bep20/:token/logs/`)
- 测试网余额(热钱包 BNB + 各 token)
- 深度数据观测:走网关**新增只读接口**,而非直连 PostgreSQL
