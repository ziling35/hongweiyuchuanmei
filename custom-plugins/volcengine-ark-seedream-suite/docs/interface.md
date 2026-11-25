# 火山方舟 Seedream 图片生成（内置尺寸）接口字段

## 协议身份

- 插件 ID：`volcengine-ark-seedream-suite`。
- 能力：`image`；三个 provider 共用同一份 `apiKey` 配置。
- 默认 Base URL：`https://ark.cn-beijing.volces.com`。
- 鉴权驱动：`bearer`，字段 `apiKey`。
- 创建：`POST /api/v3/images/generations`（同步返回，无任务轮询）。

| Provider ID | 服务模型 | 尺寸档 | 图层拆分 | 组图 | 联网搜索 | 透明背景 |
| --- | --- | --- | --- | --- | --- | --- |
| `volcengine-ark-seedream-suite-55` | `doubao-seedream-5-5-261028` | 1K / 1.5K / 2K | ✅ 2–100 张 | — | — | `auto` / `opaque` / `transparent` |
| `volcengine-ark-seedream-suite-5-0-pro` | `doubao-seedream-5-0-pro-260628` | 1K / 1.5K / 2K | ✅ 固定 17 张 | — | — | `opaque` / `transparent` |
| `volcengine-ark-seedream-suite-5-0` | `doubao-seedream-5-0-260128` | 2K / 4K | — | ✅ 1–15 张 | ✅ | — |

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | 方舟推理 API Key |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 模型 ID 或接入点 ID |
| `prompt` | string | 是 | `prompt` | 图片提示词 |
| `images` | media[] | 否 | `image` | 1 张为字符串，多张为数组 |
| `aspectRatio` | string | 否 | `size` | 宽高比，插件换算成精确像素 |
| `resolution` | string | 否 | `size` | K 档位，大小写不敏感 |
| `imageCount` | integer | 否 | 不下发 | 分档计价按实际张数结算 |

## 图片参数

### 三个 provider 共有

| 名称 | 类型 | 绑定 | 取值 |
| --- | --- | --- | --- |
| `size`（画幅 / 尺寸） | string | `aspectRatio`（`encoding: ratio`） | `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`4:5`、`5:4`、`21:9`，默认 `16:9` |
| `imageResolution`（分辨率） | string | `resolution` | 5.5 / 5.0 pro：`1k`、`1.5k`、`2k`；5.0：`2k`、`4k`。默认 `2k` |
| `outputFormat`（输出格式） | string | `output_format` | `png`、`jpeg`，默认 `png` |
| `watermark`（水印） | boolean | `watermark` | 默认 `false` |

### 仅 5.5 / 5.0 pro

| 名称 | 类型 | 绑定 | 取值 |
| --- | --- | --- | --- |
| `layerDecomposition`（图层拆分） | boolean | `layer_decomposition` | 默认 `false` |
| `maxImages`（最多输出张数，含底图） | integer | `max_images` | 5.5：2–100（默认 30）；5.0 pro：2–17（默认 17） |
| `layerSize`（拆层输出尺寸） | string | `layer_size` | `1k`、`1.5k`、`2k`、`auto`，默认 `auto` |
| `textRecognition`（拆层时识别文字） | boolean | `text_recognition` | 默认 `false` |

### 仅 5.0 pro

| 名称 | 类型 | 绑定 | 取值 |
| --- | --- | --- | --- |
| `promptOptimization`（提示词优化） | string | `optimize_prompt_mode` | `standard`、`fast`，默认 `standard`；`fast` 才会下发 `optimize_prompt_options.mode` |

### 仅 5.0

| 名称 | 类型 | 绑定 | 取值 |
| --- | --- | --- | --- |
| `sequential`（组图） | string | `sequential_image_generation` | `disabled`、`auto`，默认 `disabled` |
| `maxImages`（组图张数上限） | integer | `max_images` | 1–15，默认 4；仅 `auto` 时下发 |
| `webSearch`（联网搜索） | boolean | `web_search` | 默认 `false`；为真时下发 `tools: [{type: "web_search"}]` |

## 内置尺寸表

所有像素都落在对应模型的方舟取值区间内（5.5 / 5.0 pro：921,600–4,624,220；5.0：3,686,400–16,777,216）。

| 比例 | 1K | 1.5K | 2K | 4K |
| --- | --- | --- | --- | --- |
| 1:1 | 1024x1024 | 1536x1536 | 2048x2048 | 2880x2880 |
| 16:9 | 1824x1024 | 2048x1152 | 2752x1536 | 3840x2160 |
| 9:16 | 1024x1824 | 1152x2048 | 1536x2752 | 2160x3840 |
| 4:3 | 1360x1024 | 1776x1328 | 2304x1728 | 3264x2448 |
| 3:4 | 1024x1360 | 1328x1776 | 1728x2304 | 2448x3264 |
| 3:2 | 1536x1024 | 1872x1248 | 2496x1664 | 3504x2336 |
| 2:3 | 1024x1536 | 1248x1872 | 1664x2496 | 2336x3504 |
| 4:5 | 1024x1280 | 1376x1712 | 1792x2240 | 2560x3200 |
| 5:4 | 1280x1024 | 1712x1376 | 2240x1792 | 3200x2560 |
| 21:9 | 2048x878 | 2336x1008 | 3136x1344 | 3808x1632 |

- 5.5 与 5.0 pro 使用 1K / 1.5K / 2K 三列；5.0 使用 2K / 4K 两列。
- 5.0 的 3K 档没有内置：宿主前端的档位换算只支持 1k/1.5k/2k/4k，无法自动生成 3K 像素，因此不提供该档，需要 3K 时在模型配置里手工填精确尺寸。
- 不在表内的自定义比例（如 `9:21`）按原样透传为 `size`，由方舟裁决。

## 校验

| Provider | 断言 | 提示 |
| --- | --- | --- |
| 5.5 / 5.0 pro | 图层拆分时参考图必须恰好 1 张 | 图层拆分需要且仅需要一张参考图 |
| 5.5 / 5.0 pro | 透明背景时参考图必须恰好 1 张（图层拆分除外） | 透明背景需要且仅需要一张参考图 |
| 5.5 / 5.0 pro | 透明背景不能配 `jpeg` | 透明背景不能与 jpeg 输出格式同时使用 |

## 上游请求字段

| 上游字段 | 取值 |
| --- | --- |
| `model` | `request.model` |
| `prompt` | `request.prompt` |
| `size` | 图层拆分时为 `layer_size`（默认 `auto`）；否则按档位 × 比例查内置表，未命中透传 `aspectRatio` |
| `image` | 1 张为字符串，多张为字符串数组，无参考图时省略 |
| `watermark` | `providerOptions.watermark` → `request.watermark` → `false` |
| `response_format` | 默认 `url` |
| `layer_decomposition` / `layer_decomposition_options` | 仅图层拆分时下发 |
| `background` | 非图层拆分时下发（5.0 pro 无 `auto`） |
| `sequential_image_generation` / `sequential_image_generation_options` | 仅 5.0，`auto` 时下发张数 |
| `tools` | 仅 5.0，联网搜索开启时下发 |
| `optimize_prompt_options` | 仅 5.0 pro，`fast` 时下发 |
| `output_format` | 仅在设置时下发 |

## 响应映射

| 映射位置 | 上游路径 |
| --- | --- |
| `status` | 固定 `succeeded` |
| `images` | `response.data` |
| `usage` | `response.usage` |
| `errorPaths` | `error.code` |
| `messagePaths` | `error.message` |

## 兼容边界

- 每个 provider 只声明一个模型；同一渠道只选与服务模型对应的 provider。
- 与官方 `volcengine-ark-seedream` 插件并存，二者 Provider ID 不冲突，可只在新渠道使用本插件。
- `providerOptions` 命名空间按 provider ID 隔离（`providerOptions.<providerId>.*`），跨 provider 不会串值。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "volcengine-ark-seedream-suite",
  "name": "火山方舟 Seedream 图片生成（内置尺寸）",
  "version": "3.0.0",
  "author": "Volcengine / 影策",
  "description": "火山方舟 Seedream 图片生成与参考图编辑，按模型提供内置精确像素尺寸：5.5、5.0 pro、5.0。",
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "API Key",
        "required": true
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "volcengine-ark-seedream-suite-55",
        "label": "火山方舟 Seedream 5.5",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://ark.cn-beijing.volces.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅 / 尺寸",
            "type": "string",
            "description": "宽高比。精确像素由分辨率档位与该比例换算，随请求下发 WxH。",
            "values": [
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "4:5",
              "5:4",
              "21:9"
            ],
            "default": "16:9",
            "pricing": true,
            "binding": "aspectRatio",
            "encoding": "ratio",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "description": "K 档位，与画幅组合成精确像素尺寸。",
            "values": [
              "1k",
              "1.5k",
              "2k"
            ],
            "default": "2k",
            "pricing": true,
            "binding": "resolution",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "layerDecomposition",
            "label": "图层拆分",
            "type": "boolean",
            "default": false,
            "pricing": true,
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "maxImages",
            "label": "最多输出张数（含底图）",
            "type": "integer",
            "min": 2,
            "max": 100,
            "step": 1,
            "default": 30,
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.max_images",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "layerSize",
            "label": "拆层输出尺寸",
            "type": "string",
            "values": [
              "1k",
              "1.5k",
              "2k",
              "auto"
            ],
            "default": "auto",
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.layer_size",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "textRecognition",
            "label": "拆层时识别文字",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.text_recognition",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "background",
            "label": "图片背景",
            "type": "string",
            "values": [
              "auto",
              "opaque",
              "transparent"
            ],
            "default": "auto",
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.background",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "values": [
              "png",
              "jpeg"
            ],
            "default": "png",
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.output_format",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          },
          {
            "name": "watermark",
            "label": "水印",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-55.watermark",
            "models": [
              "doubao-seedream-5-5-261028"
            ]
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "图片模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "provider image/reference fields",
            "description": "参考图或编辑源图，role 由业务层确定。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "n/sample_count",
            "description": "输出数量；分档计价按张结算。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size/aspect_ratio",
            "description": "宽高比或精确尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution/imageSize",
            "description": "分辨率档位。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "quality",
            "description": "质量档位。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
                    },
                    true
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                }
              ]
            },
            "message": "图层拆分需要且仅需要一张参考图"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.background"
                    },
                    "transparent"
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
                    },
                    true
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                }
              ]
            },
            "message": "透明背景需要且仅需要一张参考图"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.background"
                    },
                    "transparent"
                  ]
                },
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.output_format"
                    },
                    "jpeg"
                  ]
                }
              ]
            },
            "message": "透明背景不能与 jpeg 输出格式同时使用"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v3/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "size": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
                    },
                    true
                  ]
                },
                "then": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_size"
                    },
                    "auto"
                  ]
                },
                "else": {
                  "$omitEmpty": {
                    "$switch": {
                      "cases": [
                        {
                          "when": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      "2k"
                                    ]
                                  }
                                }
                              },
                              "1k"
                            ]
                          },
                          "then": {
                            "$switch": {
                              "cases": [
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "1:1"
                                    ]
                                  },
                                  "then": "1024x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "16:9"
                                    ]
                                  },
                                  "then": "1824x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "9:16"
                                    ]
                                  },
                                  "then": "1024x1824"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:3"
                                    ]
                                  },
                                  "then": "1360x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:4"
                                    ]
                                  },
                                  "then": "1024x1360"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:2"
                                    ]
                                  },
                                  "then": "1536x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "2:3"
                                    ]
                                  },
                                  "then": "1024x1536"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:5"
                                    ]
                                  },
                                  "then": "1024x1280"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "5:4"
                                    ]
                                  },
                                  "then": "1280x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "21:9"
                                    ]
                                  },
                                  "then": "2048x878"
                                }
                              ],
                              "default": {
                                "$ref": "request.aspectRatio"
                              }
                            }
                          }
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      "2k"
                                    ]
                                  }
                                }
                              },
                              "1.5k"
                            ]
                          },
                          "then": {
                            "$switch": {
                              "cases": [
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "1:1"
                                    ]
                                  },
                                  "then": "1536x1536"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "16:9"
                                    ]
                                  },
                                  "then": "2048x1152"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "9:16"
                                    ]
                                  },
                                  "then": "1152x2048"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:3"
                                    ]
                                  },
                                  "then": "1776x1328"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:4"
                                    ]
                                  },
                                  "then": "1328x1776"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:2"
                                    ]
                                  },
                                  "then": "1872x1248"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "2:3"
                                    ]
                                  },
                                  "then": "1248x1872"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:5"
                                    ]
                                  },
                                  "then": "1376x1712"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "5:4"
                                    ]
                                  },
                                  "then": "1712x1376"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "21:9"
                                    ]
                                  },
                                  "then": "2336x1008"
                                }
                              ],
                              "default": {
                                "$ref": "request.aspectRatio"
                              }
                            }
                          }
                        }
                      ],
                      "default": {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "1:1"
                                ]
                              },
                              "then": "2048x2048"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "16:9"
                                ]
                              },
                              "then": "2752x1536"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "9:16"
                                ]
                              },
                              "then": "1536x2752"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:3"
                                ]
                              },
                              "then": "2304x1728"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:4"
                                ]
                              },
                              "then": "1728x2304"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:2"
                                ]
                              },
                              "then": "2496x1664"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "2:3"
                                ]
                              },
                              "then": "1664x2496"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:5"
                                ]
                              },
                              "then": "1792x2240"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "5:4"
                                ]
                              },
                              "then": "2240x1792"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "21:9"
                                ]
                              },
                              "then": "3136x1344"
                            }
                          ],
                          "default": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "image": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      1
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  "else": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      },
                      "then": {
                        "$map": {
                          "from": {
                            "$ref": "request.images"
                          },
                          "as": "media",
                          "in": {
                            "$ref": "media.value"
                          }
                        }
                      },
                      "else": null
                    }
                  }
                }
              }
            },
            "watermark": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.watermark"
                },
                {
                  "$ref": "request.watermark"
                },
                false
              ]
            },
            "response_format": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.response_format"
                },
                "url"
              ]
            },
            "layer_decomposition": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
              }
            },
            "layer_decomposition_options": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
                      },
                      true
                    ]
                  },
                  "then": {
                    "max_images": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.max_images"
                        },
                        100
                      ]
                    },
                    "text_recognition": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.text_recognition"
                        },
                        false
                      ]
                    }
                  },
                  "else": null
                }
              }
            },
            "background": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.layer_decomposition"
                      },
                      true
                    ]
                  },
                  "then": null,
                  "else": {
                    "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.background"
                  }
                }
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-55.output_format"
              }
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$ref": "response.data"
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        }
      },
      {
        "id": "volcengine-ark-seedream-suite-5-0-pro",
        "label": "火山方舟 Seedream 5.0 pro",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://ark.cn-beijing.volces.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅 / 尺寸",
            "type": "string",
            "description": "宽高比。精确像素由分辨率档位与该比例换算，随请求下发 WxH。",
            "values": [
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "4:5",
              "5:4",
              "21:9"
            ],
            "default": "16:9",
            "pricing": true,
            "binding": "aspectRatio",
            "encoding": "ratio",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "description": "K 档位，与画幅组合成精确像素尺寸。",
            "values": [
              "1k",
              "1.5k",
              "2k"
            ],
            "default": "2k",
            "pricing": true,
            "binding": "resolution",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "layerDecomposition",
            "label": "图层拆分",
            "type": "boolean",
            "default": false,
            "pricing": true,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "maxImages",
            "label": "最多输出张数（含底图）",
            "type": "integer",
            "min": 2,
            "max": 17,
            "step": 1,
            "default": 17,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.max_images",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "layerSize",
            "label": "拆层输出尺寸",
            "type": "string",
            "values": [
              "1k",
              "1.5k",
              "2k",
              "auto"
            ],
            "default": "auto",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_size",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "textRecognition",
            "label": "拆层时识别文字",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.text_recognition",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "background",
            "label": "图片背景",
            "type": "string",
            "values": [
              "opaque",
              "transparent"
            ],
            "default": "opaque",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.background",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "values": [
              "png",
              "jpeg"
            ],
            "default": "png",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.output_format",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "promptOptimization",
            "label": "提示词优化",
            "type": "string",
            "values": [
              "standard",
              "fast"
            ],
            "default": "standard",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.optimize_prompt_mode",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          },
          {
            "name": "watermark",
            "label": "水印",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0-pro.watermark",
            "models": [
              "doubao-seedream-5-0-pro-260628"
            ]
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "图片模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "provider image/reference fields",
            "description": "参考图或编辑源图，role 由业务层确定。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "n/sample_count",
            "description": "输出数量；分档计价按张结算。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size/aspect_ratio",
            "description": "宽高比或精确尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution/imageSize",
            "description": "分辨率档位。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "quality",
            "description": "质量档位。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
                    },
                    true
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                }
              ]
            },
            "message": "图层拆分需要且仅需要一张参考图"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.background"
                    },
                    "transparent"
                  ]
                },
                {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
                    },
                    true
                  ]
                },
                {
                  "$eq": [
                    {
                      "$len": {
                        "$ref": "request.images"
                      }
                    },
                    1
                  ]
                }
              ]
            },
            "message": "透明背景需要且仅需要一张参考图"
          },
          {
            "assert": {
              "$or": [
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.background"
                    },
                    "transparent"
                  ]
                },
                {
                  "$ne": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.output_format"
                    },
                    "jpeg"
                  ]
                }
              ]
            },
            "message": "透明背景不能与 jpeg 输出格式同时使用"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/api/v3/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "size": {
              "$if": {
                "condition": {
                  "$eq": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
                    },
                    true
                  ]
                },
                "then": {
                  "$coalesce": [
                    {
                      "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_size"
                    },
                    "auto"
                  ]
                },
                "else": {
                  "$omitEmpty": {
                    "$switch": {
                      "cases": [
                        {
                          "when": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      "2k"
                                    ]
                                  }
                                }
                              },
                              "1k"
                            ]
                          },
                          "then": {
                            "$switch": {
                              "cases": [
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "1:1"
                                    ]
                                  },
                                  "then": "1024x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "16:9"
                                    ]
                                  },
                                  "then": "1824x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "9:16"
                                    ]
                                  },
                                  "then": "1024x1824"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:3"
                                    ]
                                  },
                                  "then": "1360x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:4"
                                    ]
                                  },
                                  "then": "1024x1360"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:2"
                                    ]
                                  },
                                  "then": "1536x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "2:3"
                                    ]
                                  },
                                  "then": "1024x1536"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:5"
                                    ]
                                  },
                                  "then": "1024x1280"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "5:4"
                                    ]
                                  },
                                  "then": "1280x1024"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "21:9"
                                    ]
                                  },
                                  "then": "2048x878"
                                }
                              ],
                              "default": {
                                "$ref": "request.aspectRatio"
                              }
                            }
                          }
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$lower": {
                                  "$trim": {
                                    "$coalesce": [
                                      {
                                        "$ref": "request.resolution"
                                      },
                                      "2k"
                                    ]
                                  }
                                }
                              },
                              "1.5k"
                            ]
                          },
                          "then": {
                            "$switch": {
                              "cases": [
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "1:1"
                                    ]
                                  },
                                  "then": "1536x1536"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "16:9"
                                    ]
                                  },
                                  "then": "2048x1152"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "9:16"
                                    ]
                                  },
                                  "then": "1152x2048"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:3"
                                    ]
                                  },
                                  "then": "1776x1328"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:4"
                                    ]
                                  },
                                  "then": "1328x1776"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "3:2"
                                    ]
                                  },
                                  "then": "1872x1248"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "2:3"
                                    ]
                                  },
                                  "then": "1248x1872"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "4:5"
                                    ]
                                  },
                                  "then": "1376x1712"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "5:4"
                                    ]
                                  },
                                  "then": "1712x1376"
                                },
                                {
                                  "when": {
                                    "$eq": [
                                      {
                                        "$ref": "request.aspectRatio"
                                      },
                                      "21:9"
                                    ]
                                  },
                                  "then": "2336x1008"
                                }
                              ],
                              "default": {
                                "$ref": "request.aspectRatio"
                              }
                            }
                          }
                        }
                      ],
                      "default": {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "1:1"
                                ]
                              },
                              "then": "2048x2048"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "16:9"
                                ]
                              },
                              "then": "2752x1536"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "9:16"
                                ]
                              },
                              "then": "1536x2752"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:3"
                                ]
                              },
                              "then": "2304x1728"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:4"
                                ]
                              },
                              "then": "1728x2304"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:2"
                                ]
                              },
                              "then": "2496x1664"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "2:3"
                                ]
                              },
                              "then": "1664x2496"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:5"
                                ]
                              },
                              "then": "1792x2240"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "5:4"
                                ]
                              },
                              "then": "2240x1792"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "21:9"
                                ]
                              },
                              "then": "3136x1344"
                            }
                          ],
                          "default": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "image": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      1
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  "else": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      },
                      "then": {
                        "$map": {
                          "from": {
                            "$ref": "request.images"
                          },
                          "as": "media",
                          "in": {
                            "$ref": "media.value"
                          }
                        }
                      },
                      "else": null
                    }
                  }
                }
              }
            },
            "watermark": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.watermark"
                },
                {
                  "$ref": "request.watermark"
                },
                false
              ]
            },
            "response_format": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.response_format"
                },
                "url"
              ]
            },
            "layer_decomposition": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
              }
            },
            "layer_decomposition_options": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
                      },
                      true
                    ]
                  },
                  "then": {
                    "max_images": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.max_images"
                        },
                        17
                      ]
                    },
                    "text_recognition": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.text_recognition"
                        },
                        false
                      ]
                    }
                  },
                  "else": null
                }
              }
            },
            "background": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.layer_decomposition"
                      },
                      true
                    ]
                  },
                  "then": null,
                  "else": {
                    "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.background"
                  }
                }
              }
            },
            "optimize_prompt_options": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.optimize_prompt_mode"
                      },
                      "fast"
                    ]
                  },
                  "then": {
                    "mode": "fast"
                  },
                  "else": null
                }
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0-pro.output_format"
              }
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$ref": "response.data"
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        }
      },
      {
        "id": "volcengine-ark-seedream-suite-5-0",
        "label": "火山方舟 Seedream 5.0",
        "capabilities": [
          "image"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://ark.cn-beijing.volces.com",
        "requiresPublicMediaUrls": false,
        "auth": {
          "type": "bearer",
          "field": "apiKey"
        },
        "imageParameters": [
          {
            "name": "size",
            "label": "画幅 / 尺寸",
            "type": "string",
            "description": "宽高比。精确像素由分辨率档位与该比例换算，随请求下发 WxH。",
            "values": [
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "4:5",
              "5:4",
              "21:9"
            ],
            "default": "16:9",
            "pricing": true,
            "binding": "aspectRatio",
            "encoding": "ratio",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "imageResolution",
            "label": "分辨率",
            "type": "string",
            "description": "K 档位，与画幅组合成精确像素尺寸。",
            "values": [
              "2k",
              "4k"
            ],
            "default": "2k",
            "pricing": true,
            "binding": "resolution",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "outputFormat",
            "label": "输出格式",
            "type": "string",
            "values": [
              "png",
              "jpeg"
            ],
            "default": "png",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0.output_format",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "sequential",
            "label": "组图",
            "type": "string",
            "values": [
              "disabled",
              "auto"
            ],
            "default": "disabled",
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0.sequential_image_generation",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "maxImages",
            "label": "组图张数上限",
            "type": "integer",
            "min": 1,
            "max": 15,
            "step": 1,
            "default": 4,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0.max_images",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "webSearch",
            "label": "联网搜索",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0.web_search",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          },
          {
            "name": "watermark",
            "label": "水印",
            "type": "boolean",
            "default": false,
            "binding": "providerOptions.volcengine-ark-seedream-suite-5-0.watermark",
            "models": [
              "doubao-seedream-5-0-260128"
            ]
          }
        ],
        "parameters": [
          {
            "name": "model",
            "type": "string",
            "required": true,
            "mapping": "model",
            "description": "图片模型 ID。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": true,
            "mapping": "prompt",
            "description": "图片提示词。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "provider image/reference fields",
            "description": "参考图或编辑源图，role 由业务层确定。"
          },
          {
            "name": "imageCount",
            "type": "integer",
            "required": false,
            "mapping": "n/sample_count",
            "description": "输出数量；分档计价按张结算。"
          },
          {
            "name": "aspectRatio",
            "type": "string",
            "required": false,
            "mapping": "size/aspect_ratio",
            "description": "宽高比或精确尺寸。"
          },
          {
            "name": "resolution",
            "type": "string",
            "required": false,
            "mapping": "resolution/imageSize",
            "description": "分辨率档位。"
          },
          {
            "name": "quality",
            "type": "string",
            "required": false,
            "mapping": "quality",
            "description": "质量档位。"
          },
          {
            "name": "providerOptions",
            "type": "object",
            "required": false,
            "mapping": "provider-specific fields",
            "description": "插件命名空间内的厂商扩展字段。"
          }
        ],
        "validations": [],
        "create": {
          "method": "POST",
          "path": "/api/v3/images/generations",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "prompt": {
              "$ref": "request.prompt"
            },
            "size": {
              "$omitEmpty": {
                "$switch": {
                  "cases": [
                    {
                      "when": {
                        "$eq": [
                          {
                            "$lower": {
                              "$trim": {
                                "$coalesce": [
                                  {
                                    "$ref": "request.resolution"
                                  },
                                  "2k"
                                ]
                              }
                            }
                          },
                          "4k"
                        ]
                      },
                      "then": {
                        "$switch": {
                          "cases": [
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "1:1"
                                ]
                              },
                              "then": "2880x2880"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "16:9"
                                ]
                              },
                              "then": "3840x2160"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "9:16"
                                ]
                              },
                              "then": "2160x3840"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:3"
                                ]
                              },
                              "then": "3264x2448"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:4"
                                ]
                              },
                              "then": "2448x3264"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "3:2"
                                ]
                              },
                              "then": "3504x2336"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "2:3"
                                ]
                              },
                              "then": "2336x3504"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "4:5"
                                ]
                              },
                              "then": "2560x3200"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "5:4"
                                ]
                              },
                              "then": "3200x2560"
                            },
                            {
                              "when": {
                                "$eq": [
                                  {
                                    "$ref": "request.aspectRatio"
                                  },
                                  "21:9"
                                ]
                              },
                              "then": "3808x1632"
                            }
                          ],
                          "default": {
                            "$ref": "request.aspectRatio"
                          }
                        }
                      }
                    }
                  ],
                  "default": {
                    "$switch": {
                      "cases": [
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "1:1"
                            ]
                          },
                          "then": "2048x2048"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "16:9"
                            ]
                          },
                          "then": "2752x1536"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "9:16"
                            ]
                          },
                          "then": "1536x2752"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "4:3"
                            ]
                          },
                          "then": "2304x1728"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "3:4"
                            ]
                          },
                          "then": "1728x2304"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "3:2"
                            ]
                          },
                          "then": "2496x1664"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "2:3"
                            ]
                          },
                          "then": "1664x2496"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "4:5"
                            ]
                          },
                          "then": "1792x2240"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "5:4"
                            ]
                          },
                          "then": "2240x1792"
                        },
                        {
                          "when": {
                            "$eq": [
                              {
                                "$ref": "request.aspectRatio"
                              },
                              "21:9"
                            ]
                          },
                          "then": "3136x1344"
                        }
                      ],
                      "default": {
                        "$ref": "request.aspectRatio"
                      }
                    }
                  }
                }
              }
            },
            "image": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$len": {
                          "$ref": "request.images"
                        }
                      },
                      1
                    ]
                  },
                  "then": {
                    "$first": {
                      "$map": {
                        "from": {
                          "$ref": "request.images"
                        },
                        "as": "media",
                        "in": {
                          "$ref": "media.value"
                        }
                      }
                    }
                  },
                  "else": {
                    "$if": {
                      "condition": {
                        "$gt": [
                          {
                            "$len": {
                              "$ref": "request.images"
                            }
                          },
                          1
                        ]
                      },
                      "then": {
                        "$map": {
                          "from": {
                            "$ref": "request.images"
                          },
                          "as": "media",
                          "in": {
                            "$ref": "media.value"
                          }
                        }
                      },
                      "else": null
                    }
                  }
                }
              }
            },
            "watermark": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.watermark"
                },
                {
                  "$ref": "request.watermark"
                },
                false
              ]
            },
            "response_format": {
              "$coalesce": [
                {
                  "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.response_format"
                },
                "url"
              ]
            },
            "sequential_image_generation": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.sequential_image_generation"
              }
            },
            "sequential_image_generation_options": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.sequential_image_generation"
                      },
                      "auto"
                    ]
                  },
                  "then": {
                    "max_images": {
                      "$coalesce": [
                        {
                          "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.max_images"
                        },
                        4
                      ]
                    }
                  },
                  "else": null
                }
              }
            },
            "tools": {
              "$omitEmpty": {
                "$if": {
                  "condition": {
                    "$eq": [
                      {
                        "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.web_search"
                      },
                      true
                    ]
                  },
                  "then": [
                    {
                      "type": "web_search"
                    }
                  ],
                  "else": null
                }
              }
            },
            "output_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.volcengine-ark-seedream-suite-5-0.output_format"
              }
            }
          }
        },
        "response": {
          "status": "succeeded",
          "images": {
            "$ref": "response.data"
          },
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code"
          ],
          "messagePaths": [
            "error.message"
          ]
        }
      }
    ]
  }
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
