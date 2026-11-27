# OpenAI 兼容对话（公网素材）接口字段

## 协议身份

- 插件 ID：`openai-chat-public-media`。
- Provider ID：`openai-chat-public-media`。
- 能力：`text`。
- 默认 Base URL：`https://api.openai.com/v1`（渠道里可覆盖）。
- 鉴权：`bearer`，请求头 `Authorization: Bearer <apiKey>`。
- 创建：`POST /chat/completions`。
- Agent：`POST /chat/completions`。
- 生命周期：同步响应，流式由宿主按 SSE 解析。
- 关键声明：`requiresPublicMediaUrls: true`。

## 为什么单独做一个插件

内置 `chat-completion` 属于 `preferURL` 协议，只有当资源真的存在对象存储（`resource.provider != "local"`）时才发签名 URL，否则内联 base64。声明 `requiresPublicMediaUrls` 后，宿主把该协议提升为 `requireURL`，服务器本地存储的资源也会签发公网 URL，因此不再产生几十 MB 的请求体。

## 统一字段映射

| 统一字段 | 类型 | 必填 | 上游映射 | 说明 |
| --- | --- | --- | --- | --- |
| `model` | string | 是 | `model` | 上游模型 ID。 |
| `messages` | message[] | 否 | `messages` 前缀部分 | 宿主只提供历史对话（role/content 文本）。 |
| `instructions` | string | 否 | `messages[role=system]` | 非空时作为首条 system 消息。 |
| `prompt` | string | 否 | `messages[role=user].content[type=text]` | 本轮用户输入。 |
| `images` | media[] | 否 | `messages[role=user].content[type=image_url]` | 公网签名 URL。 |
| `videos` | media[] | 否 | `messages[role=user].content[type=video_url]` | 公网签名 URL，按 `order` 稳定排序。 |
| `temperature` | number | 否 | `temperature` | 采样温度。 |
| `max_tokens` | integer | 否 | `max_tokens` | 优先 `request.extra.max_tokens`。 |
| `tools` | array | 否 | `tools` | Agent 工具定义。 |
| `tool_choice` | object\|string | 否 | `tool_choice` | 工具策略。 |
| `response_format` | object | 否 | `response_format` | 结构化输出。 |
| `stream` | boolean | 否 | `stream` | 流式开关。 |

## 上游请求模板逐字段清单

| 上游位置 | 值或转换表达式 |
| --- | --- |
| `create.method` | `"POST"` |
| `create.path` | `"/chat/completions"` |
| `create.contentType` | `"application/json"` |
| `create.body.model` | `{"$ref":"request.model"}` |
| `create.body.messages` | `{"$concatArrays":[system 条件消息, {"$ref":"request.messages"}, [user 消息]]}`；user 的 `content` 为 `[text(prompt), image_url…, video_url…]` |
| `create.body.temperature` | `{"$omitEmpty":{"$ref":"request.providerOptions.openai-chat-public-media.temperature"}}` |
| `create.body.max_tokens` | `{"$omitEmpty":{"$coalesce":[{"$ref":"request.extra.max_tokens"},{"$ref":"request.providerOptions.openai-chat-public-media.max_tokens"}]}}` |
| `create.body.tools` | `{"$omitEmpty":{"$ref":"request.providerOptions.openai-chat-public-media.tools"}}` |
| `create.body.tool_choice` | `{"$omitEmpty":{"$ref":"request.providerOptions.openai-chat-public-media.tool_choice"}}` |
| `create.body.response_format` | `{"$omitEmpty":{"$ref":"request.providerOptions.openai-chat-public-media.response_format"}}` |
| `create.body.stream` | `{"$omitEmpty":{"$ref":"request.providerOptions.openai-chat-public-media.stream"}}` |
| `agent.body` | `{"$merge":[{"$ref":"request.extra.agent.chatCompletion"},{"model":{"$ref":"request.model"}}]}` |

## Provider 扩展键

- `providerOptions.openai-chat-public-media.temperature`
- `providerOptions.openai-chat-public-media.max_tokens`
- `providerOptions.openai-chat-public-media.tools`
- `providerOptions.openai-chat-public-media.tool_choice`
- `providerOptions.openai-chat-public-media.response_format`
- `providerOptions.openai-chat-public-media.stream`

## 响应与错误

- 文本取 `choices[0].message.content`，回退 `choices[0].text`；推理内容取 `choices[0].message.reasoning_content`。
- 用量原样回传 `usage`，供计费与调用日志使用。
- `error.code` / `code` 任一存在即判定失败，不包装成成功；`error.message` / `msg` 作为失败原因。

## 兼容边界

- 只覆盖 OpenAI Chat Completions 线格式；Gemini `generateContent`、Anthropic Messages 等线格式请用各自插件。
- 视频块位置固定为「text → image_url → video_url」；要求 `video_url` 排在首位的模型（如 `GLM-4V-Plus-0111`）需要另做插件。
- 声明 `requiresPublicMediaUrls` 后，参考素材必须是公网可达地址；未配置「服务器访问地址」/`CANVAS_PUBLIC_BASE_URL` 时会明确报错，不会静默回退成 base64。

<!-- YINGCE_MANIFEST_CONTRACT_START -->
## Manifest 完整接口定义

以下 JSON 与插件包内实际 `manifest.json` 逐字段一致，覆盖插件身份、权限、配置、鉴权、参数、校验、创建、Agent、查询、取消、结果下载、响应和 Agent 响应映射。`documentation` 字段的值就是当前完整文档；为避免文档在自身内部无限递归，JSON 中仅用等义占位文本表示正文。

```json
{
  "apiVersion": "yingce.plugin/v2",
  "id": "openai-chat-public-media",
  "name": "OpenAI 兼容对话（公网素材）",
  "version": "1.0.0",
  "author": "影策",
  "description": "OpenAI Chat Completions 兼容的文本插件。与内置 chat-completion 的唯一区别是声明了 requiresPublicMediaUrls，服务器本地存储的参考视频会以短期签名 URL 发送而不是内联 base64，避免上游网关 413。",
  "permissions": [
    "generation.run",
    "media.read"
  ],
  "configuration": {
    "fields": [
      {
        "name": "apiKey",
        "type": "secret",
        "label": "上游 API Key",
        "required": true,
        "description": "以 Bearer 方式发送。聚合站或自建网关的 Key 都填这里。"
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "openai-chat-public-media",
        "label": "OpenAI 兼容对话（公网素材）",
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
        "baseUrl": "https://api.openai.com/v1",
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
            "description": "上游模型 ID，例如 qwen4-max-preview。"
          },
          {
            "name": "messages",
            "type": "message[]",
            "required": false,
            "mapping": "messages",
            "description": "由宿主组装的对话消息：system 指令、历史消息，以及本轮 user 内容块（text、image_url、video_url）。"
          },
          {
            "name": "instructions",
            "type": "string",
            "required": false,
            "mapping": "messages[role=system]",
            "description": "系统指令，非空时作为首条 system 消息。"
          },
          {
            "name": "prompt",
            "type": "string",
            "required": false,
            "mapping": "messages[role=user].content[type=text]",
            "description": "本轮用户输入文本。"
          },
          {
            "name": "images",
            "type": "media[]",
            "required": false,
            "mapping": "messages[role=user].content[type=image_url]",
            "description": "参考图片，按公网签名 URL 发送。"
          },
          {
            "name": "videos",
            "type": "media[]",
            "required": false,
            "mapping": "messages[role=user].content[type=video_url]",
            "description": "参考视频，按公网签名 URL 发送；这是本插件与内置 chat-completion 的差异点。"
          },
          {
            "name": "audios",
            "type": "media[]",
            "required": false,
            "mapping": "messages[role=user].content[type=audio_url]",
            "description": "参考音频，按公网 URL 发送，仅音频理解模型读取。"
          },
          {
            "name": "temperature",
            "type": "number",
            "required": false,
            "mapping": "temperature",
            "description": "采样温度。"
          },
          {
            "name": "max_tokens",
            "type": "integer",
            "required": false,
            "mapping": "max_tokens",
            "description": "最大输出 token。"
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
            "description": "结构化输出配置。"
          },
          {
            "name": "stream",
            "type": "boolean",
            "required": false,
            "mapping": "stream",
            "description": "流式开关，由宿主按 SSE 解析。"
          }
        ],
        "create": {
          "method": "POST",
          "path": "/chat/completions",
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
                "$ref": "request.providerOptions.openai-chat-public-media.temperature"
              }
            },
            "max_tokens": {
              "$omitEmpty": {
                "$coalesce": [
                  {
                    "$ref": "request.extra.max_tokens"
                  },
                  {
                    "$ref": "request.providerOptions.openai-chat-public-media.max_tokens"
                  }
                ]
              }
            },
            "tools": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.openai-chat-public-media.tools"
              }
            },
            "tool_choice": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.openai-chat-public-media.tool_choice"
              }
            },
            "response_format": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.openai-chat-public-media.response_format"
              }
            },
            "stream": {
              "$omitEmpty": {
                "$ref": "request.providerOptions.openai-chat-public-media.stream"
              }
            }
          }
        },
        "agent": {
          "method": "POST",
          "path": "/chat/completions",
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
