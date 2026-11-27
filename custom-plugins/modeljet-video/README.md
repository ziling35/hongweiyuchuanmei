# Model Jet 视频生成

Model Jet（`https://api.modeljet.com`）视频接口的声明式协议插件。**必须使用 `/v1/videos` 端点**：旧的 `/v1/video/generations` 会静默忽略 `content[]`（实测任务变成 `text_to_video`），导致参考图/首帧不生效。

## 覆盖的接口

- 提交：`POST /v1/videos`
- 查询：`GET /v1/videos/{taskId}`
- 鉴权：`Authorization: Bearer <sk- 开头的 API Key>`

请求体：

```json
{
  "model": "doubao-seedance-2-5-260628",
  "prompt": "a fruit tea promo",
  "content": [
    { "type": "text", "text": "a fruit tea promo" },
    { "type": "image_url", "image_url": { "url": "https://.../tea.jpg" }, "role": "reference_image" }
  ],
  "seconds": 5,
  "size": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "watermark": false
}
```

`content[].role`：`first_frame` / `last_frame`（首尾帧）、`reference_image`（参考图）、`reference_video`、`reference_audio`。

创建返回：`{"id":"task_…","object":"video","status":"queued","progress":0,…}`（注意：**没有 `task_id` 字段**，只有 `id`）。

查询返回：

```json
{
  "id": "task_…",
  "object": "video",
  "status": "completed",
  "progress": 100,
  "metadata": { "url": "https://tokenhub-data.tos-cn-hongkong.volces.com/.../video.mp4" }
}
```

状态值：`queued` → `in_progress`/`processing` → `completed`（宿主按 succeeded 归一）/ `failed`。

## 与旧版（≤1.3.0）的差异

| 项 | 旧版 | 1.4.0 |
| --- | --- | --- |
| 提交/查询路径 | `/video/generations` | **`/videos`** |
| 参数位置 | `metadata.{resolution,ratio,generate_audio,watermark}` | 平铺 `seconds/size/ratio/generate_audio/watermark` |
| 参考素材 | 旧端点会忽略 `content[]` | 新端点真正生效（`action=image_to_video`） |
| 成品字段 | `result_url` / `data.data.content.video_url` | `metadata.url`（仍兼容旧字段） |
| `taskId` | 曾误取 `data.id`（数字行号）导致第 2 次轮询 403 | 仅取 `task_id` / `id` |

## 在影策里导入

1. 后台 → 插件管理 → 上传 `modeljet-video.yingce-plugin`（覆盖旧版即可，渠道配置不用改）。
2. 后台 → 设置 → 存储服务 →「服务器访问地址」填公网根地址（本插件要求公网素材 URL）。
3. 渠道管理 → 该渠道：Base URL `https://api.modeljet.com/v1`，API Key 为 `sk-` 开头。
4. 模型名照抄（如 `doubao-seedance-2-5-260628`），能力选视频；分辨率档位填 720p / 1080p 等上游支持的档位。

## 本地打包

```bash
node plugin-packages/embed-documentation.mjs modeljet-video
cd plugin-packages && powershell -File package-selected.ps1 modeljet-video
```
