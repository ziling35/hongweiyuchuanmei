# Model Jet 视频生成接口字段

## 协议身份

- 插件 ID：`modeljet-video`（v1.4.0）。
- 能力：`video`。
- 默认 Base URL：`https://api.modeljet.com/v1`。
- 鉴权：`bearer`（`Authorization: Bearer <apiKey>`）。
- 创建：`POST /videos`；查询：`GET /videos/{{taskId}}`。
- 关键声明：`requiresPublicMediaUrls: true`、`resultEphemeral: true`。

## 统一字段映射

| 统一字段 | 上游位置 | 说明 |
| --- | --- | --- |
| `model` | `model` | 模型 ID |
| `prompt` | `prompt` 与 `content[type=text]` | 两处同时下发；为空时都不发 |
| `duration` | `seconds` | 大于 0 原样，否则 5 |
| `resolution` | `size` | 缺省 720p |
| `aspectRatio` | `ratio` | 缺省 16:9 |
| `generateAudio` | `generate_audio` | 是否有声 |
| `watermark` | `watermark` | 是否水印 |
| `images` | `content[type=image_url]` | role 原样（first_frame/last_frame），其余按 reference_image |
| `videos` | `content[type=video_url]` | role = reference_video |
| `audios` | `content[type=audio_url]` | role = reference_audio |
| `providerOptions` | `metadata` / 请求体 | `.metadata` 合并进 metadata；`.body`/`.extra_body` 合并进请求体 |

## 上游请求模板

| 上游位置 | 值 |
| --- | --- |
| `create.method` / `create.path` | `POST` / `/videos` |
| `create.body.model` | `request.model` |
| `create.body.prompt` | `$omitEmpty(request.prompt)` |
| `create.body.content` | `$concatArrays[text?, images, videos, audios]`，为空时不下发 |
| `create.body.seconds` | `request.duration > 0 ? request.duration : 5` |
| `create.body.size` | `$coalesce(request.resolution, "720p")` |
| `create.body.ratio` | `$coalesce(request.aspectRatio, "16:9")` |
| `create.body.generate_audio` / `watermark` | `request.generateAudio` / `request.watermark` |
| `poll.method` / `poll.path` | `GET` / `/videos/{{taskId}}` |

## 响应映射

| 映射位置 | 取值 |
| --- | --- |
| `response.taskId` | `task_id` → `id` → `data.task_id` → `taskId`（**绝不取 `data.id`**，那是数字行号，会把下一次轮询打到错误路径并 403） |
| `response.status` | `status` → `data.status`，缺省 `pending` |
| `response.message` | `error.message` → `failure_reason` → `fail_reason` → `message` → `data.fail_reason` → `data.error.message` |
| `response.videos` | `metadata.url` → `data.content.video_url` → `data.data.content.video_url` → `result_url` → `data.result_url` → `video_url` → `data.video_url` → `data.metadata.url` → `data[].video_url/url` → `output.url` → `url` |
| `response.usage` | `usage` → `data.usage` → `data.data.usage` |

## 状态词表（宿主统一归一）

- 排队：`queued`、`pending`、`created`
- 进行中：`in_progress`、`processing`、`running`
- 成功：`completed`、`succeeded`、`success`、`done`
- 失败：`failed`、`error`、`expired`、`cancelled`

## 实测事实（2026-11-16）

- `POST /v1/videos` + 顶层 `content[]` → 上游 `action=image_to_video`，参考图生效；
- 同一请求打到旧端点 `POST /v1/video/generations` → `action=text_to_video`，`content[]` 被忽略；
- `GET /v1/videos/{taskId}` 返回 `status=completed`、`metadata.url`；
- 旧端点 `GET /v1/video/generations/{taskId}` 对同一任务也能查，但结构不同（`result_url` / `data.data.content.video_url`）；
- 用错误 id（数字行号、上游 `cgt-…`、随意字符串）查询统一返回 403，文案为 `This token has no access to model`，容易误判为鉴权问题。

## 兼容边界

- 参考素材必须是公网可访问 URL（`requiresPublicMediaUrls`）；未配置「服务器访问地址」/`CANVAS_PUBLIC_BASE_URL` 会明确报错。
- 成品为预签名或公共 TOS 地址（24 小时量级），宿主会立即下载落库；过期后重新查询可重签。
- 请求时长与返回时长可能不一致（实测请求 5 秒返回 10 秒），计费以返回为准。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "modeljet-video",
  "name": "Model Jet 视频生成",
  "version": "1.4.0",
  "author": "影策",
  "description": "Model Jet（api.modeljet.com）视频生成声明式协议插件：POST /videos 提交（content[] 支持首帧、尾帧、参考图、参考视频、参考音频），GET /videos/{taskId} 轮询；seconds / size / ratio / generate_audio / watermark 平铺在请求体。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "Model Jet API Key",
        "required": true,
        "description": "Model Jet 控制台签发的 sk- 开头 API Key，以 Bearer 方式发送。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "modeljet-video",
        "label": "Model Jet 视频生成",
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
        "baseUrl": "https://api.modeljet.com/v1",
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
            "description": "上游模型 ID，例如 doubao-seedance-2-5-260628。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "prompt + content[type=text]",
            "description": "提示词，同时写进顶层 prompt 与 content 的 text 块；为空时两处都不发。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=image_url]",
            "description": "首帧、尾帧与参考图；role 原样使用，缺省 reference_image。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=video_url]",
            "description": "参考视频，role 缺省 reference_video。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "content[type=audio_url]",
            "description": "参考音频，role 缺省 reference_audio。"
          },
          {
            "name": "duration",
            "type": "integer",
            "required": false,
            "mapping": "seconds",
            "description": "视频时长（秒），未配置时按 5 秒。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "ratio",
            "description": "画幅比例，缺省 16:9。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "size",
            "description": "分辨率档位，例如 720p，缺省 720p。"
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
            "description": "是否加水印。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "metadata / extra_body",
            "description": "providerOptions.modeljet-video.metadata 合并进 metadata；.body 或 .extra_body 合并进请求体。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/videos",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "model": {
                  "$ref": "request.model"
                },
                "seconds": {
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
                "size": {
                  "$coalesce": [
                    {
                      "$ref": "request.resolution"
                    },
                    "720p"
                  ]
                },
                "ratio": {
                  "$coalesce": [
                    {
                      "$ref": "request.aspectRatio"
                    },
                    "16:9"
                  ]
                },
                "generate_audio": {
                  "$ref": "request.generateAudio"
                },
                "watermark": {
                  "$ref": "request.watermark"
                }
              },
              {
                "prompt": {
                  "$omitEmpty": {
                    "$ref": "request.prompt"
                  }
                }
              },
              {
                "content": {
                  "$omitEmpty": {
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
                              "$if": {
                                "condition": {
                                  "$in": [
                                    {
                                      "$ref": "media.role"
                                    },
                                    [
                                      "first_frame",
                                      "last_frame"
                                    ]
                                  ]
                                },
                                "then": {
                                  "$ref": "media.role"
                                },
                                "else": "reference_image"
                              }
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
                }
              },
              {
                "metadata": {
                  "$omitEmpty": {
                    "$coalesce": [
                      {
                        "$ref": "request.providerOptions.modeljet-video.metadata"
                      },
                      {}
                    ]
                  }
                }
              },
              {
                "$coalesce": [
                  {
                    "$ref": "request.providerOptions.modeljet-video.body"
                  },
                  {
                    "$ref": "request.providerOptions.modeljet-video.extra_body"
                  },
                  {}
                ]
              }
            ]
          }
        },
        "poll": {
          "method": "GET",
          "path": "/videos/{{taskId}}"
        },
        "response": {
          "taskId": {
            "$coalesce": [
              {
                "$ref": "response.task_id"
              },
              {
                "$ref": "response.id"
              },
              {
                "$ref": "response.data.task_id"
              },
              {
                "$ref": "response.taskId"
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
                "$ref": "response.failure_reason"
              },
              {
                "$ref": "response.fail_reason"
              },
              {
                "$ref": "response.message"
              },
              {
                "$ref": "response.data.fail_reason"
              },
              {
                "$ref": "response.data.error.message"
              }
            ]
          },
          "videos": {
            "$coalesce": [
              {
                "$ref": "response.metadata.url"
              },
              {
                "$ref": "response.data.content.video_url"
              },
              {
                "$ref": "response.data.data.content.video_url"
              },
              {
                "$ref": "response.result_url"
              },
              {
                "$ref": "response.data.result_url"
              },
              {
                "$ref": "response.video_url"
              },
              {
                "$ref": "response.data.video_url"
              },
              {
                "$ref": "response.data.metadata.url"
              },
              {
                "$map": {
                  "from": {
                    "$ref": "response.data"
                  },
                  "as": "item",
                  "in": {
                    "$coalesce": [
                      {
                        "$ref": "item.video_url"
                      },
                      {
                        "$ref": "item.url"
                      }
                    ]
                  }
                }
              },
              {
                "$ref": "response.output.url"
              },
              {
                "$ref": "response.url"
              }
            ]
          },
          "usage": {
            "$coalesce": [
              {
                "$ref": "response.usage"
              },
              {
                "$ref": "response.data.usage"
              },
              {
                "$ref": "response.data.data.usage"
              }
            ]
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
            "message",
            "failure_reason"
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
