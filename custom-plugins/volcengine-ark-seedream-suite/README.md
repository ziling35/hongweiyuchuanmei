# 火山方舟 Seedream 图片生成（内置尺寸）

火山方舟声明式图片插件，面向普通 `/api/v3/images/generations` 接口，一个包内含三个 provider：

| Provider | 服务模型 | 尺寸档 |
| --- | --- | --- |
| `volcengine-ark-seedream-suite-55` | `doubao-seedream-5-5-261028` | 1K / 1.5K / 2K |
| `volcengine-ark-seedream-suite-5-0-pro` | `doubao-seedream-5-0-pro-260628` | 1K / 1.5K / 2K |
| `volcengine-ark-seedream-suite-5-0` | `doubao-seedream-5-0-260128` | 2K / 4K |

**尺寸由声明驱动**：`size` 是宽高比枚举、`imageResolution` 是 K 档位，两者组合后由请求模板换算成精确 `WxH` 下发，模型配置面板无需手工填写像素。

完整接口见 [docs/interface.md](docs/interface.md)。
