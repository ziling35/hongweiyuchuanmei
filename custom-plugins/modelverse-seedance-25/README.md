# ModelVerse Doubao Seedance 2.5

ModelVerse 平台 `doubao-seedance-2-5-260628` 的声明式协议插件源码。后端直接按清单执行请求映射，不依赖系统内置 `host:` 适配器，也不执行包内代码。

- 平台：`https://api.modelverse.cn`
- 模型：`doubao-seedance-2-5-260628`
- 异步三段式：`POST /v1/tasks/submit` 提交 → `GET /v1/tasks/status` 轮询 → `GET /v1/tasks/cancel` 退出
- 能力：`video`；可同时带文本、首帧/尾帧图、参考图、参考视频、参考音频

完整接口见 [docs/interface.md](docs/interface.md)。

## 在影策里导入

1. 后台 → 插件管理 → 上传 `modelverse-seedance-25.yingce-plugin`（ZIP 包，内含根目录 `manifest.json`）。
2. 后台 → 渠道管理 → 新建渠道，选择该插件作为渠道接口，填入 ModelVerse 的 API Key。
3. 在渠道下添加模型：**上游模型名必须填 `doubao-seedance-2-5-260628`**，能力选视频，按需配置时长（4-30 秒）、分辨率（480p/720p/1080p）和画幅（16:9、9:16、1:1、4:3、3:4、21:9、adaptive）。
4. 把渠道标记为系统渠道，前台即可选择该视频模型。

## 本地构建

```bash
node plugin-packages/embed-documentation.mjs modelverse-seedance-25
bash plugin-packages/build-packages.sh            # Linux/macOS
powershell -File plugin-packages/package-selected.ps1 modelverse-seedance-25   # Windows
```
