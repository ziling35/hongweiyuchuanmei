# MiniMax H3 本地通道接口字段

## 协议身份

- 插件 ID：`minimax-h3-local`（v1.0.0），单个 provider，能力 `video`。
- 默认 Base URL：`http://127.0.0.1:8188`（H3 适配器）；渠道里可改成内网或反代地址，不要带 `/task` 前缀。
- 鉴权：`bearer`，字段 `apiKey` → `Authorization: Bearer <COMFYUI_ADAPTER_TOKEN>`。
- 创建：`POST /task/openapi/create`；查询：`GET /task/openapi/status`，`taskId` 走 query（`?taskId=<id>`）。
- 关键声明：`requiresPublicMediaUrls: true`、`detachedPolling: true`、`resultEphemeral: true`。

宿主对没有版本前缀的路径会补 `/v1`，因此实际请求是 `/v1/task/openapi/create` 与 `/v1/task/openapi/status`；适配器两个前缀等价，把 Base URL 写成 `http://host:8188/v1` 也成立。

`detachedPolling` 让长任务提交后释放 worker，按 15 秒间隔回查（最长 48 小时），单卡一次只能渲染一支 1080p 的排队场景不会占住任务槽。

## 统一字段映射

| 统一字段 | 上游位置 | 说明 |
| --- | --- | --- |
| `model` | `model` | 档位原样发送，如 `minimax-h3-turbo` |
| `prompt` | `input.prompt` | 必填；宿主在 `validations` 里先拦空提示词 |
| `images` | `input.images` | 按 `order` 排序后只取第一张作首帧 |
| `duration` | `input.duration` | 大于 0 才下发，缺省交给适配器（5 秒） |
| `aspectRatio` | `input.aspect_ratio` | 空值不下发：有首帧按图片宽高比，否则适配器用 16:9 |
| `resolution` | `input.resolution` | 空值不下发，适配器缺省 720p |
| `videos` / `audios` | — | 通道不支持，不下发 |
| `providerOptions` | `input` / 请求体 | `.input` 合并进 `input`（可覆盖默认值）；`.body`、`.extra_body` 合并进请求体顶层 |

请求体示例（图生视频、720p、5 秒）：

```json
{
  "model": "minimax-h3-turbo",
  "input": {
    "prompt": "雨夜霓虹街头，镜头缓慢推进",
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "images": ["http://canvas.example/api/assets/abc/first-frame.png"]
  }
}
```

适配器只识别 `input` 内的同名字段，也兼容把 `prompt` / `duration` / `aspectRatio` / `resolution` 放在 body 顶层；本插件统一走 `input`。

## 模型档位

| model | 采样 | 说明 |
| --- | --- | --- |
| `minimax-h3-turbo` | turbo LoRA 8 步 | 默认档，4090 上的实际出片档 |
| `minimax-h3-quality` | 无 LoRA 20 步 | 精修档，约为 turbo 的 2.5 倍耗时 |

适配器按命名判定档位：含 `quality` / `base` / `-20step` 走 20 步，其余走 turbo 8 步。渠道模型名建议就用上面两个，避免和适配器的命名判定错位。

## 时长与帧网格

帧率固定 24fps，帧数向上对齐模型的 17k+5 网格（5, 22, 39, …）：请求 5 秒 → 124 帧（实际 5.17s），10 秒 → 243 帧（10.125s）。音画同生成是模型原生行为，产物恒含 AAC 音轨。

## 分辨率与画幅几何

分辨率档位映射短边；面积上限沿用 ComfyUI 节点的 1.75 比例（短边²×7/4），逐边对齐 32 像素：

| 档位 | 短边 | 16:9 | 9:16 | 1:1 | 4:3 | 3:4 | 21:9 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 480p | 480 | 832×480 | 480×832 | 480×480 | 640×480 | 480×640 | 960×416 |
| 720p | 768 | 1344×768 | 768×1344 | 768×768 | 1024×768 | 768×1024 | 1536×672 |
| 1080p | 1080 | 1920×1056 | 1056×1920 | 1088×1088 | 1440×1088 | 1088×1440 | 2176×928 |

720p 是模型训练原生档。1080p 在 24GB 单卡上显存接近上限（DynamicVRAM offload 生效，实测无 OOM），采样期间该卡不应再排其他任务。

## 首帧输入

- 适配器只把 `input.images[0]` 交给 `MiniMaxH3ImageToVideo`；本插件已按 `order` 排序并只下发第一张。
- 有首帧时画幅按图片真实宽高比缩放到档位短边（PNG/JPEG 头部探测）；显式 `aspect_ratio` 优先。
- 上限：1 张、30MB、下载超时 90s。素材必须让 4090 那台机器可达，所以插件声明 `requiresPublicMediaUrls`，
  未配置「服务器访问地址」/`CANVAS_PUBLIC_BASE_URL` 时宿主会明确报错。

## 提交与轮询

提交成功（HTTP 200）：

```json
{ "id": "<ComfyUI prompt_id>", "status": "pending" }
```

`response.taskId` 按 `id` → `request_id` → `prompt_id` → `data.id` 取值，`id` 就是 ComfyUI 原生 `prompt_id`，后续轮询复用同一 ID。

轮询成功：

```json
{
  "id": "<prompt_id>",
  "status": "succeeded",
  "data": [
    { "url": "http://<comfyui-host>:8191/view?filename=h3_00001_.mp4&subfolder=yingce&type=output", "name": "h3_00001_.mp4" }
  ]
}
```

- `data[].url` 是 ComfyUI 实例的 `/view` 直链，属**临时地址**；插件声明 `resultEphemeral`，宿主立即下载持久化为平台资源。
- `data` 非空但状态仍是 `pending` 时，宿主按产物为准提升为 `succeeded`。
- 失败时 `message` 取 `error.message` / `message`，内容是 ComfyUI `execution_error` 的可读原因。

## 状态词表（宿主统一归一）

- 排队：`pending`
- 进行中：`processing`
- 成功：`succeeded`
- 失败：`failed`（含适配器重启后任务映射丢失的 "任务不存在"）

## 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `missing_prompt` | 无提示词 |
| 400 | `bad_request` | JSON 解析失败 |
| 401 | `unauthorized` | Bearer Token 不匹配 |
| 429 | `busy` | 全部实例队列达到上限（`COMFYUI_ADAPTER_MAXQUEUE`，默认每实例 4） |
| 502 | `upstream_error` | 参考图下载失败或 ComfyUI 提交失败，message 含原因 |

所有错误响应统一为 `{"error": {"code": "...", "message": "..."}}`，HTTP 状态码与业务 code 同时表达失败，宿主不会把错误包装成成功。

## 直连调试（ComfyUI 层）

排障时可绕过适配器直连实例（单卡默认 :8191）：

| 接口 | 说明 |
| --- | --- |
| `POST /prompt` | 提交 API 工作流：`{"prompt": <graph>, "client_id": "..."}`，返回 `{"prompt_id": "..."}` |
| `GET /history/{prompt_id}` | 任务历史；`status.status_str == "error"` 为失败，产物在 `outputs[].videos/images` |
| `GET /queue` | 返回 `queue_running` / `queue_pending`，适配器据此做最短队列调度 |
| `POST /upload/image` | multipart 上传参考图（`type=input`、`overwrite=true`） |
| `GET /view?filename=&subfolder=&type=output` | 取产物文件 |
| `GET /health`（适配器） | 探活：`{"status": "ok", "instances": [{"base": "...", "queue": N}]}` |

## 适配器环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `COMFYUI_ADAPTER_ADDR` | `0.0.0.0:8188` | 监听地址 |
| `COMFYUI_ADAPTER_INSTANCES` | `http://127.0.0.1:8191,http://127.0.0.1:8192` | ComfyUI 实例列表（逗号分隔）；单卡只填一个 |
| `COMFYUI_ADAPTER_TOKEN` | 适配器内置默认值 | Bearer Token，生产必改，填进渠道 API Key |
| `COMFYUI_ADAPTER_MAXQUEUE` | `4` | 单实例排队上限，超限 429 |

## 耗时参考（turbo，5 秒）

| 分辨率 | 单卡 24GB 实测 |
| --- | --- |
| 480p | ≈ 1 分钟 |
| 720p | ≈ 4.5 分钟 |
| 1080p | ≈ 11.5 分钟 |

quality 档按步数比例放大（约 2.5 倍）。

## 兼容边界

- 不支持 `input.videos` / `input.audios`（传入会被适配器忽略），插件不下发这两项。
- 只支持单张首帧，没有首尾帧、参考图组、参考视频能力。
- 适配器任务映射在内存：适配器重启后查询返回 `failed`（"任务不存在"），按失败重试即可，不会重复扣费上游。
- 产物 URL 指向 ComfyUI 实例的 `/view`，失效后无法重签，只能重跑任务。
- 该通道不参与平台额度计算之外的上游计费，价格档仍需在渠道模型里显式配置，否则用户侧不出现选项。

## 版本记录

- 1.0.0：首个版本。提交/轮询走适配器 `/task/openapi/*`，`taskId` 走 query，首帧取排序后第一张，`resultEphemeral` 立即落库，开启 `detachedPolling`。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "minimax-h3-local",
  "name": "MiniMax H3 本地通道（4090）",
  "version": "1.0.0",
  "author": "影策",
  "description": "自部署 MiniMax H3 视频通道的声明式协议插件（单卡 RTX 4090 + ComfyUI + H3 适配器）：POST /task/openapi/create 提交，GET /task/openapi/status?taskId= 轮询；prompt / duration / aspect_ratio / resolution 走 input，首帧取 order 最小的一张图，产物是 ComfyUI /view 临时直链，按 ephemeral 立即落库。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "H3 适配器 Token",
        "required": true,
        "description": "适配器环境变量 COMFYUI_ADAPTER_TOKEN 的值，以 Authorization: Bearer <token> 发送；生产必须改掉适配器默认值。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "minimax-h3-local",
        "label": "MiniMax H3 本地通道",
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
        "baseUrl": "http://127.0.0.1:8188",
        "requiresPublicMediaUrls": true,
        "detachedPolling": true,
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
            "description": "模型档位：minimax-h3-turbo（turbo LoRA 8 步，默认）或 minimax-h3-quality（无 LoRA 20 步，约 2.5 倍耗时）。含 quality / base / -20step 的档位走 20 步，其余走 turbo 8 步。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input.prompt",
            "description": "视频提示词，必填：适配器对空提示词返回 400 missing_prompt。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input.images[0]",
            "description": "参考图；只有 order 最小的一张作为首帧进入 MiniMaxH3ImageToVideo（图生视频），其余忽略。适配器要求公网/内网可达 URL，单张 ≤ 30MB。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "input.duration",
            "description": "时长秒数（5–15）。未设置或为 0 时不发该字段，适配器按 5 秒处理；24fps 帧数向上对齐到 17k+5 网格。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "input.aspect_ratio",
            "description": "画幅 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9。未设置时不发该字段：有首帧图按图片宽高比，否则适配器用 16:9。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "input.resolution",
            "description": "分辨率档 480p / 720p / 1080p（映射短边）。未设置时不发该字段，适配器用 720p（模型训练原生档）。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "input / 请求体",
            "description": "providerOptions.minimax-h3-local.input 合并进 input（覆盖同名默认值）；.body 合并进请求体顶层。适配器当前忽略 input.videos / input.audios。"
          }
        ],
        "validations": [
          {
            "assert": {
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
            "message": "MiniMax H3 本地通道必须提供提示词：适配器对空 prompt 返回 400 missing_prompt。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/task/openapi/create",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                }
              },
              {
                "input": {
                  "$merge": [
                    {
                      "prompt": {
                        "$ref": "request.prompt"
                      },
                      "duration": {
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
                          }
                        }
                      },
                      "aspect_ratio": {
                        "$omitEmpty": {
                          "$ref": "request.aspectRatio"
                        }
                      },
                      "resolution": {
                        "$omitEmpty": {
                          "$ref": "request.resolution"
                        }
                      },
                      "images": {
                        "$if": {
                          "condition": {
                            "$gt": [
                              {
                                "$len": {
                                  "$ref": "request.images"
                                }
                              },
                              0
                            ]
                          },
                          "then": [
                            {
                              "$first": {
                                "$map": {
                                  "from": {
                                    "$sortByOrder": {
                                      "$ref": "request.images"
                                    }
                                  },
                                  "as": "media",
                                  "in": {
                                    "$ref": "media.value"
                                  }
                                }
                              }
                            }
                          ]
                        }
                      }
                    },
                    {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.minimax-h3-local.input"
                        },
                        {}
                      ]
                    }
                  ]
                }
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-h3-local.body"
                  },
                  {}
                ]
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.minimax-h3-local.extra_body"
                  },
                  {}
                ]
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/task/openapi/status",
          "query": {
            "taskId": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.request_id"
              },
              {
                "$ref": "response.prompt_id"
              },
              {
                "$ref": "response.data.id"
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
                "$ref": "response.message"
              },
              {
                "$ref": "response.error.message"
              },
              {
                "$ref": "response.data.message"
              }
            ]
          },
          "videos": {
            "$omitEmpty": {
              "$map": {
                "from": {
                  "$ref": "response.data"
                },
                "as": "item",
                "in": {
                  "$coalesce": [
                    {
                      "$ref": "item.url"
                    },
                    {
                      "$ref": "item.video_url"
                    }
                  ]
                }
              }
            }
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
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
