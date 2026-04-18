# 部署密钥与凭据清单

## Render 环境变量（应用运行期）

- `GPP_ACCESS_TOKEN_SECRET`
- `GPP_REFRESH_TOKEN_SECRET`
- `GPP_ADMIN_TOKEN`
- `DATABASE_URL`（由 Render DB 绑定）

## GitHub Actions Secrets（CI/CD）

- `RENDER_DEPLOY_HOOK_URL`
- `ALERT_WEBHOOK_URL`

## 轮换建议

- `GPP_ACCESS_TOKEN_SECRET` / `GPP_REFRESH_TOKEN_SECRET`：每 90 天轮换。
- `GPP_ADMIN_TOKEN`：每 30~90 天轮换，泄露后立即轮换。
- `RENDER_DEPLOY_HOOK_URL`：仅用于部署流水线，疑似泄露即重置。
- `ALERT_WEBHOOK_URL`：按告警平台要求定期轮换。
