# OpenAI 兼容对话（公网素材）

把「OpenAI Chat Completions 兼容」的上游接成**要求公网素材地址**的文本渠道，用来自动解决大视频被上游网关 413 拒绝的问题。

## 它解决什么

内置 `Chat Completions` 协议对参考视频只会走两条路：

- 资源在对象存储里 → 发短期签名 URL；
- 资源在服务器本地盘 → 把整个视频 base64 内联进 `video_url.url`。

第二种情况下，4 分钟视频会让请求体变成几十 MB 的 JSON，很容易被上游（中转站/网关）前面的 nginx 以 `413 Request Entity Too Large` 拒绝。

本插件在清单里声明 `requiresPublicMediaUrls: true`，宿主因此走「必须公网地址」分支：即使资源在本地盘，也会签发 `https://你的域名/api/public/resources/<id>/file?expires=…&signature=…` 发给上游，请求体只有几百字节。

## 使用前提

1. 后台 → 设置 → 存储服务 → **服务器访问地址** 填公网根地址（或设置 `CANVAS_PUBLIC_BASE_URL`），例如 `https://canvas.example.com`（不要带 `/api`）。
2. 上游必须能访问这个域名（有些自建网关会做回源限制）。
3. 后台 → 运行策略 → 单文件上传上限 ≥ 视频体积（程序硬顶 999MB）。
4. 渠道模型能力：最大视频数 ≥ 1，单个视频上限 MB = 视频实际大小。

## 在影策里导入

1. 后台 → 插件管理 → 上传 `openai-chat-public-media.yingce-plugin`。
2. 后台 → 渠道管理 → 新建渠道，接口选「OpenAI 兼容对话（公网素材）」。
3. Base URL 填上游根地址并**带版本段**，例如 `https://your-upstream.example.com/v1`（插件请求 `/chat/completions`，宿主拼成 `<Base URL>/chat/completions`）。
4. 填 API Key，添加模型：上游模型名照抄供应商 ID（如 `qwen4-max-preview`），能力选文本，并在能力设置里开启视频参考。

## 验证

1. 上传 4 分钟视频到画布，在 Agent 里引用它。
2. 后台 → API 调用日志 → 该次请求体的 `video_url.url` 应是 `https://…/api/public/resources/…`，不再是 `data:video/…;base64,`。

## 本地打包

```bash
cd plugin-packages && powershell -File package-selected.ps1 openai-chat-public-media
```
