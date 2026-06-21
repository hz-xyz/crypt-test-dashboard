# 设计:线上长期可靠接收网关回调

> 状态:待评审 · 日期:2026-06-22 · 关联:R5 操作台(`/console`)

## 1. 背景与目标

R5 操作台(`/console`)实现了「发起测试支付 → 接收网关回调 → 展示权威终态」整条链路,但当前回调接收端([lib/callback-store.ts](../../../lib/callback-store.ts))是**进程内内存环形缓冲**,且生产站开着 Deployment Protection(匿名 401)。因此线上有两个硬阻塞:

1. **401 保护挡住网关回调**:网关 `POST /api/webhooks/usd1pay` 被 Vercel 边缘拦截,函数根本不执行。
2. **内存缓冲跨实例丢失**:Vercel 多实例下,回调落在实例 A、操作台轮询落在实例 B,即便单用户低流量也会丢。

**目标**:让部署在 Vercel 的本站长期在线、可靠接收并展示网关回调。

**用途定位**:个人使用、免本地环境、低流量。不追求多人协作或高吞吐。

**非目标**:
- 不做 Webhook 投递历史的完整查询/重放(那是 R3,另立 spec)。
- 不改动验签逻辑、不改支付创建的对外契约(回调 URL 形态除外)。
- 不引入多人鉴权体系(继续用 Vercel Deployment Protection)。
- 二维码不做 EIP-681 支付 URI(钱包支持不一、缺 token 合约/chainId 数据);仅编码纯地址。

> 本 spec 含两块可独立实现的工作:**A. 持久化在线收回调**(§3、基础设施)与 **B. 充值地址复制 + 二维码**(§3.7、UI)。二者都服务于「让 `/console` 在线可用」,一并规划落地。

## 2. 方案总览

```
网关 ──POST──▶ /api/webhooks/usd1pay?ref=<uuid>&x-vercel-protection-bypass=<secret>
                    │  Vercel 边缘:bypass token 命中 → 放行(无需登录)
                    ▼
              RSA 验签(不变) → 写 Upstash Redis(KV)
                                   ▲
操作台(仍需登录)──轮询 GET /api/webhooks?ref=──┘ 从 Redis 读
```

四处改动 + 一处配置:
- **存储**:callback-store 内部从内存换成 Upstash Redis(REST),保持对外接口不变但改为 async。
- **放行**:支付创建时把 `VERCEL_AUTOMATION_BYPASS_SECRET` 作为 `x-vercel-protection-bypass` query 追加到回调 URL。
- **env**:`lib/env.ts` 新增可选 `VERCEL_AUTOMATION_BYPASS_SECRET`。
- **UI**:充值地址加明确的复制按钮(带反馈)与可扫描二维码(§3.7)。
- **配置**:Vercel Production 已配 `PUBLIC_APP_URL`、Upstash KV、Bypass for Automation(均已就位)。

## 3. 组件设计

### 3.1 `lib/redis.ts`(新增,server-only)

懒加载单例 Upstash Redis 客户端。**注意命名**:Vercel Marketplace 的 Upstash 集成注入的是 `KV_*` 前缀,不是 `UPSTASH_REDIS_REST_*`,因此不能用 `Redis.fromEnv()`,需显式传参。

```ts
import "server-only";
import { Redis } from "@upstash/redis";

let client: Redis | null | undefined; // undefined=未初始化, null=未配置

/** 返回 Redis 客户端;未配置 KV 环境变量时返回 null(本地 dev 走内存降级)。 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}
```

依赖:新增 `@upstash/redis`(运行时依赖)。

### 3.2 `lib/callback-store.ts`(改造,保持接口语义)

对外仍是 `record / listByRef / listRecent / __resetForTest`,但**全部改为 async**(Redis 是异步)。内部按 `getRedis()` 是否为 null 选择后端:

- **Redis 后端**(生产):
  - `record(entry)`:对两个 key 各 `LPUSH` entry 对象(SDK 自动编码,新→旧)→ `LTRIM 0 CAP-1` 封顶 → `EXPIRE TTL`。
    - 按 ref:`cb:ref:<ref>`,cap = `CALLBACK_BUFFER_CAP`(50),TTL = 7 天。
    - 全局最近:`cb:recent`,cap = 100,TTL = 7 天。
  - `listByRef(ref)`:`LRANGE cb:ref:<ref> 0 -1` → 反序列化(已是新→旧)。
  - `listRecent(limit)`:`LRANGE cb:recent 0 limit-1`。
  - `__resetForTest()`:`DEL` 两类 key(测试用,见下)。
- **内存后端**(本地 dev,`getRedis()===null`):保留现有环形缓冲逻辑,包成 async 返回。

> 序列化约定:`@upstash/redis` 会**自动**对存入对象做 JSON 编码、对取出值做 JSON 解码。`CallbackRecord` 是纯 JSON 对象,因此**直接 `LPUSH` 对象、`LRANGE` 得回对象**,不要再手动 `JSON.stringify/parse`(会双重编码)。测试用的 mock Redis 须复刻这一「存对象取对象」语义。

时间常量集中为命名常量:`CALLBACK_BUFFER_CAP = 50`、`RECENT_CAP = 100`、`CALLBACK_TTL_SECONDS = 7 * 24 * 3600`。

### 3.3 `app/api/webhooks/usd1pay/route.ts`(微调)

仅把 `record({...})` 改为 `await record({...})`。验签、`200 ok` 应答、raw-bytes 处理全部不变。函数无需检查 bypass(Vercel 边缘已放行)。

### 3.4 `app/api/webhooks/route.ts`(微调)

`listByRef` / `listRecent` 改为 `await`。

### 3.5 `app/api/payments/route.ts`(回调 URL 追加 bypass)

当前:
```ts
const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?ref=${ref}`;
```
改为:当 `VERCEL_AUTOMATION_BYPASS_SECRET` 存在时追加 query;不存在则照旧(本地/公开场景不受影响)。

```ts
const params = new URLSearchParams({ ref });
if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  params.set("x-vercel-protection-bypass", env.VERCEL_AUTOMATION_BYPASS_SECRET);
}
const callbackUrl = `${env.PUBLIC_APP_URL}/api/webhooks/usd1pay?${params}`;
```

### 3.6 `lib/env.ts`(新增可选变量)

`Env` 接口加 `VERCEL_AUTOMATION_BYPASS_SECRET?: string`;读取 `process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || undefined`,**不加入 required 校验**(本地无此变量应正常)。

### 3.7 充值地址:复制按钮 + 二维码(UI)

创建支付后,[components/console/payment-tracker.tsx](../../../components/console/payment-tracker.tsx) 展示 `addressIn`。现状仅「点整行静默复制」,无明确按钮/反馈、无二维码。改造:

**新依赖**:`qrcode.react`(`QRCodeSVG`,输出 SVG,无 canvas)。`lucide-react`(已有)用 `Copy`/`Check` 图标。

- **增强 `CopyableField`**:值旁加独立复制图标按钮;点击 `navigator.clipboard.writeText(value)` 后图标切 `Check` 并显示「已复制」,2 秒后复位(`useState` + `setTimeout`,组件卸载清理 timer)。addressIn 与 ref 共用。
- **新增 `AddressQR`**(同文件内小组件,或 `components/console/address-qr.tsx`):仅对 `addressIn` 渲染 `<QRCodeSVG value={address} size={140} />`。
  - **固定黑模块 + 白底**(带 quiet zone 内边距的白色圆角盒),**不随主题深浅变化** —— 保证钱包扫码的高对比。
  - `aria-label="充值地址二维码"`。
- **布局**:二维码置于「本次支付」卡片的收款地址区域旁/上方,扫码即转账。

**错误/边界**:`navigator.clipboard` 不可用(非 HTTPS / 老浏览器)时,复制按钮静默失败但不报错(生产是 HTTPS,可用)。`addressIn` 为空时不渲染二维码。

1. 用户在 `/console`(登录后)发起支付 → `POST /api/payments`。
2. 服务端生成 `ref`、拼带 bypass 的 `callbackUrl`,调网关创建支付。
3. 网关在状态变更时 `POST callbackUrl`;Vercel 边缘凭 bypass query 放行。
4. webhook 函数验签 → `await record(...)` 写 Redis → 回 `200 ok`。
5. 操作台轮询 `GET /api/webhooks?ref=<ref>`(登录态,正常走保护)→ 从 Redis 读 → 显示验签徽章、终态。

## 5. 错误处理

- **Redis 不可达 / 报错**:`record` 内 `try/catch`,失败不抛(仍回 `200 ok`,避免网关重试风暴),但 `console.error` 记录;`list*` 失败返回空数组,操作台显示「暂无回调」而非崩溃。
- **KV 未配置**(本地):`getRedis()` 返回 null → 内存降级,行为同今。
- **bypass 缺失**:回调 URL 不带 bypass query;线上会被 401 挡 —— 这是预期(未开放 automation 时本就不该收回调)。文档需提示。

## 6. 安全考量

- bypass secret 会出现在交给网关的 callback URL 中,可能进网关日志。对个人测试环境可接受;真正的伪造防护是 RSA 验签(不变)。
- `VERCEL_AUTOMATION_BYPASS_SECRET` 仅服务端读取,不带 `NEXT_PUBLIC_`,不进浏览器 bundle。
- 看板/操作台其余路径继续要求 Vercel 登录;只有 `/api/webhooks/usd1pay` 凭 bypass 放行。

## 7. 测试

- `lib/redis.ts`:`getRedis()` 在有/无 `KV_REST_API_URL/TOKEN` 时分别返回客户端 / null(stub env)。
- `lib/callback-store.ts`:
  - 内存后端:沿用现有语义(封顶、newest-first、按 ref 过滤)。
  - Redis 后端:注入 mock Redis,断言 `record` 触发 `LPUSH/LTRIM/EXPIRE`(两个 key)、`listByRef/listRecent` 调 `LRANGE` 并正确反序列化为新→旧。
- `app/api/payments/route.ts`:secret 存在时 callbackUrl 含 `x-vercel-protection-bypass`、不存在时不含;`ref` 始终存在。
- `lib/env.ts`:新可选变量,有值取值、空/未设为 undefined。
- 既有 webhook/payments 路由测试:适配 async store(mock store 返回 Promise)。
- `payment-tracker`(UI):渲染后存在 `<svg>`(二维码)与地址文本;点复制按钮调用 `navigator.clipboard.writeText(addressIn)`(mock clipboard)并出现「已复制」反馈;`addressIn` 为空时不渲染二维码。

## 8. 配置清单(Vercel,均已就位)

| 变量 / 设置 | 来源 | 状态 |
|---|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Marketplace Upstash 集成 | ✅ |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Protection Bypass for Automation | ✅ |
| `PUBLIC_APP_URL = https://crypt-test-dashboard.vercel.app` | 手动 | ✅ |
| `GATEWAY_BASE_URL` | 此前 | ✅ |

## 9. 验证(实现后)

由于看板/操作台受保护,无法匿名抓取页面验证。验证方式:
- 单测全绿(含上述新增)。
- 部署后从 `/console`(登录)发起一笔测试支付,观察回调列表出现、验签徽章、终态;Redis 中可见 `cb:ref:<ref>` key。
- 直接对 `/api/webhooks/usd1pay?...&x-vercel-protection-bypass=<secret>` 发一个带签名的 POST,应得 `200 ok` 而非 401。

## 10. 文档更新

README 的「R5 操作台」一节补充「线上模式」:说明三个配置项、bypass secret 进网关日志的权衡、以及内存→Redis 的行为差异。
