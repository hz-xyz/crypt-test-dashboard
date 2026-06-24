# USD1Pay 测试监控站 — 安全/资损漏洞审计报告

审计日期: 2026-06-24

---

## HIGH — 高危

### 1. `VERCEL_AUTOMATION_BYPASS_SECRET` 泄露到浏览器

**位置**: `app/api/payments/route.ts:89-99` + `lib/payments.ts` `normalizeCreate()`

**问题**: `POST /api/payments` 创建支付时，将 `VERCEL_AUTOMATION_BYPASS_SECRET` 拼入 `callbackUrl` 的 query 参数中。`callbackUrl` 随后通过 `CreatePaymentView` 原样返回给浏览器前端（整个 JSON 包含 `callbackUrl` 字段可在 DevTools Network 面板中看到）。

**资损影响**: 拿到 bypass secret 的攻击者可以绕过 Vercel Deployment Protection，直接访问本站所有路由（包括读取支付数据、发起支付、读取回调），等效于**完全绕过访问控制**。

```
// callbackUrl 示例：
https://app.example.com/api/webhooks/usd1pay?ref=xxx&x-vercel-protection-bypass=SECRET_HERE
// ↑ 这个完整 URL 被返回到浏览器 JSON response 中
```

**修复建议**: `CreatePaymentView` 不应包含 `callbackUrl`，或在返回前从中剥离 `x-vercel-protection-bypass` 参数。

---

### 2. Webhook 端点无鉴权 + 验签失败仍入库 → 回调注入/资损误判

**位置**: `app/api/webhooks/usd1pay/route.ts`

**问题**:
- 该端点对互联网完全开放，无任何鉴权（设计如此，依赖 RSA 验签）。
- 但验签**失败的回调仍被 `record()` 存入** callback-store，且 `uuid` 仍被提取。
- 前端 `PaymentTracker` 取第一个带 `uuid` 的回调就开始轮询支付状态。

**攻击场景**: 攻击者只需猜到或窃听到 `ref`（UUID v4，随机性可接受但 callbackUrl 可能泄露，见漏洞#1），即可向 `/api/webhooks/usd1pay?ref=TARGET_REF` POST 一个伪造 body（含任意 `uuid`）。操作台会立刻用这个**虚假 uuid** 去查询网关，展示错误的支付状态，可能导致运维人员**误判支付已完成或已失败**而做出错误操作。

**修复建议**: 验签失败的回调应标记为不可信，前端 `PaymentTracker` 在选取 `uuid` 时应**仅从 `signatureValid: true`** 的回调中选取。

---

### 3. 公钥缓存永不失效 → 密钥轮换后验签全部通过/失败

**位置**: `lib/payments.ts:147-155` `fetchPubkey()`

**问题**: `pubkeyCache` 是一个进程级全局变量，一旦首次获取成功就**永不清除、永不刷新**。如果网关轮换了 RSA 密钥对，本站在不重启的情况下会继续用旧公钥验签 → 所有新回调都会显示**验签失败**（误报），或者如果旧密钥被泄露，攻击者用旧私钥签名的伪造回调会显示**验签通过**（漏报）。

**修复建议**: 为缓存加 TTL（如 5 分钟）；或在验签失败时尝试重新拉取公钥一次。

---

## MEDIUM — 中危

### 4. `raw` 字段将网关内部数据完整透传到浏览器

**位置**: 所有 `*View` 类型（`HealthView`, `MetricsView`, `InfoView`, `CreatePaymentView`, `PaymentView`）均含 `raw: unknown` 字段，通过 Route Handlers 原样返回。

**问题**: `raw` 是网关原始响应的**完整 JSON**，可能包含内部服务器信息（版本号、内部 IP、数据库连接状态、调试字段、错误堆栈）。虽然前端组件未直接渲染 `raw`，但浏览器 DevTools 可直接看到。

**修复建议**: 在生产模式下从响应中剥离 `raw` 字段，或将其仅限于 `?debug=1` 参数时输出。

---

### 5. SSE 代理无并发限制 + 超长超时 → 资源耗尽

**位置**: `app/api/payments/[id]/events/route.ts`

**问题**:
- 超时 = `GATEWAY_TIMEOUT_MS * 60` = 默认 **300 秒（5 分钟）**。每个 SSE 连接同时占用一个客户端连接和一个到网关的上游连接。
- 无任何并发上限。攻击者可打开大量 SSE 连接，耗尽 Vercel serverless 函数并发配额或网关连接池。
- 客户端断开时，上游连接没有被 abort：`reader.read()` 循环会继续读取上游直到上游关闭或 5 分钟超时，浪费服务端资源。

**修复建议**: 监听 `request.signal` 的 abort 事件来及时关闭上游连接；考虑限制每 IP 的并发 SSE 连接数。

---

### 6. `POST /api/payments` 无速率限制 → 代理放大网关限流

**位置**: `app/api/payments/route.ts`

**问题**: 网关限流 60 次/分钟/IP。本站作为代理，所有用户的请求都从**同一个服务端 IP** 发出。攻击者可通过本站快速发起大量创建请求，导致本站 IP 被网关限流（429），**影响所有合法用户**。其他只读代理路由 (`/api/health`, `/api/metrics`, `/api/info`) 同理。

**修复建议**: 在 Route Handler 层面加入基本的速率限制（如使用 `Map` + 滑动窗口或 Upstash 的 `@upstash/ratelimit`）。

---

### 7. `confirmations` 参数无服务端校验

**位置**: `app/api/payments/route.ts:84` → `lib/payments.ts` `createPayment()`

**问题**: README 声明 `confirmations` 范围为 1-1000，但服务端**未做任何校验**，直接透传给网关。攻击者可设置 `confirmations: 0` 绕过确认（如果网关不校验），或设置超大值导致支付永远无法完成。

**修复建议**: 服务端校验 `confirmations` 在 `[1, 1000]` 范围内。

---

### 8. `address` (payout 地址) 无格式校验

**位置**: `app/api/payments/route.ts:80-82`

**问题**: 转出地址仅做了 `.trim()`，未校验是否为合法的以太坊/BSC 地址（`0x` 前缀 + 40 hex 字符）。恶意输入直接透传到网关。如果网关对 `address` 参数校验也不严格，可能导致资金发送到无效地址（不可逆的资损）。

**修复建议**: 添加 `^0x[0-9a-fA-F]{40}$` 正则校验。

---

## LOW — 低危

### 9. `GET /api/webhooks` 无 ref 时返回全量回调记录

**位置**: `app/api/webhooks/route.ts`

**问题**: 不带 `ref` 参数时返回**所有用户**的最近回调记录（含支付金额、地址、txid 等）。在多人共用一个测试看板的场景下，构成信息泄露。

---

### 10. Redis key 无命名空间隔离

**位置**: `lib/callback-store.ts`

**问题**: Redis key 格式为 `cb:ref:{ref}` 和 `cb:recent`。如果同一个 Upstash 实例被多个环境/应用共用，会产生命名冲突。攻击者可构造特定 `ref` 值尝试读取其他应用的数据（虽然 `ref` 是 UUID 难以猜测）。

---

### 11. `.env.example` 中 `GATEWAY_BASE_URL` 默认为 HTTP

**位置**: `.env.example:12`

**问题**: `GATEWAY_BASE_URL=http://127.0.0.1:8080` 使用明文 HTTP。如果在非 localhost 场景下（如跨容器、跨主机）使用 HTTP，网关 admin token 和所有支付数据在网络上明文传输，存在 MITM 风险。

---

### 12. `gatewayFetch` 仅支持 GET，`createPayment` 传参通过 URL query

**位置**: `lib/gateway.ts:52` + `lib/payments.ts:95`

**问题**: 创建支付的 `address`（用户的 payout 地址）被放在 URL query 参数中。URL 通常会被 Web 服务器、CDN、Vercel 的日志系统记录。虽然 `address` 不是密钥级别的敏感信息，但用户的链上地址出现在 URL 日志中是一个隐私泄露点。

---

## 总结

| 严重等级 | 数量 | 核心风险点 |
|---------|------|-----------|
| **HIGH** | 3 | bypass secret 泄露浏览器；伪造回调注入；公钥缓存永不失效 |
| **MEDIUM** | 5 | raw 数据透传；SSE 资源耗尽；代理放大限流；输入校验缺失 |
| **LOW** | 4 | 回调记录全量返回；Redis 无隔离；HTTP 明文；地址入日志 |

**最具资损风险的组合**: 漏洞 #1 (bypass secret 泄露) + #2 (回调注入) → 攻击者可绕过访问控制，向操作台注入伪造的支付完成回调，误导运维人员认为支付已完成而进行放款操作。
