# Seedance 2.5（方舟兼容 / 中转）

火山方舟 Seedance 2.5 视频生成协议，同时适配以方舟线格式暴露的第三方中转（例如 `https://tp-api.chinadatapay.com:8000`）。

## 覆盖的接口

- 提交：`POST /api/v3/contents/generations/tasks`
- 轮询：`GET /api/v3/contents/generations/tasks/{id}`
- 鉴权：`Authorization: Bearer <apiKey>`
- 请求体：`model`、`content[]`、`ratio`、`resolution`、`duration`、`generate_audio`、`watermark`，以及 2.5 新增的 `omni_reference_task_type`、`output_format`、`priority`、`return_last_frame`、`frames`、`service_tier`、`tools`、`callback_url`、`execution_expires_after`
- `content[]`：
  - 文本 `{"type":"text","text":"..."}`
  - 图片 `{"type":"image_url","image_url":{"url":"..."},"role":"first_frame|last_frame|reference_image"}`
  - 视频 `{"type":"video_url","video_url":{"url":"..."},"role":"reference_video"}`
  - 音频 `{"type":"audio_url","audio_url":{"url":"..."},"role":"reference_audio"}`
- 创建响应：`{"id":"cgt-xxx"}`；轮询响应：`{"status":"succeeded","content":{"video_url":"..."},"usage":{...}}`

## 与内置 volcengine-ark-seedance 的差异

| 点 | 内置插件 | 本插件 |
| --- | --- | --- |
| 2.5 专属字段 | 无 | `omni_reference_task_type`、`output_format`、`priority`、`return_last_frame`、`frames`、`service_tier`、`tools`、`callback_url`、`execution_expires_after` |
| `duration` 缺省 | 5 | `-1`（2.5 的“模型自适应”默认值） |
| `ratio` 缺省 | 16:9 | `adaptive`（2.5 在首帧/编辑任务上只接受 adaptive） |
| 扩展体透传 | 无 | `providerOptions.seedance-2-5.body` / `.extra_body` 原样合并 |
| 文本必填 | 校验非空 | 允许只传素材（参考生视频、编辑/延长允许无文本） |

## 编辑/延长任务的 ratio 与 duration（v1.0.1）

上游判定为视频编辑或延长后只接受 `ratio: "adaptive"` 与 `duration: -1`，否则返回 “`ratio` must be `adaptive` / `duration` must be -1”。本插件在下发前自动归一：

- `omni_reference_task_type` 为 `edit` / `extend` → `adaptive` + `-1`。
- `omni_reference_task_type` 未设置或为 `auto` 且请求带输入视频 → `adaptive` + `-1`（上游同样把这类请求判成编辑）。
- 想按参考视频生成并保留自定义比例/时长 → 把 `omni_reference_task_type` 显式设为 `reference`。
- 非编辑任务仍按 `duration`（大于 0）与 `ratio`（缺省 `adaptive`）下发，可用 `providerOptions.seedance-2-5.ratio` / `.duration` 覆盖。

## 在影策里导入

1. 后台 → 插件管理 → 上传 `seedance-2-5.yingce-plugin`。
2. 后台 → 设置 → 存储服务 →「服务器访问地址」填公网根地址（本插件要求公网素材 URL）。
3. 后台 → 渠道管理 → 新建渠道，接口选「Seedance 2.5（方舟兼容 / 中转）」：
   - 官方方舟：Base URL `https://ark.cn-beijing.volces.com`，Key 填 Ark API Key
   - 中转平台：Base URL `https://tp-api.chinadatapay.com:8000`，Key 填平台 Token
4. 渠道下加模型：上游模型名照抄（如 `doubao-seedance-2-5-260928`），能力选视频，配置时长、比例、分辨率档位。
5. 可选参数放模型能力的 `providerOptions.seedance-2-5.*`，例如 `omni_reference_task_type: "reference"`、`output_format: "mov"`。

## 本地打包

```bash
node plugin-packages/embed-documentation.mjs seedance-2-5
cd plugin-packages && powershell -File package-selected.ps1 seedance-2-5
```
