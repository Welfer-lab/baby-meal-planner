# Supabase Shared Sync Setup

这版同步按“一个共享邮箱 + 一个共享数据库状态文档”来设计，不做复杂注册、多家庭关系或邀请码。

## 1. 创建 Supabase 项目

创建一个新的 Supabase 项目，然后记下：

- `Project URL` -> 对应 `SUPABASE_URL`
- `anon public key` -> 对应 `SUPABASE_ANON_KEY`

## 2. 打开邮箱魔法链接登录

在 Supabase Dashboard 里：

1. 进入 `Authentication`
2. 打开 `Email`
3. 开启 `Enable Email Signup`
4. 开启 magic link / OTP 登录

建议直接用一个共享邮箱，比如你们家庭共同能收到邮件的邮箱。

## 3. 设置回跳地址

在 `Authentication -> URL Configuration` 里配置：

- `Site URL`：你的 Vercel 正式地址
- `Redirect URLs`：同样加入你的 Vercel 正式地址

例如：

```text
https://baby-meal-planner-theta.vercel.app
```

## 4. 创建 shared_state 表

在 Supabase SQL Editor 里执行：

```sql
create table if not exists public.shared_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.touch_shared_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists touch_shared_state_updated_at on public.shared_state;

create trigger touch_shared_state_updated_at
before update on public.shared_state
for each row
execute function public.touch_shared_state_updated_at();

alter table public.shared_state enable row level security;

drop policy if exists "authenticated can read shared_state" on public.shared_state;
create policy "authenticated can read shared_state"
on public.shared_state
for select
to authenticated
using (true);

drop policy if exists "authenticated can insert shared_state" on public.shared_state;
create policy "authenticated can insert shared_state"
on public.shared_state
for insert
to authenticated
with check (true);

drop policy if exists "authenticated can update shared_state" on public.shared_state;
create policy "authenticated can update shared_state"
on public.shared_state
for update
to authenticated
using (true)
with check (true);
```

## 5. 打开 Realtime

为了让两台设备改动能互相推送：

1. 进入 `Database -> Replication`
2. 确认 `shared_state` 在 Realtime 发布里

## 6. 在 Vercel 配环境变量

在 Vercel 项目里添加这些环境变量：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SHARED_STATE_ID`
- `SHARED_LOGIN_EMAIL`
- `SUPABASE_REDIRECT_URL`

推荐值：

```text
SUPABASE_SHARED_STATE_ID=shared-home
SHARED_LOGIN_EMAIL=你们共享邮箱
SUPABASE_REDIRECT_URL=https://你的正式域名
```

## 7. 重新部署

环境变量保存后，在 Vercel 里重新部署一次，让前端拿到新的运行时配置。

## 8. 使用方式

1. 第一次打开网站时输入共享邮箱
2. 点击发送 magic link
3. 从邮箱点开登录链接
4. 登录后数据会写入 `shared_state`
5. 两台设备都登录同一个邮箱后，就会共用同一个数据库状态
