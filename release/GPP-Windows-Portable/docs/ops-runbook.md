# 公网运维 Runbook（Render + Postgres）

## 1. 部署拓扑

- 应用：Render `Web Service`（Node）
- 数据库：Render `Postgres`
- 域名与 HTTPS：Cloudflare DNS 指向 Render，自带 TLS
- 健康检查：`GET /api/readyz`

## 2. 必备环境变量

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `GPP_APP_VERSION=<release-version>`
- `GPP_STORE_PROVIDER=prisma`
- `DATABASE_URL=<render-postgres-connection-string>`
- `GPP_ACCESS_TOKEN_SECRET=<>=32位随机串>`
- `GPP_REFRESH_TOKEN_SECRET=<>=32位随机串>`
- `GPP_ADMIN_TOKEN=<随机管理令牌>`

## 3. 发布流程

1. 主分支合并后触发 GitHub Actions：`npm ci -> npm test`
2. 测试通过后触发 Render Deploy Hook
3. Render 启动执行：
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
   - `npm start`
4. 验收：
   - 首页可访问
   - 两端联机创建/加入房间
   - 断线重连可恢复
   - 登录后可拉取 `/api/replays`

## 4. 监控与阈值建议

指标入口：`GET /api/metrics`（需 `x-admin-token` 或 Bearer 管理令牌）

- `gpp_http_requests_total`：观察 5xx 比例
- `gpp_socket_connections_total`：观察连接爬升趋势
- `gpp_active_rooms`：观察房间总量
- `gpp_active_room_sockets`：观察在线房间连接数
- `gpp_auth_failures_total`：观察异常登录/刷新失败
- `gpp_rate_limited_total`：观察是否遭遇滥用

告警建议（10 分钟窗口）：

- 5xx 比率 > 3%
- `gpp_auth_failures_total` 突增 > 200
- `gpp_rate_limited_total` 突增 > 500
- `gpp_active_room_sockets` 下降到接近 0 且请求仍有流量

## 5. 备份与恢复

- 使用 Render Postgres 自动每日备份，保留 7-14 天
- 每月至少演练 1 次恢复到临时实例
- 恢复后验证：
  - `GET /api/readyz` 正常
  - 登录可用
  - `/api/replays` 能返回历史记录

## 6. 回滚策略

- 回滚版本：将 Render 服务回滚至上一个稳定构建
- 如涉及 schema 变更，优先“应用回滚 + 数据兼容验证”
- 回滚后必做：
  - `/api/version` 检查版本
  - 双端联机对局
  - 账号登录/刷新/回放读取
