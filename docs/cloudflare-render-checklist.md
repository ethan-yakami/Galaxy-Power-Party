# Cloudflare + Render 上线配置清单

## 1. DNS

- 在 Cloudflare 中为业务域名添加记录并指向 Render 服务域名。
- 代理状态使用橙云（Proxied）。
- 若使用根域，建议 CNAME Flattening 开启。

## 2. TLS / HTTPS

- SSL/TLS 模式：`Full (strict)`。
- `Always Use HTTPS`：开启。
- `Automatic HTTPS Rewrites`：开启。
- 最低 TLS 版本：`1.2`。

## 3. 缓存与 WebSocket

- 对 `/*.html`、`/api/*` 设为绕过缓存（Bypass Cache）。
- 静态资源可缓存（例如 `*.css`, `*.js`, `*.png`）。
- WebSocket 支持保持默认开启；上线后实际验证 `wss://` 连接。

## 4. 基础防护

- 开启 Bot Fight（或同类基础机器人防护）。
- 开启托管 WAF 规则集。
- 为 `/api/auth/*` 添加 Cloudflare 速率限制规则（例如每 IP 每分钟 30 次）。

## 5. 验收

- 访问 `https://<your-domain>/api/readyz` 返回 `ok=true`。
- 通过浏览器 DevTools 确认 battle 页面建立 `wss://` 连接成功。
- 两端创建/加入房间并完成一局对战。

## 6. 升级到生产规格时的 Cloudflare 增强

- 增加国家/ASN 维度的访问策略。
- 对 `/api/auth/*`、`/api/replays*` 设置更细的速率分层。
- 为管理接口仅允许办公室出口 IP（如有固定出口）。
