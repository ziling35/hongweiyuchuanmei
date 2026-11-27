# Seedance 2.5（方舟兼容 / 中转）接口字段

## 协议身份

- 插件 ID：`seedance-2-5`。
- Provider ID：`seedance-2-5`。
- 能力：`video`。
- 默认 Base URL：`https://ark.cn-beijing.volces.com`（官方）；中转平台在渠道里改为平台根地址，例如 `https://tp-api.chinadatapay.com:8000`。
- 鉴权：`bearer`，请求头 `Authorization: Bearer <apiKey>`。
- 创建：`POST /api/v3/contents/generations/tasks`。
- 查询：`GET /api/v3/contents/generations/tasks/{{taskId}}`。
- 关键声明：`requiresPublicMediaUrls: true`、`resultEphemeral: true`。

## 基站 URL 拼接

插件声明的是绝对路径 `/api/v3/...`。宿主按 `ChannelAPIURL` 规则拼接：Base URL 只写主机（含端口）时，路径原样接上；Base URL 里若带 `/api/v3` 则不会重复。仓库测试 `TestChannelAPIURLNormalizesConfiguredVersionPrefix` 的 `path carries ark v3` 用例覆盖了这个形态。

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 模型 ID 或 Endpoint ID。 |
| `prompt` | string | 否 | `content[type=text]` | 为空时不下发文本块（参考生视频/编辑/延长允许无文本）。 |
| `images` | media[] | 否 | `content[type=image_url]` | `role` 原样使用，缺省 `reference_image`。 |
| `videos` | media[] | 否 | `content[type=video_url]` | `role` 缺省 `reference_video`。 |
| `audios` | media[] | 否 | `content[type=audio_url]` | `role` 缺省 `reference_audio`。 |
| `duration` | integer | 否 | `duration` | 编辑/延长任务固定 `-1`；其他任务大于 0 原样下发，否则 `-1`（模型自适应）。 |
| `aspectRatio` | string | 否 | `ratio` | 编辑/延长任务固定 `adaptive`；其他任务取 `aspectRatio`，缺省 `adaptive`。 |
| `resolution` | string | 否 | `resolution` | 缺省 `720p`。 |
| `generateAudio` | boolean | 否 | `generate_audio` | 是否有声。 |
| `watermark` | boolean | 否 | `watermark` | 是否水印。 |
| `seed` | integer | 否 | `seed` | 来自 `providerOptions.seedance-2-5.seed`。 |
| `camera_fixed` | boolean | 否 | `camera_fixed` | 来自 `providerOptions.seedance-2-5.camera_fixed`。 |
| `omni_reference_task_type` | string | 否 | `omni_reference_task_type` | `auto`/`reference`/`edit`/`extend`。 |
| `output_format` | string | 否 | `output_format` | `mp4`/`mov`。 |
| `return_last_frame` | boolean | 否 | `return_last_frame` | 是否返回尾帧。 |
| `priority` | integer | 否 | `priority` | 0-9 排队优先级。 |
| `frames` | integer | 否 | `frames` | 29-289，`25+4n`。 |
| `service_tier` | string | 否 | `service_tier` | `default`/`flex`。 |
| `tools` | array | 否 | `tools` | 例如 `[{"type":"web_search"}]`。 |
| `callback_url` | string | 否 | `callback_url` | 状态回调地址。 |
| `execution_expires_after` | integer | 否 | `execution_expires_after` | 3600-259200 秒。 |
| `providerOptions` | object | 否 | `extra_body` | `providerOptions.seedance-2-5.body` 或 `.extra_body` 原样合并；`.ratio` / `.duration` 覆盖非编辑任务的画面比例与时长。 |


## 编辑/延长任务归一（ratio、duration）

上游按 prompt 与素材自行判定任务类型；判定为视频编辑或延长后，`ratio` 必须是 `adaptive`、`duration` 必须是 `-1`，输出比例与时长跟随被编辑的输入视频（该视频需 4–30 秒），否则会返回 “`ratio` must be `adaptive` / `duration` must be -1”。

插件在下发前按下列规则归一，避免这类必然后失败的请求：

| 判定条件 | `ratio` | `duration` |
| --- | --- | --- |
| `omni_reference_task_type` = `edit` / `extend` | `adaptive` | `-1` |
| `omni_reference_task_type` 未设置或为 `auto`，且带输入视频 | `adaptive` | `-1` |
| 显式 `omni_reference_task_type` = `reference` | `providerOptions.seedance-2-5.ratio` → `aspectRatio` → `adaptive` | `providerOptions.seedance-2-5.duration` → `duration`（>0）→ `-1` |
| 不带输入视频 | 同上 | 同上 |

要按参考视频生成并保留自定义比例/时长，请把 `omni_reference_task_type` 显式设为 `reference`。

## 响应映射逐字段清单

| 映射位置 | 值或转换表达式 |
| --- | --- |
| `response.taskId` | `id`、`task_id`、`data.id`、`taskId` |
| `response.status` | `status`、`data.status`，缺省 `pending` |
| `response.message` | `error.message`、`message`、`fail_reason` |
| `response.videos` | `content.video_url`、`video_url`、`output.video_url`、`data.video_url` |
| `response.usage` | `usage`（含 `completion_tokens`、`tool_usage`） |
| `response.errorPaths` | `error.code`、`ResponseMetadata.Error.Code` |
| `response.messagePaths` | `error.message`、`ResponseMetadata.Error.Message` |
| `response.resultKind` | `video` |
| `response.resultEphemeral` | `true` |

## 状态词表

宿主统一按 `pending` / `running` / `succeeded` / `failed` 归一：

- 排队/运行：`queued`、`running`、`processing`、`in_progress`
- 成功：`succeeded`、`success`、`completed`
- 失败：`failed`、`error`；`expired` 也按失败处理

## 兼容边界

- 参考素材必须是上游可直接抓取的公网 URL（插件声明 `requiresPublicMediaUrls`）；未配置「服务器访问地址」/`CANVAS_PUBLIC_BASE_URL` 时会明确报错，不会静默回退 base64。
- 首帧/首尾帧、全模态参考、视频编辑/延长是互斥场景，`role` 与 `omni_reference_task_type` 要按任务类型选，混用会由上游异步报错；编辑/延长的 `ratio` 与 `duration` 由插件强制归一，不需要手工改画幅与时长。
- 成品地址按临时地址处理，由宿主立即下载并持久化。
- 素材库（`Action=CreateAsset` 等 `POST /v1/api/assets`）不属于生成协议，本插件不覆盖。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "seedance-2-5",
  "name": "Seedance 2.5（方舟兼容 / 中转）",
  "version": "1.0.1",
  "author": "影策",
  "description": "火山方舟 Seedance 2.5 视频生成协议插件：POST /api/v3/contents/generations/tasks 提交，GET /api/v3/contents/generations/tasks/{id} 轮询。相比内置 volcengine-ark-seedance，补齐 omni_reference_task_type、output_format、priority、return_last_frame、frames、service_tier、tools、callback_url、execution_expires_after 等 2.5 字段，并支持扩展体透传。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Token / Ark API Key",
        "required": true,
        "description": "官方方舟填 API Key；中转平台填平台 Token。都以 Bearer 方式发送。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "seedance-2-5",
        "label": "Seedance 2.5（方舟兼容 / 中转）",
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
        "baseUrl": "https://ark.cn-beijing.volces.com",
        "requiresPublicMediaUrls": true,
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
            "description": "模型 ID 或 Endpoint ID，例如 doubao-seedance-2-5-260928。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "content[type=text]",
            "description": "文本提示词。参考生视频、视频编辑/延长允许只给素材不给文本，因此不做必填校验。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=image_url]",
            "description": "首帧、尾帧与参考图；role 原样使用，为空时按 reference_image 发送。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=video_url]",
            "description": "参考/待编辑/待延长视频，role 默认 reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=audio_url]",
            "description": "参考音频，role 默认 reference_audio。Seedance 2.5 支持仅音频输入。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "duration",
            "description": "视频时长（秒）。大于 0 时原样下发，未配置时下发 -1 由模型自适应。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画幅比例；缺省 adaptive（2.5 在首帧/首尾帧与编辑任务上只接受 adaptive）。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution",
            "description": "分辨率档位，2.5 可选 480p、720p，缺省 720p。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "generate_audio",
            "description": "是否生成有声视频。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "watermark",
            "description": "是否输出 AI 生成水印。"
          },
          {
            "name": "seed",
            "type": "integer",
            "required": false,
            "mapping": "seed",
            "description": "随机种子，来自 providerOptions.seedance-2-5.seed；-1 表示随机。"
          },
          {
            "name": "camera_fixed",
            "type": "boolean",
            "required": false,
            "mapping": "camera_fixed",
            "description": "是否固定机位，来自 providerOptions.seedance-2-5.camera_fixed。"
          },
          {
            "name": "omni_reference_task_type",
            "type": "string",
            "required": false,
            "mapping": "omni_reference_task_type",
            "description": "auto / reference / edit / extend，来自 providerOptions.seedance-2-5.omni_reference_task_type。"
          },
          {
            "name": "output_format",
            "type": "string",
            "required": false,
            "mapping": "output_format",
            "description": "mp4 / mov，来自 providerOptions.seedance-2-5.output_format。"
          },
          {
            "name": "return_last_frame",
            "type": "boolean",
            "required": false,
            "mapping": "return_last_frame",
            "description": "是否返回尾帧图，来自 providerOptions.seedance-2-5.return_last_frame。"
          },
          {
            "name": "priority",
            "type": "integer",
            "required": false,
            "mapping": "priority",
            "description": "排队优先级 0-9，来自 providerOptions.seedance-2-5.priority。"
          },
          {
            "name": "frames",
            "type": "integer",
            "required": false,
            "mapping": "frames",
            "description": "按帧数生成（29-289，25+4n），来自 providerOptions.seedance-2-5.frames。"
          },
          {
            "name": "service_tier",
            "type": "string",
            "required": false,
            "mapping": "service_tier",
            "description": "default / flex，来自 providerOptions.seedance-2-5.service_tier。"
          },
          {
            "name": "tools",
            "type": "array",
            "required": false,
            "mapping": "tools",
            "description": "工具配置（如 web_search），来自 providerOptions.seedance-2-5.tools。"
          },
          {
            "name": "callback_url",
            "type": "string",
            "required": false,
            "mapping": "callback_url",
            "description": "任务状态回调地址，来自 providerOptions.seedance-2-5.callback_url。"
          },
          {
            "name": "execution_expires_after",
            "type": "integer",
            "required": false,
            "mapping": "execution_expires_after",
            "description": "任务超时阈值（秒，3600-259200），来自 providerOptions.seedance-2-5.execution_expires_after。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "extra_body",
            "description": "扩展字段：omni_reference_task_type、output_format、priority、return_last_frame、frames、service_tier、tools、callback_url、execution_expires_after、seed、camera_fixed、ratio、duration，以及 providerOptions.seedance-2-5.body 或 .extra_body 原样合并进请求体。编辑/延长任务由插件强制 ratio=adaptive、duration=-1。"
          }
        ],
        "requestBindings": [
          {
            "name": "omniTaskType",
            "value": {
              "$lower": {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.seedance-2-5.omni_reference_task_type"
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
          "path": "/api/v3/contents/generations/tasks",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "content": {
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
                          "$ref": "request.providerOptions.seedance-2-5.ratio"
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
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    "720p"
                  ]
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
                          "$ref": "request.providerOptions.seedance-2-5.duration"
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
                            "else": -1
                          }
                        }
                      ]
                    }
                  }
                },
                "generate_audio": {
                  "$ref": "request.generateAudio"
                },
                "watermark": {
                  "$ref": "request.watermark"
                },
                "seed": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.seed"
                  }
                },
                "camera_fixed": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.camera_fixed"
                  }
                },
                "omni_reference_task_type": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.omni_reference_task_type"
                  }
                },
                "output_format": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.output_format"
                  }
                },
                "return_last_frame": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.return_last_frame"
                  }
                },
                "priority": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.priority"
                  }
                },
                "frames": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.frames"
                  }
                },
                "service_tier": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.service_tier"
                  }
                },
                "tools": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.tools"
                  }
                },
                "callback_url": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.callback_url"
                  }
                },
                "execution_expires_after": {
                  "$omitEmpty": {
                    "$ref": "request.providerOptions.seedance-2-5.execution_expires_after"
                  }
                }
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.seedance-2-5.body"
                  },
                  {
                    "$ref": "request.providerOptions.seedance-2-5.extra_body"
                  },
                  {}
                ]
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/api/v3/contents/generations/tasks/{{taskId}}"
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
              },
              {
                "$ref": "response.fail_reason"
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
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code",
            "ResponseMetadata.Error.Code"
          ],
          "messagePaths": [
            "error.message",
            "ResponseMetadata.Error.Message"
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
