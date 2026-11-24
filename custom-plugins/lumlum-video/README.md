# LumLum 视频生成（Seedance / Wan 3.0）

LumLum 开放平台（`https://lumlum.tv/api/open-platform/v1`）的视频协议插件。一个包内含两个 provider，共用同一份 API Key 配置：

| Provider | 线协议 | 创建 | 查询 |
| --- | --- | --- | --- |
| `lumlum-seedance` | 方舟兼容（Seedance 2.5 / 2.0 系列） | `POST /ark/contents/generations/tasks` | `GET /ark/contents/generations/tasks/{id}` |
| `lumlum-wan3` | 百炼兼容（Wan 3.0 标准版 / 高速版） | `POST /videos/generations` | `GET /tasks/{id}` |

两者都把宿主幂等键映射到 `Idempotency-Key` 请求头，并声明 `idempotentCreate`：连接中断或 5xx 时宿主会用同一个键和同一份请求体重试，LumLum 在 24 小时内返回同一任务，不会重复建单或重复扣费。

## 安装与配置

1. 管理员在「插件管理」上传 `lumlum-video.yingce-plugin`，并启用插件。
2. 在系统渠道或用户自定义渠道里选择 `LumLum Seedance 视频（方舟格式）` 或 `LumLum Wan 3.0 视频（百炼格式）`。
3. 填入 LumLum API Key（Bearer），Base URL 保持默认 `https://lumlum.tv/api/open-platform/v1`，或改写为其他网关根地址。
4. 模型名填 LumLum 的正式模型标识。Seedance 必须区分大小写，例如 `doubao-seedance-2-5-260628`、`doubao-seedance-2-0-fast-260128`；Wan 3.0 填 `wan3.0-video` 或 `wan3.0-video-prime`。

音频开关：LumLum 上游默认生成音频（`generate_audio`/`audio` 缺省为 true），但宿主渠道未配置「生成音频」时下发的是 `false`。需要有声视频请在视频能力面板开启该开关，或用 `providerOptions.lumlum-seedance.generate_audio` / `providerOptions.lumlum-wan3.audio` 强制覆盖。

编辑/延长：上游判定为视频编辑或延长后只接受 `ratio: "adaptive"` 与 `duration: -1`。插件在 Seedance provider 里自动归一——`omni_reference_task_type` 为 `edit`/`extend`，或没设该字段且请求带输入视频时，强制下 `adaptive` + `-1`；想按参考视频生成并保留自定义比例/时长，请显式把 `omni_reference_task_type` 设为 `reference`。

## 边界

- 参考素材必须是上游可直接抓取的公网 HTTPS URL（声明 `requiresPublicMediaUrls`）；未配置服务器访问地址时会明确报错，不回退 base64。
- 成品地址按临时地址处理（`resultEphemeral`），由宿主立即下载并持久化。LumLum 只在 24 小时内支持按任务 ID 回查。
- 覆盖范围是视频生成：Seedance 的 `draft_task` 样片转正式、Seedance 2.5 的编辑/延长都通过 `providerOptions` 暴露；`GET /models`、`GET /balance`、`POST /pricing/estimate` 和图片接口不属于本插件的生成协议。

完整接口见 [docs/interface.md](docs/interface.md)。
