# ModelVerse Doubao Seedance 2.5 接口字段

## 协议身份

- 插件 ID：`modelverse-seedance-25`。
- Provider ID：`modelverse-seedance-video`。
- 能力：`video`。
- 默认 Base URL：`https://api.modelverse.cn`。
- 鉴权：`bearer`，请求头 `Authorization: Bearer <apiKey>`。
- 创建：`POST /v1/tasks/submit`。
- 查询：`GET /v1/tasks/status?task_id=<taskId>`。
- 取消：`GET /v1/tasks/cancel?task_id=<taskId>`。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | ModelVerse API Key，只在渠道配置中输入和保存，不进入清单、URL 或日志。 |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 上游模型名，固定填 `doubao-seedance-2-5-260628`。 |
| `prompt` | string | 是 | `input.content[type=text].text` | 视频提示词，建议不超过 500 个中文字符。 |
| `images` | media[] | 否 | `input.content[type=image_url]` | `first_frame`、`last_frame`、`reference_image` 原样映射；无 role 时按 `reference_image` 发送。 |
| `videos` | media[] | 否 | `input.content[type=video_url]` | 固定映射为 `reference_video`，URL 必须可被上游访问。 |
| `audios` | media[] | 否 | `input.content[type=audio_url]` | 固定映射为 `reference_audio`，URL 必须可被上游访问。 |
| `aspectRatio` | string | 否 | `parameters.ratio` | 16:9、4:3、1:1、3:4、9:16、21:9、adaptive，缺省 `adaptive`。 |
| `resolution` | string | 否 | `parameters.resolution` | 480p、720p、1080p；发送前统一转小写，缺省 `720p`。 |
| `duration` | integer | 否 | `parameters.duration` | 4-30 秒，缺省 5。 |
| `generateAudio` | boolean | 否 | `parameters.generate_audio` | 是否生成同步音频。 |
| `watermark` | boolean | 否 | `parameters.watermark` | 是否带水印。 |
| `seed` | integer | 否 | `parameters.seed` | 随机种子，来自 `providerOptions.modelverse-seedance-video.seed`，为空时省略。 |
| `camera_fixed` | boolean | 否 | `parameters.camera_fixed` | 是否固定机位，来自 `providerOptions.modelverse-seedance-video.camera_fixed`，为空时省略。 |

## 上游请求模板逐字段清单

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/v1/tasks/submit"` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.input.content` | `{"$concatArrays":[[{"type":"text","text":{"$ref":"request.prompt"}}],{"$map":{"from":{"$sortByOrder":{"$ref":"request.images"}},"as":"media","in":{"type":"image_url","image_url":{"url":{"$ref":"media.value"}},"role":{"$coalesce":[{"$ref":"media.role"},"reference_image"]}}}},{"$map":{"from":{"$sortByOrder":{"$ref":"request.videos"}},"as":"media","in":{"type":"video_url","video_url":{"url":{"$ref":"media.value"}},"role":"reference_video"}}},{"$map":{"from":{"$sortByOrder":{"$ref":"request.audios"}},"as":"media","in":{"type":"audio_url","audio_url":{"url":{"$ref":"media.value"}},"role":"reference_audio"}}}]}` |
| `create.body.parameters.duration` | `{"$if":{"condition":{"$gt":[{"$ref":"request.duration"},0]},"then":{"$ref":"request.duration"},"else":5}}` |
| `create.body.parameters.resolution` | `{"$lower":{"$coalesce":[{"$ref":"request.resolution"},"720p"]}}` |
| `create.body.parameters.ratio` | `{"$coalesce":[{"$ref":"request.aspectRatio"},"adaptive"]}` |
| `create.body.parameters.generate_audio` | `{"$ref":"request.generateAudio"}` |
| `create.body.parameters.watermark` | `{"$ref":"request.watermark"}` |
| `create.body.parameters.seed` | `{"$omitEmpty":{"$ref":"request.providerOptions.modelverse-seedance-video.seed"}}` |
| `create.body.parameters.camera_fixed` | `{"$omitEmpty":{"$ref":"request.providerOptions.modelverse-seedance-video.camera_fixed"}}` |
| `poll.method` | `"GET"` |
| `poll.path` | `"/v1/tasks/status"` |
| `poll.query.task_id` | `{"$ref":"taskId"}` |
| `cancel.method` | `"GET"` |
| `cancel.path` | `"/v1/tasks/cancel"` |
| `cancel.query.task_id` | `{"$ref":"taskId"}` |

## Provider 扩展键

- `providerOptions.modelverse-seedance-video.seed`
- `providerOptions.modelverse-seedance-video.camera_fixed`

## 请求校验

- 提示词不能为空。
- `duration` 取值必须在 4-30 秒之间，未填时按 5 秒计。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.taskId` | `{"$coalesce":[{"$ref":"response.output.task_id"},{"$ref":"response.data.task_id"},{"$ref":"taskId"}]}` |
| `response.status` | `{"$coalesce":[{"$ref":"response.output.task_status"},"pending"]}` |
| `response.message` | `{"$coalesce":[{"$ref":"response.output.error_message"},{"$ref":"response.error.message"}]}` |
| `response.videos` | `{"$coalesce":[{"$ref":"response.output.urls"},{"$ref":"response.output.video_url"}]}` |
| `response.usage` | `{"$ref":"response.usage"}` |
| `response.errorPaths[0]` | `"error.code"` |
| `response.errorPaths[1]` | `"error.message"` |
| `response.resultKind` | `video` |
| `response.resultEphemeral` | `true` |

## 响应与错误

- 提交响应 `{"output":{"task_id":"..."},"request_id":"..."}` 解析为任务 ID；任务状态缺省为 `pending`，因此任务按异步轮询处理。
- 查询响应 `output.task_status` 取值 `Pending`、`Running`、`Success`、`Failure`、`Expired`，宿主按统一状态机映射为排队、生成中、成功、失败。
- 成功时 `output.urls` 是视频地址数组，插件标记为临时地址（`resultEphemeral: true`），由宿主立即下载并落为宿主资源，任务记录只保存资源引用。
- 失败时 `output.error_message` 作为失败原因；`error.message`、`error.code` 任一非空即判定失败，HTTP 4xx/5xx 与业务错误都不包装成成功。
- 用量 `usage`（`duration`、`completion_tokens`、`total_tokens`）原样回传给宿主计费与调用日志。

## 兼容边界

- 图片输入按 `order` 稳定排序后发送；两个图像对象时应由业务层给出 `first_frame` 与 `last_frame`，数量更多时按参考图处理。
- 平台要求参考视频、参考音频 URL 可被上游直接访问，因此清单声明 `requiresPublicMediaUrls: true`，宿主会在请求前把本地资源换成短期签名公网地址。
- 平台只允许退出尚未开始运行的任务；运行中的任务取消会返回 500，宿主把取消失败保留为业务错误。
- 样片模式（`parameters.draft`）与样片任务引用（`input.content[type=draft_task]`）未纳入本插件的统一字段，需要时通过自定义渠道直接调用平台接口。
- 平台模型名区分版本：本插件只声明 `doubao-seedance-2-5-260628`，其他版本请另建渠道模型并把上游模型名改为对应 ID，参数结构不变。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "modelverse-seedance-25",
  "name": "ModelVerse Doubao Seedance 2.5",
  "version": "1.0.0",
  "author": "ModelVerse / 影策",
  "description": "ModelVerse 平台 doubao-seedance-2-5-260628 异步视频生成声明式协议插件。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "ModelVerse API Key",
        "required": true,
        "description": "ModelVerse 控制台签发的 API Key，只在渠道配置中保存。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "modelverse-seedance-video",
        "label": "ModelVerse Doubao Seedance 2.5",
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
        "baseUrl": "https://api.modelverse.cn",
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
            "description": "上游模型名，必须填 doubao-seedance-2-5-260628。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "input.content[type=text].text",
            "description": "视频提示词，建议不超过 500 个中文字符。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=image_url]",
            "description": "图片输入，first_frame、last_frame、reference_image 三种 role 原样映射。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=video_url]",
            "description": "参考视频，固定映射为 reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "input.content[type=audio_url]",
            "description": "参考音频，固定映射为 reference_audio。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "parameters.ratio",
            "description": "画面比例，支持 16:9、4:3、1:1、3:4、9:16、21:9、adaptive。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "parameters.resolution",
            "description": "分辨率档位，支持 480p、720p、1080p，发送前统一转小写。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "parameters.duration",
            "description": "视频时长秒数，支持 4-30，缺省 5。"
          },
          {
            "name": "generateAudio",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.generate_audio",
            "description": "是否生成同步音频。"
          },
          {
            "name": "watermark",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.watermark",
            "description": "是否带水印。"
          },
          {
            "name": "seed",
            "type": "integer",
            "required": false,
            "mapping": "parameters.seed",
            "description": "随机种子，来自 providerOptions.modelverse-seedance-video.seed。"
          },
          {
            "name": "camera_fixed",
            "type": "boolean",
            "required": false,
            "mapping": "parameters.camera_fixed",
            "description": "是否固定机位，来自 providerOptions.modelverse-seedance-video.camera_fixed。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.prompt"
                  }
                },
                0
              ]
            },
            "message": "请填写视频提示词"
          },
          {
            "assert": {
              "$and": [
                {
                  "$gte": [
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
                        "else": 5
                      }
                    },
                    4
                  ]
                },
                {
                  "$lte": [
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
                        "else": 5
                      }
                    },
                    30
                  ]
                }
              ]
            },
            "message": "Seedance 2.5 视频时长支持 4-30 秒"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/v1/tasks/submit",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "input": {
              "content": {
                "$concatArrays": [
                  [
                    {
                      "type": "text",
                      "text": {
                        "$ref": "request.prompt"
                      }
                    }
                  ],
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
                        "role": "reference_video"
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
                        "role": "reference_audio"
                      }
                    }
                  }
                ]
              }
            },
            "parameters": {
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
                  },
                  "else": 5
                }
              },
              "resolution": {
                "$lower": {
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    "720p"
                  ]
                }
              },
              "ratio": {
                "$coalesce": [
                  {
                    "$ref": "request.aspectRatio"
                  },
                  "adaptive"
                ]
              },
              "generate_audio": {
                "$ref": "request.generateAudio"
              },
              "watermark": {
                "$ref": "request.watermark"
              },
              "seed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.modelverse-seedance-video.seed"
                }
              },
              "camera_fixed": {
                "$omitEmpty": {
                  "$ref": "request.providerOptions.modelverse-seedance-video.camera_fixed"
                }
              }
            }
          }
        },
        "poll": {
          "method": "GET",
          "path": "/v1/tasks/status",
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "cancel": {
          "method": "GET",
          "path": "/v1/tasks/cancel",
          "query": {
            "task_id": {
              "$ref": "taskId"
            }
          }
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.output.task_id"
              },
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "taskId"
              }
            ]
          },
          "status": {
            "$coalesce": [
              {
                "$ref": "response.output.task_status"
              },
              "pending"
            ]
          },
          "message": {
            "$coalesce": [
              {
                "$ref": "response.output.error_message"
              },
              {
                "$ref": "response.error.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.output.urls"
              },
              {
                "$ref": "response.output.video_url"
              }
            ]
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code",
            "error.message"
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
