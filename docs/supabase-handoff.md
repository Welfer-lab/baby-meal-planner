# Supabase 现状交接（给 Claude）

这份文档不是部署教程，而是给接手这个仓库的人快速说明：目前 Supabase 在项目里做到哪一步了、哪些地方已经接上、哪些地方还没真正跑通。

## TL;DR

- 仓库里已经有 Supabase 集成代码，但默认配置是空的，所以当前仓库直接跑起来仍然是本地模式。
- 这套设计不是多用户系统，而是“一个共享邮箱 + 一个共享状态文档 + Realtime 推送”。
- 构建时会把 Vercel 环境变量写进 `dist/src/runtime-config.js`，源码里不会提交真实 Supabase key。
- 云同步逻辑已经写在 `src/main.js`，包括 session 检查、读取共享状态、upsert 保存、Realtime 订阅。
- 目前最大的实际缺口不是数据库结构，而是登录入口 UI 没有真正接通：`renderAuthShell()` 和 `send-magic-link` 都在，但 `render()` 里切到登录页的逻辑被注释掉了，所以未登录用户在现有 UI 里没有明显入口去发送 magic link。

## 这套 Supabase 方案的目标

项目想解决的是“家里两台手机共用同一份辅食计划数据”，不是做完整账户系统。

当前方案是：

- 用一个共享邮箱登录
- 所有设备共用同一个 `shared_state` 记录
- 整个前端状态作为一个 JSON 文档写进 Supabase
- 通过 Realtime 在设备之间推送更新

也就是说，这里没有：

- 多家庭隔离模型
- 邀请码体系
- 精细化权限
- 服务端合并逻辑

## 仓库里跟 Supabase 最相关的文件

- `src/main.js`
  云同步主逻辑都在这里：初始化 Supabase client、处理 session、拉取云端状态、保存、订阅 Realtime。
- `src/runtime-config.js`
  本地默认运行时配置。当前仓库里这个文件是空配置占位。
- `scripts/build.mjs`
  构建时把环境变量注入到 `dist/src/runtime-config.js`。
- `index.html`
  通过 CDN 引入 `@supabase/supabase-js@2`。
- `docs/supabase-setup.md`
  已有的部署/配置说明，偏操作手册。
- `docs/plans/2026-03-17-supabase-shared-sync.md`
  当时的实现计划，可以帮助理解原始设计意图。
- `tests/state.test.js`
  有少量和 Supabase 相关的静态检查，但不是端到端联调测试。

## 当前实现状态

### 1. SDK 已接入

`index.html` 已通过 CDN 加载 `@supabase/supabase-js@2`，前端在浏览器里直接用 `globalThis.supabase.createClient(...)` 初始化客户端。

### 2. 运行时配置采用“源码空值 + 构建注入”

`src/runtime-config.js` 当前默认值是：

- `supabaseUrl: ""`
- `supabaseAnonKey: ""`
- `sharedStateId: "shared-home"`
- `sharedLoginEmail: ""`
- `redirectTo: ""`

`isSupabaseEnabled()` 只有在 `supabaseUrl` 和 `supabaseAnonKey` 都存在时才会返回 true。

所以当前仓库源码直接打开时，云同步默认是关闭的。

### 3. Vercel 部署时会注入环境变量

`scripts/build.mjs` 会把这些环境变量写进 `dist/src/runtime-config.js`：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SHARED_STATE_ID`
- `SHARED_LOGIN_EMAIL`
- `SUPABASE_REDIRECT_URL`

这意味着：

- 仓库里不会保存真实 Supabase 凭据
- 真正是否启用云同步，要看部署环境变量有没有配

### 4. 云同步核心逻辑已经存在

`src/main.js` 里已经实现了以下流程：

- 启动时 `initializeCloudSync()`
- 用 `createClient(url, anonKey, { auth: { persistSession, autoRefreshToken, detectSessionInUrl }})` 初始化
- 调 `auth.getSession()` 读取当前 session
- 登录后执行 `loadSharedState()`
- 从 `public.shared_state` 表读取 `id = runtimeConfig.sharedStateId` 的那一行
- 如果这一行不存在，就把当前本地 state 作为 seed 写上去
- 本地每次 `commit()` 后会 `scheduleCloudSave()`
- 保存是 450ms debounce，然后 `upsert` 整份 state JSON
- 同时订阅 `postgres_changes`，收到同一条记录的更新时再把远端状态应用回本地

### 5. 同步模型是“整份 JSON 覆盖”，不是字段级合并

当前保存逻辑会把整个前端 `state` 作为 `payload` 写入 `shared_state.payload`。

这意味着它更接近：

- local-first
- single document sync
- last write wins

而不是：

- 细粒度表结构
- server-side merge
- conflict-free 协同编辑

所以如果两台设备高频同时改，理论上还是可能发生覆盖，虽然代码里通过 `updated_at` 做了一层简单去重，避免明显的回环同步。

## 数据库层要求

现有文档 `docs/supabase-setup.md` 说明了需要：

- 打开 Email magic link 登录
- 配置 `Site URL` 和 `Redirect URLs`
- 建 `public.shared_state` 表
- 开 RLS
- 给 authenticated 用户开放 select / insert / update
- 把 `shared_state` 加进 Realtime replication

核心表结构是一个很轻的单表设计：

- `id text primary key`
- `payload jsonb not null`
- `updated_by text`
- `updated_at timestamptz`

## 现在真正卡住的点

### 1. 登录页 UI 实际没有接通

虽然代码里有：

- `renderAuthShell()`
- `send-magic-link`
- `requestMagicLink()`
- `magic-email` 输入框

但 `render()` 里原本负责在未登录时切到登录壳页的代码被整段注释掉了。

结果是：

- 已配置 Supabase 时，应用会显示“共享数据库 / 未登录”状态
- 但普通用户在现有页面里没有显式入口去输入邮箱并发送 magic link
- 除非浏览器已经保留了 session，或者用户正好从 magic link 回跳回来，否则这套登录流在 UI 上基本不可用

这是 Claude 接手时最值得先确认的点。

### 2. 目前缺少真实联调证据

仓库里有静态测试断言 Supabase 相关字符串存在，但我没有看到真实项目 key，也没有看到端到端联调结果被记录下来。

换句话说，当前更像是：

- 代码路径已经写好
- 部署说明也已经写好
- 但是否在真实 Supabase 项目上完整跑通过，还需要实测确认

### 3. 仍然是单共享空间设计

`sharedStateId` 默认就是一个固定值 `shared-home`，所以现阶段模型天然是“一个家庭共用一份文档”。

如果后面想支持：

- 多家庭
- 多个共享空间
- 更细权限

就需要重做这层数据模型，而不是只改文案。

## Claude 如果要继续接手，建议先做什么

建议按这个顺序理解和继续：

1. 先读 `src/main.js` 的云同步逻辑，确认当前登录入口为什么不可达。
2. 再读 `src/runtime-config.js` 和 `scripts/build.mjs`，确认环境变量注入方式。
3. 对照 `docs/supabase-setup.md` 检查 Supabase Dashboard 里实际是否已经建表、开 auth、开 realtime。
4. 如果目标是让同步真正可用，优先把登录入口恢复到 UI，而不是先改数据库。
5. 用真实 Supabase 项目和 Vercel 环境变量做一次完整流程验证：
   - 发送 magic link
   - 回跳登录
   - 首次 seed `shared_state`
   - 两台设备互相同步

## 一句话结论

这个项目的 Supabase 不是“还没做”，而是“核心同步代码基本已经写了，部署约束也明确了，但登录入口被注释掉导致实际可用性打了折扣，而且还缺一次真实环境联调来证明整条链路真的通”。 
