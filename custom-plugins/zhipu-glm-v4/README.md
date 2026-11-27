# 智谱 GLM 官方 v4

智谱开放平台（`open.bigmodel.cn`）v4 对话补全接口的声明式协议插件。与仓库里早先的 `zhipu-glm-chat` 不同，本插件按官方文档使用 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，并声明多模态与思考模式字段。

- 端点：`POST https://open.bigmodel.cn/api/paas/v4/chat/completions`
- 鉴权：`Authorization: Bearer <apiKey>`
- 能力：`text`（可带图片、视频、音频输入）
- 适用模型：`glm-4.6v`、`glm-4.5v`、`glm-5.3`、`glm-5.3-flash` 等智谱 v4 文本/视觉模型

完整接口见 [docs/interface.md](docs/interface.md)。

## 在影策里导入

1. 后台 → 插件页 → 上传 `zhipu-glm-v4.yingce-plugin`
2. 渠道管理 → 新建渠道：接口选「智谱 GLM 官方 v4」，Base URL 填主机 `https://open.bigmodel.cn`（路径由插件给出，填了别的前缀也会被覆盖），填入智谱 API Key
3. 渠道下加模型：**上游模型名填官方 ID**（如 `glm-4.6v`，不要带聚合平台的 `zai-org/` 前缀），能力选文本
4. 文本能力参数里开启「最大视频引用」并填好单个视频上限 MB、最长秒数；要做视频反推提示词时建议 `1 / 50MB / 60 秒`
5. 确认 `CANVAS_PUBLIC_BASE_URL` 是外部可访问的站点地址——本插件声明 `requiresPublicMediaUrls`，图片和视频都会以签名公网 URL 发送

## 本地构建

```bash
node plugin-packages/embed-documentation.mjs zhipu-glm-v4
powershell -File plugin-packages/package-selected.ps1 zhipu-glm-v4
```
