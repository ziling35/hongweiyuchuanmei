# 坤肉 AI Images

该目录是独立官方协议插件源码（派生自 `openai-images`，上游为 [坤肉 AI](https://doc.kunrouai.com/)）。

后端从生成的 `kunrou-images.yingce-plugin` 包加载，不依赖系统内置 `host:` 适配器。

完整接口见 [docs/interface.md](docs/interface.md)。

## 与 openai-images 的差异

| 项 | 说明 |
| --- | --- |
| Provider ID | `kunrou-image`（`providerOptions` 命名空间随之改为 `kunrou-image.*`） |
| 默认 Base URL | `https://api.kunrouai.com`（可在渠道里覆盖） |
| `count` | 上限 1（上游 `n` 固定为 1） |
| `quality` | `medium` / `high` |
| `transparentBackground` | 默认启用（上游 `background` 支持 `transparent/opaque/auto`） |
| `outputFormat` | 默认启用，`png` / `jpeg` / `webp` |

`size` 参数保持不声明取值（`allowCustom` 由宿主按声明推导，为 `true`），这样管理端「尺寸参数」里的画幅列表、以及「自定义比例」输入都正常工作。

## 标准像素尺寸（如 1920×1080）怎么配

`1920x1080` 是标准 16:9，但 `1080` 不是 16 的倍数，历史上会被宿主的像素对齐校验拒绝。宿主自本插件同期版本起，对**管理员配置的预设像素**豁免该对齐校验，配置方式：

1. 编辑模型 → `能力与参数 → 尺寸参数`，在「配置画幅与精确像素」里为目标档位填写精确像素；
   例如 2K 档 `16:9` 填 **1920 × 1080**、4K 档 `16:9` 填 **3840 × 2160**、`21:9` 填 **2560 × 1088**。
2. 保存后在创作端「尺寸」里即可点选这些预设，不再触发「宽高必须是 16 的倍数」。
3. 用户手输未被配置成预设的尺寸（例如 `1000x1000`）仍按 16 对齐校验拒绝。

## 上游协议要点（来自坤肉文档）

- 文生图 `POST /v1/images/generations`；有参考图/蒙版走 `POST /v1/images/edits`（JSON 传 `images[]`，或 multipart 传 `image[]`）。
- `size` 接受像素（`1024x1536`）、档位（`1K/2K`）或比例（`16:9`）；`ratio`、`resolution` 的优先级高于 `size`。
- `n` 固定为 1；`background` 取 `transparent/opaque/auto`；`response_format` 取 `url/b64_json`。
