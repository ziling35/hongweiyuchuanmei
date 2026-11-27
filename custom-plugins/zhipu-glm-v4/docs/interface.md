# 智谱 GLM 官方 v4 接口字段

## 协议身份

- 插件 ID：`zhipu-glm-v4`。
- Provider ID：`zhipu-glm-v4`。
- 能力：`text`。
- 默认 Base URL：`https://open.bigmodel.cn`（只到主机；`/api/paas/v4` 由插件以根路径方式声明）。
- 鉴权：`bearer`，请求头 `Authorization: Bearer <apiKey>`。
- 创建：`POST /api/paas/v4/chat/completions`（`originPath: true`，路径覆盖渠道 Base URL 的路径部分）。
- Agent：同一路径 `/api/paas/v4/chat/completions`，工具调用与普通对话共用。
- 生命周期：同步响应，流式由宿主按 SSE 解析。

> 说明：仓库里另有 `zhipu-glm-chat`，其 Base URL 停在 `/api/paas` 且路径为 `/v1/chat/completions`，与官方 v4 文档不一致；需要对齐官方端点时用本插件。

## 配置字段

| 字段 | 类型 | 必填 | 含义 |
| --- | --- | --- | --- |
| `apiKey` | secret | 是 | 智谱开放平台 API Key；标准 API、个人套餐、团队套餐的 Key 互不通用，编码套餐另有专属端点。 |

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 官方模型 ID，如 `glm-4.6v`。 |
| `messages` | message[] | 是 | `messages` | 对话消息容器，含角色、历史与当前输入。 |
| `instructions` | string | 否 | `messages[role=system]` | 系统指令，宿主写成首条 system 消息。 |
| `images` | media[] | 否 | `messages[].content[type=image_url]` | 图片内容块 `{type:image_url,image_url:{url}}`，URL 需公网可访问。 |
| `videos` | media[] | 否 | `messages[].content[type=video_url]` | 视频内容块 `{type:video_url,video_url:{url}}`。 |
| `audios` | media[] | 否 | `messages[].content[type=audio_url]` | 音频内容块，仅音频理解模型读取。 |
| `temperature` | number | 否 | `temperature` | 采样温度。 |
| `top_p` | number | 否 | `top_p` | 核采样。 |
| `max_tokens` | integer | 否 | `max_tokens` | 输出上限。 |
| `tools` | array | 否 | `tools` | 工具定义。 |
| `tool_choice` | object\|string | 否 | `tool_choice` | 工具选择策略。 |
| `response_format` | object | 否 | `response_format` | 结构化输出。 |
| `stream` | boolean | 否 | `stream` | 流式开关。 |
| `thinking` | object | 否 | `thinking` | 思考模式 `{type:"enabled"\|"disabled"}`。 |
| `do_sample` | boolean | 否 | `do_sample` | 是否采样；关闭时温度不生效。 |

## 上游请求模板逐字段清单

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/api/paas/v4/chat/completions"` |
| `create.originPath` | `true` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.messages` | `{"$ref":"request.messages"}` |
| `create.body.temperature` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.temperature"}}` |
| `create.body.top_p` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.top_p"}}` |
| `create.body.max_tokens` | `{"$omitEmpty":{"$coalesce":[{"$ref":"request.extra.max_tokens"},{"$ref":"request.providerOptions.zhipu-glm-v4.max_tokens"}]}}` |
| `create.body.tools` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.tools"}}` |
| `create.body.tool_choice` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.tool_choice"}}` |
| `create.body.response_format` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.response_format"}}` |
| `create.body.thinking` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.thinking"}}` |
| `create.body.do_sample` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.do_sample"}}` |
| `create.body.stream` | `{"$omitEmpty":{"$ref":"request.providerOptions.zhipu-glm-v4.stream"}}` |
| `agent.method` | `"POST"` |
| `agent.path` | `"/api/paas/v4/chat/completions"` |
| `agent.originPath` | `true` |
| `agent.body` | `{"$merge":[{"$ref":"request.extra.agent.chatCompletion"},{"model":{"$ref":"request.model"}}]}` |

## Provider 扩展键

- `providerOptions.zhipu-glm-v4.temperature`
- `providerOptions.zhipu-glm-v4.top_p`
- `providerOptions.zhipu-glm-v4.max_tokens`
- `providerOptions.zhipu-glm-v4.tools`
- `providerOptions.zhipu-glm-v4.tool_choice`
- `providerOptions.zhipu-glm-v4.response_format`
- `providerOptions.zhipu-glm-v4.thinking`
- `providerOptions.zhipu-glm-v4.do_sample`
- `providerOptions.zhipu-glm-v4.stream`

## 请求校验

- `messages` 不能为空。

## 响应映射逐字段清单

| 映射位置 | 上游路径或转换表达式 |
| --- | --- |
| `response.status` | `"succeeded"` |
| `response.textPaths[0]` | `"choices.0.message.content"` |
| `response.textPaths[1]` | `"choices.0.text"` |
| `response.reasoningPaths[0]` | `"choices.0.message.reasoning_content"` |
| `response.usage` | `{"$ref":"response.usage"}` |
| `response.errorPaths[0]` | `"error.code"` |
| `response.errorPaths[1]` | `"code"` |
| `response.messagePaths[0]` | `"error.message"` |
| `response.messagePaths[1]` | `"msg"` |
| `agentResponse.toolCallsPath` | `"choices.0.message.tool_calls"` |
| `agentResponse.toolCallIdPaths[0]` | `"id"` |
| `agentResponse.toolCallNamePaths[0]` | `"function.name"` |
| `agentResponse.toolCallArgumentsPaths[0]` | `"function.arguments"` |

## 响应与错误

- 成功响应取 `choices[0].message.content`；思考模型另把 `choices[0].message.reasoning_content` 作为推理内容回传，供后台展示，不进入正文。
- 用量取 `usage`（`prompt_tokens`、`completion_tokens`、`total_tokens`），原样回传宿主用于计费与调用日志。
- 错误兼容两种形态：官方标准的 `{"error":{"code":..,"message":..}}` 与网关层的 `{"code":1001,"msg":..,"success":false}`。任一非零 `error.code` / `code` 都判定失败，不包装成成功。
- 工具调用按 `choices[0].message.tool_calls[].function` 解析为宿主工具调用。

## 兼容边界

- 本插件只代表官方通用 v4 端点；GLM 编码套餐（Coding Plan）使用专属端点与专属 Key，需要另做插件或在渠道里改 Base URL。
- 视频输入要求公网可访问的 URL：插件声明 `requiresPublicMediaUrls`，宿主会把本地资源换成签名地址并拒绝内嵌 data URL。因此 `CANVAS_PUBLIC_BASE_URL` 必须配置为外部可达地址。
- 为什么用 `originPath`：宿主拼 URL 用的是「渠道 Base URL + 插件 path」，并且当 base 与 path 都没有可识别版本段（`/v1`、`/v2`、`/v3`、`/v1beta`、`/api/v1`、`/api/v3`、`/api/plan/v3`）时会**自动补一个 `/v1`**。官方 `/api/paas/v4` 不在该列表里，因此把 base 写成 `.../api/paas/v4` 会得到 `.../api/paas/v4/v1/chat/completions`。本插件对创建与 Agent 都声明 `originPath: true`，只取渠道地址的 scheme+host，路径完全由插件给出。
- `GLM-4V-Plus-0111` 要求 `video_url` 位于 `content` 数组第一位，宿主按“文本 → 图片 → 视频 → 音频”的顺序拼装，使用该模型时需要自行确认顺序要求。
- 思考模式只能通过 `providerOptions` 下发：渠道的「思考等级」当前只作用于宿主内置协议，不会注入本插件的 `thinking` 字段。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "zhipu-glm-v4",
  "name": "智谱 GLM 官方 v4",
  "version": "1.0.1",
  "author": "智谱 AI / 影策",
  "description": "智谱开放平台 open.bigmodel.cn/api/paas/v4/chat/completions 独立请求协议插件，支持文本、图片、视频、音频多模态输入与思考模式。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "智谱 API Key",
        "required": true,
        "description": "智谱开放平台 API Key（Bearer），标准 API、个人套餐、团队套餐的 Key 互不通用。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "zhipu-glm-v4",
        "label": "智谱 GLM 官方 v4",
        "capabilities": [
          "text"
        ],
        "scopes": [
          "admin.system-channel",
          "user.custom-channel",
          "canvas",
          "creation",
          "agent"
        ],
        "baseUrl": "https://open.bigmodel.cn",
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
            "description": "上游模型 ID，例如 glm-4.6v、glm-5.3、glm-4.5v。"
          },
          {
            "name": "messages",
            "type": "message[]",
            "required": true,
            "mapping": "messages",
            "description": "对话消息容器，系统指令、历史消息和当前用户输入都通过它下发。"
          },
          {
            "name": "instructions",
            "type": "string",
            "required": false,
            "mapping": "messages[role=system]",
            "description": "系统指令，宿主会作为首条 system 消息写入 messages。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "messages[].content[type=image_url]",
            "description": "参考图片，按 content 数组的 image_url 块发送，需要公网可访问的 URL。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "messages[].content[type=video_url]",
            "description": "参考视频，按 content 数组的 video_url 块发送；GLM-4V-Plus-0111 要求 video_url 位于 content 首位。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "messages[].content[type=audio_url]",
            "description": "参考音频，按 content 数组的 audio_url 块发送，仅支持的音频理解模型会读取。"
          },
          {
            "name": "temperature",
            "type": "number",
            "required": false,
            "mapping": "temperature",
            "description": "采样温度，建议 0-1；反推提示词建议 0.2-0.6。"
          },
          {
            "name": "top_p",
            "type": "number",
            "required": false,
            "mapping": "top_p",
            "description": "核采样参数。"
          },
          {
            "name": "max_tokens",
            "type": "integer",
            "required": false,
            "mapping": "max_tokens",
            "description": "最大输出 token，来自任务输出上限或 providerOptions。"
          },
          {
            "name": "tools",
            "type": "array",
            "required": false,
            "mapping": "tools",
            "description": "工具定义，Agent 调用时由宿主填入。"
          },
          {
            "name": "tool_choice",
            "type": "object|string",
            "required": false,
            "mapping": "tool_choice",
            "description": "工具选择策略。"
          },
          {
            "name": "response_format",
            "type": "object",
            "required": false,
            "mapping": "response_format",
            "description": "结构化输出配置，例如 {\"type\":\"json_object\"}。"
          },
          {
            "name": "stream",
            "type": "boolean",
            "required": false,
            "mapping": "stream",
            "description": "流式开关；流式请求由宿主按 SSE 解析。"
          },
          {
            "name": "thinking",
            "type": "object",
            "required": false,
            "mapping": "thinking",
            "description": "思考模式，来自 providerOptions.zhipu-glm-v4.thinking，例如 {\"type\":\"disabled\"} 或 {\"type\":\"enabled\"}。"
          },
          {
            "name": "do_sample",
            "type": "boolean",
            "required": false,
            "mapping": "do_sample",
            "description": "是否启用采样，来自 providerOptions.zhipu-glm-v4.do_sample；关闭时忽略 temperature。"
          }
        ],
        "validations": [
          {
            "assert": {
              "$gt": [
                {
                  "$len": {
                    "$ref": "request.messages"
                  }
                },
                0
              ]
            },
            "message": "请填写要发送给智谱模型的消息"
          }
        ],
        "create": {
          "method": "POST",
          "originPath": true,
          "path": "/api/paas/v4/chat/completions",
          "contentType": "application/json",
          "body": {
            "model": {
              "$ref": "request.model"
            },
            "messages": {
              "$ref": "request.messages"
            },
            "temperature": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.temperature"
              }
            },
            "top_p": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.top_p"
              }
            },
            "max_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.zhipu-glm-v4.max_tokens"
                  }
                ]
              }
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.tool_choice"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.response_format"
              }
            },
            "thinking": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.thinking"
              }
            },
            "do_sample": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.do_sample"
              }
            },
            "stream": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.zhipu-glm-v4.stream"
              }
            }
          }
        },
        "agent": {
          "method": "POST",
          "originPath": true,
          "path": "/api/paas/v4/chat/completions",
          "contentType": "application/json",
          "body": {
            "$merge": [
              {
                "$ref": "request.extra.agent.chatCompletion"
              },
              {
                "model": {
                  "$ref": "request.model"
                }
              }
            ]
          }
        },
        "response": {
          "status": "succeeded",
          "textPaths": [
            "choices.0.message.content",
            "choices.0.text"
          ],
          "reasoningPaths": [
            "choices.0.message.reasoning_content"
          ],
          "usage": {
            "$ref": "response.usage"
          },
          "errorPaths": [
            "error.code",
            "code"
          ],
          "messagePaths": [
            "error.message",
            "msg"
          ]
        },
        "agentResponse": {
          "textPaths": [
            "choices.0.message.content",
            "choices.0.text"
          ],
          "reasoningPaths": [
            "choices.0.message.reasoning_content"
          ],
          "toolCallsPath": "choices.0.message.tool_calls",
          "toolCallIdPaths": [
            "id"
          ],
          "toolCallNamePaths": [
            "function.name"
          ],
          "toolCallArgumentsPaths": [
            "function.arguments"
          ]
        }
      }
    ]
  },
  "documentation": "<当前插件的完整 documentation，由 README.md 与 docs/interface.md 拼接而成；为避免 JSON 递归，此处不重复展开正文。>"
}
```
<!-- YINGCE_MANIFEST_CONTRACT_END -->
