# 小橙汁辅食计划

一个零依赖的手机端 PWA，围绕宝宝 `9-12个月` 的中晚两顿辅食计划来设计，支持：

- 今日午餐/晚餐查看、替换、打卡、备注
- 最近吃过什么的历史回看
- 基于未来三天计划和轻量库存生成采购清单
- 内置模板菜谱和食材库
- 添加到手机桌面，离线打开基础页面

## 运行方式

```bash
npm test
npm run serve
```

然后打开 `http://localhost:4173`。

## Supabase 多设备同步

如果要让你和家人多设备同步同一份数据，需要在部署环境里配置：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SHARED_STATE_ID`
- `SHARED_LOGIN_EMAIL`
- `SUPABASE_REDIRECT_URL`

完整步骤见：

- [docs/supabase-setup.md](/Users/new/Documents/vibe%20coding/小橙汁做饭记录/docs/supabase-setup.md)
