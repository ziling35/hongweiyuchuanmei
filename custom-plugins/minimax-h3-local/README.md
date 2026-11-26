# MiniMax H3 本地通道（4090）

自部署 MiniMax H3 视频生成的声明式协议插件。影策后端直接调用 H3 适配器（`POST /task/openapi/create` 提交、`GET /task/openapi/status?taskId=` 轮询），适配器把请求翻译成 ComfyUI 原生任务，在**单张 RTX 4090（24GB）**上出片。音画同生成，产物恒含 AAC 音轨，没有开关。

```
影策后端 ──POST /task/openapi/create──▶ H3 适配器(:8188) ──POST /prompt──▶ ComfyUI(:8191)
   ▲                                        │
   └──GET /task/openapi/status?taskId=──────┘──GET /history/{id}──▶ 轮询产物
```

## 单卡部署要留意

- 适配器默认按双实例配置（`COMFYUI_ADAPTER_INSTANCES=http://127.0.0.1:8191,http://127.0.0.1:8192`）。单张 4090 只有一块卡时，把它改成唯一的实例地址；保留默认值时第二个实例不可达只会被调度跳过，但 `/health` 会多一条哨兵 `queue`。
- `COMFYUI_ADAPTER_TOKEN` 生产必须改掉默认值，填进渠道的 API Key。
- 1080p 在 24GB 上显存接近上限（靠 DynamicVRAM offload，实测无 OOM），采样期间该卡不要再排其他任务；单卡建议把 `COMFYUI_ADAPTER_MAXQUEUE`（默认每实例 4）调小，避免一次排进多支长任务。

## 导入与配置

1. 后台 → 插件 → 导入插件 → 上传 `minimax-h3-local.yingce-plugin`（改完重新打包再导入即可，不用重建镜像）。
2. 渠道管理 → 新建渠道：接口选本插件，Base URL 填适配器地址（如 `http://192.168.1.20:8188`，不要带 `/task` 前缀），API Key 填适配器的 `COMFYUI_ADAPTER_TOKEN`。宿主对无版本前缀的路径会补 `/v1`，适配器 `/v1/task/...` 与 `/task/...` 等价。
3. 模型名照抄档位：`minimax-h3-turbo`（turbo LoRA 8 步，默认）、`minimax-h3-quality`（无 LoRA 20 步，约为 turbo 的 2.5 倍耗时）。含 `quality` / `base` / `-20step` 的档位走 20 步，其余走 turbo 8 步。
4. 渠道模型能力需与档位一致：分辨率 `480p/720p/1080p`、画幅 `16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9`、时长 5–15 秒；价格档按「模式 × 档位」全覆盖（免费也必须显式 0），否则用户侧不出现对应选项。
5. 设置 → 存储服务 →「服务器访问地址」填影策对外根地址。图生视频时平台签发内部下载链接给适配器取回首帧，4090 那台机器必须能访问这个地址；单张 ≤ 30MB、下载超时 90s、只取一张。

## 参数映射

| 统一字段 | 上游位置 | 说明 |
| --- | --- | --- |
| `model` | `model` | 档位原样发送 |
| `prompt` | `input.prompt` | 必填，空值在宿主侧直接拦下 |
| `images` | `input.images[0]` | 只取 order 最小的一张作首帧 |
| `duration` | `input.duration` | 未设置或 0 时不发，适配器缺省 5 秒 |
| `aspectRatio` | `input.aspect_ratio` | 未设置时不发：有首帧图按图片宽高比，否则 16:9 |
| `resolution` | `input.resolution` | 未设置时不发，适配器缺省 720p |
| `providerOptions` | `input` / 请求体 | `providerOptions.minimax-h3-local.input` 合并进 input，`.body` / `.extra_body` 合并进请求体顶层 |

`input.videos` / `input.audios` 当前通道不支持，插件不下发。

## 帧网格与耗时（24GB 单卡参考）

- 帧率固定 24fps，帧数向上对齐模型的 17k+5 网格：5 秒 → 124 帧（实际 5.17s）、10 秒 → 243 帧（10.125s）。
- turbo 5 秒实测：480p ≈ 1 分钟、720p ≈ 4.5 分钟、1080p ≈ 11.5 分钟；quality 按步数比例放大（约 2.5 倍）。
- 分辨率档位映射短边，面积上限沿用 1.75 比例、逐边对齐 32 像素：720p 对应 1344×768（16:9）/ 768×1344（9:16）。

## 错误码

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `missing_prompt` | 无提示词 |
| 400 | `bad_request` | JSON 解析失败 |
| 401 | `unauthorized` | Bearer Token 不匹配 |
| 429 | `busy` | 全部实例队列达到上限 |
| 502 | `upstream_error` | 参考图下载失败或 ComfyUI 提交失败，message 带原因 |

适配器的任务映射保存在内存：适配器重启后查询返回 `failed`（"任务不存在"），按失败重试即可，不会重复扣费上游。

## 打包

```bash
node custom-plugins/build.mjs minimax-h3-local
```

脚本先把 README 与 `docs/interface.md` 的 manifest 契约写回，再生成 `custom-plugins/minimax-h3-local.yingce-plugin` 并打印 sha256。改了包内任何文件都要提升 `manifest.json` 的 `version`，否则导入会被摘要校验拒绝。
