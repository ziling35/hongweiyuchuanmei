# LumLum 视频生成接口字段

## 协议身份

- 插件 ID：`lumlum-video`。
- Provider ID：`lumlum-seedance`、`lumlum-wan3`；能力均为 `video`，共用同一份 `apiKey` 配置。
- 默认 Base URL：`https://lumlum.tv/api/open-platform/v1`。
- 鉴权驱动：`bearer`，字段 `apiKey`，请求头 `Authorization: Bearer <API_KEY>`。
- 幂等：两个 provider 都把宿主生成的 `request.extra.idempotencyKey` 映射为 `Idempotency-Key` 请求头，并声明 `idempotentCreate: true`（8–200 字符，24 小时内同键同请求体返回同一任务）。
- Seedance 创建：`POST /ark/contents/generations/tasks`，查询：`GET /ark/contents/generations/tasks/{{taskId}}`。
- Wan 3.0 创建：`POST /videos/generations`，查询：`GET /tasks/{{taskId}}`。
- 关键声明：`requiresPublicMediaUrls: true`、`resultEphemeral: true`、`resultKind: video`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | LumLum 开放平台 API Key，必须具备视频调用权限且 API 钱包有可用余额 |

## 基站 URL 拼接

插件声明的是相对路径 `/ark/...`、`/videos/generations`、`/tasks/{{taskId}}`，由宿主 `ChannelAPIURL` 拼接：

- Base URL 写 `https://lumlum.tv/api/open-platform/v1`（默认）：`/v1` 已是宿主已知版本前缀，路径原样接上，得到 `https://lumlum.tv/api/open-platform/v1/ark/contents/generations/tasks`。
- Base URL 写 `https://lumlum.tv/api/open-platform`（省略 `/v1`）：宿主补默认前缀 `/v1`，结果同上。
- 换网关只改主机名，路径不用动。

## Seedance 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 正式模型标识，区分大小写 |
| `prompt` | string | 否 | `content[type=text]` | 为空时不下发文本块；参考生视频、编辑/延长、样片转正式允许无文本 |
| `images` | media[] | 否 | `content[type=image_url]` | `role` 原样下发，缺省 `reference_image`；首帧 `first_frame`、尾帧 `last_frame` |
| `videos` | media[] | 否 | `content[type=video_url]` | `role` 缺省 `reference_video` |
| `audios` | media[] | 否 | `content[type=audio_url]` | `role` 缺省 `reference_audio` |
| `duration` | integer | 否 | `duration` | 编辑/延长强制 `-1`；其余场景大于 0 或显式 -1 原样下发，未配置（0）时不下发 |
| `aspectRatio` | string | 否 | `ratio` | 编辑/延长强制 `adaptive`；其余场景取 `aspectRatio`，缺省 `adaptive` |
| `resolution` | string | 否 | `resolution` | 未配置时不下发，上游默认 `720p` |
| `generateAudio` | boolean | 否 | `generate_audio` | 可用 `providerOptions.lumlum-seedance.generate_audio` 覆盖 |
| `watermark` | boolean | 否 | `watermark` | 是否添加水印 |
| `providerOptions` | object | 否 | `extra_body` | 见下方扩展键；`.ratio` / `.duration` 覆盖非编辑任务的画面比例与时长 |

### Seedance 扩展键

- `providerOptions.lumlum-seedance.priority`：排队优先级 0–9。
- `providerOptions.lumlum-seedance.return_last_frame`：是否返回尾帧，返回的 `content.last_frame_url` 会作为图片结果一并持久化。
- `providerOptions.lumlum-seedance.omni_reference_task_type`：`auto` / `reference` / `edit` / `extend`，仅 2.5；编辑和延长应显式传值。
- `providerOptions.lumlum-seedance.output_format`：`mp4`（默认）/ `mov`，仅 2.5。
- `providerOptions.lumlum-seedance.draft`：仅支持样片的国内 2.5 模型可设 `true`，生成 480p 样片。
- `providerOptions.lumlum-seedance.draft_task_id`：样片任务 ID。设置后 `content` 只发送 `draft_task` 一项，用于把成功样片转成正式视频。
- `providerOptions.lumlum-seedance.execution_expires_after`：任务超时 3600–259200 秒。
- `providerOptions.lumlum-seedance.generate_audio`：覆盖 `generate_audio`。
- `providerOptions.lumlum-seedance.body`：对象按 `$merge` 规则原样合并进请求体，可覆盖上面任一字段。

### Seedance 参数边界

- `duration`：2.5 固定 4–30 秒、默认自动；2.0 系列固定 4–15 秒、默认 5；编辑/延长由插件强制下发 `-1`。插件不按型号猜测区间，超出范围由上游返回 `INVALID_SEEDANCE_REQUEST`。
- `resolution`：2.5 Flash 支持 480p / 720p；标准版 2.5 的 4k 取决于 API 渠道配置。
- `ratio`：首帧、首尾帧与编辑/延长任务只接受 `adaptive`，插件已自动归一；其他场景按 `aspectRatio` 下发。
- 素材：必须是公网 HTTPS URL；只有一个图片素材时可以省略 role（上游按首帧处理），插件默认仍显式下发 `reference_image`，首帧请显式写 `first_frame`。

### 编辑/延长任务归一（ratio、duration）

上游按 prompt 与素材自行判定任务类型；判定为视频编辑或延长后，`ratio` 必须是 `adaptive`、`duration` 必须是 `-1`，输出比例与时长跟随被编辑的输入视频（该视频需 4–30 秒），否则上游返回 “`ratio` must be `adaptive` / `duration` must be -1”。插件在下发前按下列规则归一：

| 判定条件 | `ratio` | `duration` |
| --- | --- | --- |
| `omni_reference_task_type` = `edit` / `extend` | `adaptive` | `-1` |
| `omni_reference_task_type` 未设置或为 `auto`，且带输入视频 | `adaptive` | `-1` |
| 显式 `omni_reference_task_type` = `reference` | `providerOptions.lumlum-seedance.ratio` → `aspectRatio` → `adaptive` | `providerOptions.lumlum-seedance.duration` → `duration`（>0）→ 不下发 |
| 不带输入视频 | 同上 | 同上 |

要按参考视频生成并保留自定义比例/时长，请把 `omni_reference_task_type` 显式设为 `reference`。

## Wan 3.0 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | `wan3.0-video`（标准版）或 `wan3.0-video-prime`（高速版） |
| `prompt` | string | 否 | `input.prompt` | 与 `input.media` 至少提供一项 |
| `images` | media[] | 否 | `input.media[type=first_frame\|last_frame\|reference_image]` | `role` 原样作为 `type`，缺省 `reference_image`；`subject_reference` / `style_reference` 归一为 `reference_image` |
| `videos` | media[] | 否 | `input.media[type=reference_video]` | `role` 缺省 `reference_video` |
| `audios` | media[] | 否 | `input.media[type=reference_audio]` | `role` 缺省 `reference_audio` |
| `duration` | integer | 否 | `parameters.duration` | 2–30 秒，默认 5；未配置时不下发。-1 表示自动，需经 `providerOptions.lumlum-wan3.duration` 传入 |
| `aspectRatio` | string | 否 | `parameters.ratio` | `adaptive` / `21:9` / `16:9` / `4:3` / `1:1` / `3:4` / `9:16` |
| `resolution` | string | 否 | `parameters.resolution` | `480p` / `720p` / `1080p`，下发时转大写；未配置时上游默认 1080P |
| `generateAudio` | boolean | 否 | `parameters.audio` | 上游默认 true，可用 `providerOptions.lumlum-wan3.audio` 覆盖 |
| `watermark` | boolean | 否 | `parameters.watermark` | 上游默认 false |
| `providerOptions` | object | 否 | `parameters` / `input` | 见下方扩展键 |

### Wan 3.0 扩展键

- `providerOptions.lumlum-wan3.seed`：`-1` 随机或 `0–2147483647`。
- `providerOptions.lumlum-wan3.audio`：覆盖 `parameters.audio`。
- `providerOptions.lumlum-wan3.prompt_extend`：默认 `true`；使用文件或网页素材时必须开启。
- `providerOptions.lumlum-wan3.duration`：覆盖 `parameters.duration`，可传 `-1`。
- `providerOptions.lumlum-wan3.media`：额外 `{type, url}` 素材项，追加在自动映射之后（覆盖文件、公开网页等插件不推断的类型）。
- `providerOptions.lumlum-wan3.body`：对象原样合并进请求体。

### Wan 3.0 参数边界

- `parameters.duration` 2–30 秒，输入与输出视频合计不超过 30 秒。
- `parameters.resolution` 只接受 480P / 720P / 1080P，`parameters.ratio` 只接受上表七个值，其他值在插件侧即报错，不发上游。

## 状态词表

宿主按 `pending` / `processing` / `succeeded` / `failed` / `cancelled` 归一：

| LumLum 状态 | 归一 |
| --- | --- |
| Seedance `queued`、`running`；Wan `PENDING`、`RUNNING` | `pending` / `processing`（继续查询） |
| Seedance `succeeded`；Wan `SUCCEEDED` | `succeeded`（读取视频地址） |
| Seedance `failed`、`expired`；Wan `FAILED` | `failed` |
| Seedance `cancelled`；Wan `CANCELED` | `cancelled` |
| Wan `UNKNOWN` | 插件显式映射为 `failed`，避免无限轮询 |

查询成功返回 HTTP 200，任务是否成功只看 `status`。

## 响应映射

| 映射位置 | Seedance 上游路径 | Wan 3.0 上游路径 |
| --- | --- | --- |
| `response.taskId` | `id`、`task_id`、`data.id` | `output.task_id`、`task_id`、`id` |
| `response.status` | `status`、`data.status`，缺省 `pending` | `output.task_status`（`UNKNOWN` 转 `failed`）、`status` |
| `response.message` | `error.message`、`message` | `output.message`、`message` |
| `response.videos` | `content.video_url`、`video_url`、`output.video_url`、`data.video_url` | `output.video_url`、`output.videos`、`video_url` |
| `response.images` | `content.last_frame_url` | — |
| `response.usage` | `usage` | `usage` |
| `errorPaths` | `error.code` | `output.code` |
| `messagePaths` | `error.message` | `output.message`、`message` |

## 错误与重试

- HTTP 4xx：参数或权限问题，宿主不重试，直接把上游 `error.code` / `error.message` 透出。常见码：`INVALID_SEEDANCE_REQUEST`、`INVALID_IDEMPOTENCY_KEY`、`INVALID_API_KEY`、`INSUFFICIENT_API_BALANCE`、`KEY_QUOTA_EXCEEDED`、`API_DISABLED`、`KEY_SCOPE_DENIED`、`MODEL_NOT_ALLOWED`、`TASK_NOT_FOUND`、`IDEMPOTENCY_CONFLICT`。
- HTTP 429 `CONCURRENCY_LIMITED` 与 5xx／传输错误：宿主以同一 `Idempotency-Key` 和同一请求体重试（最多 3 次，退避 10 秒起）。同键不同请求体会得到 `IDEMPOTENCY_CONFLICT`，不要复用别的任务的键。
- 已有任务 ID 时应优先查询任务状态，不要重新提交。

## 使用示例

直接用 LumLum 网关调用时，两者分别等价于：

```bash
curl -sS -X POST 'https://lumlum.tv/api/open-platform/v1/ark/contents/generations/tasks' \
  -H "Authorization: Bearer $LUM_API_KEY" \
  -H "Idempotency-Key: demo-1" \
  -H 'Content-Type: application/json' \
  -d '{"model":"doubao-seedance-2-0-fast-260128","content":[{"type":"text","text":"海边日落，镜头缓慢推进"}],"duration":5,"resolution":"720p","generate_audio":true,"watermark":false}'

curl -sS 'https://lumlum.tv/api/open-platform/v1/ark/contents/generations/tasks/gen_0123456789abcdef0123456789abcdef' \
  -H "Authorization: Bearer $LUM_API_KEY"
```

```bash
curl -sS -X POST 'https://lumlum.tv/api/open-platform/v1/videos/generations' \
  -H "Authorization: Bearer $LUM_API_KEY" \
  -H "Idempotency-Key: demo-2" \
  -H 'Content-Type: application/json' \
  -d '{"model":"wan3.0-video","input":{"prompt":"镜头跟随参考图中的小猫穿过花园","media":[{"type":"reference_image","url":"https://your-cdn.example.com/cat.jpg"}]},"parameters":{"resolution":"720P","ratio":"16:9","audio":true,"prompt_extend":true,"watermark":false}}'

curl -sS 'https://lumlum.tv/api/open-platform/v1/tasks/gen_4f614afc7c094566a41154eb12c52136' \
  -H "Authorization: Bearer $LUM_API_KEY"
```

## 兼容边界

- 参考素材必须是上游可直接抓取的公网 HTTPS URL；宿主未配置「服务器访问地址」/`CANVAS_PUBLIC_BASE_URL` 时会明确报错，不静默回退 base64。
- 本插件只覆盖视频生成。`GET /models`（模型授权）、`GET /balance`（余额）、`POST /pricing/estimate`（费用预估）和图片接口 `POST /images/generations` 语义不同，需要时另开插件，不在本包内按模型名猜测；`POST /videos/generations` + `GET /tasks/{id}` 同时服务 Wan 3.0 与旧版 Seedance 模型，`lumlum-wan3` 只按百炼的请求/响应结构映射。
- 首帧/首尾帧、全模态参考、视频编辑/延长是互斥场景，`role` 与 `omni_reference_task_type` 要按任务类型选；混用由上游异步报错。
- 素材库（`Action=CreateAsset` 等资源接口）不属于生成协议，本插件不覆盖。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "lumlum-video",
  "name": "LumLum 视频生成（Seedance / Wan 3.0）",
  "version": "1.0.1",
  "author": "影策",
  "description": "LumLum 开放平台视频协议插件，一个包内含两个 provider：Seedance 走方舟兼容的 POST /ark/contents/generations/tasks 创建、GET /ark/contents/generations/tasks/{id} 查询；Wan 3.0 走百炼兼容的 POST /videos/generations 创建、GET /tasks/{id} 查询。两者都把宿主幂等键映射到 Idempotency-Key 请求头，重试不会创建第二个计费任务。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "LumLum API Key",
        "required": true,
        "description": "在 LumLum「API 密钥」创建、具备视频调用权限的密钥，以 Bearer 方式发送。Base URL 默认指向 https://lumlum.tv/api/open-platform/v1，可改为其他网关根地址。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "lumlum-seedance",
        "label": "LumLum Seedance 视频（方舟格式）",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://lumlum.tv/api/open-platform/v1",
        "requiresPublicMediaUrls": true,
        "idempotentCreate": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "LumLum 正式模型标识，区分大小写。国内：doubao-seedance-2-5-260628、doubao-seedance-2-5-flash-261115、doubao-seedance-2-0-260128、doubao-seedance-2-0-fast-260128、doubao-seedance-2-0-mini-260615；海外：dreamina-seedance-2-5-260628、dreamina-seedance-2-0-260128、dreamina-seedance-2-0-fast-260128、dreamina-seedance-2-0-mini-260615。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "content[type=text]",
            "description": "文本提示词，写入 content 的 text 项。参考生视频、样片转正式视频、视频编辑/延长允许只给素材不给文本。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=image_url]",
            "description": "首帧、尾帧与参考图；role 原样下发，缺省 reference_image。首帧写 first_frame、尾帧写 last_frame，首尾帧按该顺序传入。素材必须是公网 HTTPS URL。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=video_url]",
            "description": "参考、待编辑或待延长视频，role 缺省 reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=audio_url]",
            "description": "参考音频，role 缺省 reference_audio；2.0 系列的参考音频必须搭配图片或视频，只有 2.5 支持纯音频输入。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "生成时长（秒）。大于 0 或显式 -1 时原样下发；未配置（0）时不下发，由上游按型号取默认（2.5 为自动，2.0 系列为 5）。2.5 固定 4–30 秒、2.0 系列固定 4–15 秒；编辑/延长任务由插件强制下发 -1。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画面比例，例如 16:9、9:16、1:1；未配置时使用上游默认 adaptive。首帧/首尾帧与编辑/延长任务只接受 adaptive，插件会自动归一成 adaptive。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率档位，例如 480p、720p；未配置时使用上游默认 720p。2.5 Flash 支持 480p 与 720p，标准版 2.5 的 4k 取决于 API 渠道配置。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "是否生成音频；上游默认 true。宿主渠道未配置音频开关时下发 false，需要有声可在视频能力面板开启，或用 providerOptions.lumlum-seedance.generate_audio 覆盖。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "watermark",
            "description": "是否添加 AI 生成水印。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "extra_body",
            "description": "扩展字段：priority、return_last_frame、omni_reference_task_type、output_format、draft、draft_task_id、execution_expires_after、generate_audio、ratio、duration，以及 body 按对象原样合并进请求体。编辑/延长任务由插件强制 ratio=adaptive、duration=-1。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$gt": [
                    {
                      "$len": {
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "request.prompt"
                            },
                            ""
                          ]
                        }
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$ref": "request.inputs"
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "request.providerOptions.lumlum-seedance.draft_task_id"
                            },
                            ""
                          ]
                        }
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Seedance 需要提示词或至少一个输入素材"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.lumlum-seedance.omni_reference_task_type"
                      },
                      ""
                    ]
                  }
                },
                [
                  "",
                  "auto",
                  "reference",
                  "edit",
                  "extend"
                ]
              ]
            },
            "message": "omni_reference_task_type 仅支持 auto、reference、edit、extend"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.lumlum-seedance.output_format"
                      },
                      ""
                    ]
                  }
                },
                [
                  "",
                  "mp4",
                  "mov"
                ]
              ]
            },
            "message": "output_format 仅支持 mp4、mov"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.priority"
                        },
                        -1
                      ]
                    },
                    -1
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.priority"
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.priority"
                        },
                        9
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "priority 需在 0–9 之间"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.execution_expires_after"
                        },
                        0
                      ]
                    },
                    0
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.execution_expires_after"
                        },
                        3600
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.execution_expires_after"
                        },
                        259200
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "execution_expires_after 需在 3600–259200 秒之间"
          }
        ],
        "requestBindings": [
          {
            "name": "omniTaskType",
            "value": {
              "$lower": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.lumlum-seedance.omni_reference_task_type"
                  },
                  ""
                ]
              }
            }
          },
          {
            "name": "hasVideo",
            "value": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.videos"
                  }
                },
                0
              ]
            }
          },
          {
            "name": "editTask",
            "value": {
              "$or": [
                {
                  "$in": [
                    {
                      "$ref": "bindings.omniTaskType"
                    },
                    [
                      "edit",
                      "extend"
                    ]
                  ]
                },
                {
                  "$and": [
                    {
                      "$in": [
                        {
                          "$ref": "bindings.omniTaskType"
                        },
                        [
                          "",
                          "auto"
                        ]
                      ]
                    },
                    {
                      "$ref": "bindings.hasVideo"
                    }
                  ]
                }
              ]
            }
          }
        ],
        "create": {
          "method": "POST",
          "path": "/ark/contents/generations/tasks",
          "contentType": "application/json",
          "headers": {
            "Idempotency-Key": {
              "$ref": "request.extra.idempotencyKey"
            }
          },
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "content": {
                  "$if": {
                    "condition": {
                      "$gt": [
                        {
                          "$len": {
                            "$trim": {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.lumlum-seedance.draft_task_id"
                                },
                                ""
                              ]
                            }
                          }
                        },
                        0
                      ]
                    },
                    "then": [
                      {
                        "type": "draft_task",
                        "draft_task": {
                          "id": {
                            "$ref": "request.providerOptions.lumlum-seedance.draft_task_id"
                          }
                        }
                      }
                    ],
                    "else": {
                      "$concatArrays": [
                        {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$len": {
                                    "$trim": {
                                      "$coalesce": [
                                        {
                                          "$ref": "request.prompt"
                                        },
                                        ""
                                      ]
                                    }
                                  }
                                },
                                0
                              ]
                            },
                            "then": [
                              {
                                "type": "text",
                                "text": {
                                  "$ref": "request.prompt"
                                }
                              }
                            ],
                            "else": []
                          }
                        },
                        {
                          "$map": {
                            "from": {
                              "$sortByOrder": {
                                "$ref": "request.images"
                              }
                            },
                            "as": "media",
                            "in": {
                              "type": "image_url",
                              "image_url": {
                                "url": {
                                  "$ref": "media.value"
                                }
                              },
                              "role": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_image"
                                ]
                              }
                            }
                          }
                        },
                        {
                          "$map": {
                            "from": {
                              "$sortByOrder": {
                                "$ref": "request.videos"
                              }
                            },
                            "as": "media",
                            "in": {
                              "type": "video_url",
                              "video_url": {
                                "url": {
                                  "$ref": "media.value"
                                }
                              },
                              "role": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_video"
                                ]
                              }
                            }
                          }
                        },
                        {
                          "$map": {
                            "from": {
                              "$sortByOrder": {
                                "$ref": "request.audios"
                              }
                            },
                            "as": "media",
                            "in": {
                              "type": "audio_url",
                              "audio_url": {
                                "url": {
                                  "$ref": "media.value"
                                }
                              },
                              "role": {
                                "$coalesce": [
                                  {
                                    "$ref": "media.role"
                                  },
                                  "reference_audio"
                                ]
                              }
                            }
                          }
                        }
                      ]
                    }
                  }
                },
                "duration": {
                  "$if": {
                    "condition": {
                      "$ref": "bindings.editTask"
                    },
                    "then": -1,
                    "else": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.duration"
                        },
                        {
                          "$if": {
                            "condition": {
                              "$gt": [
                                {
                                  "$ref": "request.duration"
                                },
                                0
                              ]
                            },
                            "then": {
                              "$ref": "request.duration"
                            },
                            "else": null
                          }
                        }
                      ]
                    }
                  }
                },
                "ratio": {
                  "$if": {
                    "condition": {
                      "$ref": "bindings.editTask"
                    },
                    "then": "adaptive",
                    "else": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-seedance.ratio"
                        },
                        {
                          "$ref": "request.aspectRatio"
                        },
                        "adaptive"
                      ]
                    }
                  }
                },
                "resolution": {
                  "$omitEmpty": {
                    "$ref": "request.resolution"
                  }
                },
                "generate_audio": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.lumlum-seedance.generate_audio"
                    },
                    {
                      "$ref": "request.generateAudio"
                    }
                  ]
                },
                "watermark": {
                  "$ref": "request.watermark"
                },
                "priority": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.priority"
                  }
                },
                "return_last_frame": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.return_last_frame"
                  }
                },
                "omni_reference_task_type": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.omni_reference_task_type"
                  }
                },
                "output_format": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.output_format"
                  }
                },
                "draft": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.draft"
                  }
                },
                "execution_expires_after": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.lumlum-seedance.execution_expires_after"
                  }
                }
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.lumlum-seedance.body"
                  },
                  {}
                ]
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/ark/contents/generations/tasks/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.data.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.status"
              },
              {
                "$ref": "response.data.status"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.content.video_url"
              },
              {
                "$ref": "response.video_url"
              },
              {
                "$ref": "response.output.video_url"
              },
              {
                "$ref": "response.data.video_url"
              }
            ]
          },
          "images": {
            "$coalesce": [
              {
                "$ref": "response.content.last_frame_url"
              },
              {
                "$ref": "response.last_frame_url"
              }
            ]
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ],
          "resultKind": "video",
          "resultEphemeral": true
        }
      },
      {
        "id": "lumlum-wan3",
        "label": "LumLum Wan 3.0 视频（百炼格式）",
        "capabilities": [
          "video"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://lumlum.tv/api/open-platform/v1",
        "requiresPublicMediaUrls": true,
        "idempotentCreate": true,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "Wan 3.0 模型标识：wan3.0-video（标准版）或 wan3.0-video-prime（高速版）。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "input.prompt",
            "description": "视频提示词，与 input.media 至少提供一项。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input.media[type=first_frame|last_frame|reference_image]",
            "description": "图片素材：role 原样作为 type 下发，缺省 reference_image；首帧写 first_frame、尾帧写 last_frame。素材必须是公网 HTTPS URL。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "input.media[type=reference_video]",
            "description": "参考视频，role 缺省 reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "input.media[type=reference_audio]",
            "description": "参考音频，role 缺省 reference_audio。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "parameters.duration",
            "description": "生成时长（秒），2–30，默认 5；未配置时不下发。输入与输出视频合计不超过 30 秒。-1 表示自动选时长，通过 providerOptions.lumlum-wan3.duration 传入。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "parameters.ratio",
            "description": "画面比例，例如 adaptive、21:9、16:9、4:3、1:1、3:4、9:16；未配置时使用上游默认 adaptive。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "parameters.resolution",
            "description": "分辨率档位 480p、720p、1080p（下发为大写 480P/720P/1080P）；未配置时使用上游默认 1080P。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.audio",
            "description": "是否生成音频；上游默认 true。宿主渠道未配置音频开关时下发 false，需要有声可在视频能力面板开启，或用 providerOptions.lumlum-wan3.audio 覆盖。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.watermark",
            "description": "是否添加水印，上游默认 false。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "parameters/input extra fields",
            "description": "扩展字段：seed、audio、prompt_extend、duration、media，以及 body 按对象原样合并进请求体。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$gt": [
                    {
                      "$len": {
                        "$trim": {
                          "$coalesce": [
                            {
                              "$ref": "request.prompt"
                            },
                            ""
                          ]
                        }
                      }
                    },
                    0
                  ]
                },
                {
                  "$gt": [
                    {
                      "$len": {
                        "$ref": "request.inputs"
                      }
                    },
                    0
                  ]
                }
              ]
            },
            "message": "Wan 3.0 需要提示词或至少一个输入素材"
          },
          {
            "assert": {
              "$in": [
                {
                  "$lower": {
                    "$coalesce": [
                      {
                        "$ref": "request.resolution"
                      },
                      ""
                    ]
                  }
                },
                [
                  "",
                  "480p",
                  "720p",
                  "1080p"
                ]
              ]
            },
            "message": "Wan 3.0 只支持 480P、720P、1080P"
          },
          {
            "assert": {
              "$in": [
                {
                  "$coalesce": [
                    {
                      "$ref": "request.aspectRatio"
                    },
                    ""
                  ]
                },
                [
                  "",
                  "adaptive",
                  "21:9",
                  "16:9",
                  "4:3",
                  "1:1",
                  "3:4",
                  "9:16"
                ]
              ]
            },
            "message": "Wan 3.0 不支持该画面比例"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.duration"
                        },
                        0
                      ]
                    },
                    0
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.duration"
                    },
                    -1
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.duration"
                        },
                        2
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.duration"
                        },
                        30
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "Wan 3.0 时长需在 2–30 秒之间（-1 表示自动）"
          },
          {
            "assert": {
              "$or": [
                {
                  "$eq": [
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-wan3.seed"
                        },
                        -2
                      ]
                    },
                    -2
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.lumlum-wan3.seed"
                    },
                    -1
                  ]
                },
                {
                  "$and": [
                    {
                      "$gte": [
                        {
                          "$ref": "request.providerOptions.lumlum-wan3.seed"
                        },
                        0
                      ]
                    },
                    {
                      "$lte": [
                        {
                          "$ref": "request.providerOptions.lumlum-wan3.seed"
                        },
                        2147483647
                      ]
                    }
                  ]
                }
              ]
            },
            "message": "seed 需为 -1（随机）或 0–2147483647"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/videos/generations",
          "contentType": "application/json",
          "headers": {
            "Idempotency-Key": {
              "$ref": "request.extra.idempotencyKey"
            }
          },
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "input": {
                  "prompt": {
                    "$omitEmpty": {
                      "$ref": "request.prompt"
                    }
                  },
                  "media": {
                    "$omitEmpty": {
                      "$concatArrays": [
                        {
                          "$map": {
                            "from": {
                              "$sortByOrder": {
                                "$ref": "request.inputs"
                              }
                            },
                            "as": "media",
                            "in": {
                              "type": {
                                "$coalesce": [
                                  {
                                    "$if": {
                                      "condition": {
                                        "$in": [
                                          {
                                            "$ref": "media.role"
                                          },
                                          [
                                            "subject_reference",
                                            "style_reference"
                                          ]
                                        ]
                                      },
                                      "then": "reference_image",
                                      "else": {
                                        "$ref": "media.role"
                                      }
                                    }
                                  },
                                  {
                                    "$if": {
                                      "condition": {
                                        "$eq": [
                                          {
                                            "$ref": "media.kind"
                                          },
                                          "image"
                                        ]
                                      },
                                      "then": "reference_image",
                                      "else": {
                                        "$if": {
                                          "condition": {
                                            "$eq": [
                                              {
                                                "$ref": "media.kind"
                                              },
                                              "video"
                                            ]
                                          },
                                          "then": "reference_video",
                                          "else": {
                                            "$if": {
                                              "condition": {
                                                "$eq": [
                                                  {
                                                    "$ref": "media.kind"
                                                  },
                                                  "audio"
                                                ]
                                              },
                                              "then": "reference_audio",
                                              "else": {
                                                "$ref": "media.kind"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                ]
                              },
                              "url": {
                                "$ref": "media.value"
                              }
                            }
                          }
                        },
                        {
                          "$map": {
                            "from": {
                              "$coalesce": [
                                {
                                  "$ref": "request.providerOptions.lumlum-wan3.media"
                                },
                                []
                              ]
                            },
                            "as": "extra",
                            "in": {
                              "type": {
                                "$ref": "extra.type"
                              },
                              "url": {
                                "$ref": "extra.url"
                              }
                            }
                          }
                        }
                      ]
                    }
                  }
                },
                "parameters": {
                  "resolution": {
                    "$omitEmpty": {
                      "$upper": {
                        "$ref": "request.resolution"
                      }
                    }
                  },
                  "ratio": {
                    "$omitEmpty": {
                      "$ref": "request.aspectRatio"
                    }
                  },
                  "duration": {
                    "$omitEmpty": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.lumlum-wan3.duration"
                        },
                        {
                          "$ref": "request.duration"
                        }
                      ]
                    }
                  },
                  "seed": {
                    "$omitEmpty": {
                      "$ref": "request.providerOptions.lumlum-wan3.seed"
                    }
                  },
                  "audio": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.lumlum-wan3.audio"
                      },
                      {
                        "$ref": "request.generateAudio"
                      }
                    ]
                  },
                  "prompt_extend": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.lumlum-wan3.prompt_extend"
                      },
                      true
                    ]
                  },
                  "watermark": {
                    "$ref": "request.watermark"
                  }
                }
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.lumlum-wan3.body"
                  },
                  {}
                ]
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/tasks/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.output.task_id"
              },
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$if": {
              "condition": {
                "$eq": [
                  {
                    "$lower": {
                      "$coalesce": [
                        {
                          "$ref": "response.output.task_status"
                        },
                        ""
                      ]
                    }
                  },
                  "unknown"
                ]
              },
              "then": "failed",
              "else": {
                "$coalesce": [
                  {
                    "$ref": "response.output.task_status"
                  },
                  {
                    "$ref": "response.status"
                  },
                  "pending"
                ]
              }
            }
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.output.message"
              },
              {
                "$ref": "response.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.output.video_url"
              },
              {
                "$ref": "response.output.videos"
              },
              {
                "$ref": "response.video_url"
              }
            ]
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "output.code"
          ],
          "messagePaths": [
            "output.message",
            "message"
          ],
          "resultKind": "video",
          "resultEphemeral": true
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
