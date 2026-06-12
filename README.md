# Prompt Manager

一个零依赖的前端应用，用来读取和管理 ComfyUI、SD WebUI、NovelAI、OpenAI / GPT Image 生成图片及其 Prompt / TAG / 参数。

## 功能

- 浏览 AI 图库
- 点击图片后以独立悬浮页查看详情，左侧图片，右侧元数据
- 读取 ComfyUI 图片中的 `prompt` / `workflow`
- 读取 SD WebUI 图片中的 `parameters`
- 读取 NovelAI 图片中的 `Description` / `Comment`
- 识别 OpenAI / GPT Image 图片中的 C2PA/provenance 来源标记
- 自动提取正向 / 反向 Prompt、模型、尺寸、Sampler、Seed、Steps、CFG
- 根据 Prompt 自动生成 TAG
- 支持批量导入本地图片
- 支持添加本地文件夹作为图库根目录，默认平铺显示所有图片
- 支持按文件夹筛选，搜索会命中文件名、相对路径和文件夹路径
- 支持将图片或文件夹直接拖放到应用页面导入
- 本地目录图库按 `rootId + relativePath` 更新同一路径条目，不同文件夹里的相同内容会分别显示
- 普通文件导入在没有目录路径时按文件指纹合并，避免重复卡片
- 支持本地图片上传或图片 URL
- 支持搜索、标签筛选、收藏、排序
- 支持 JSON 导入 / 导出
- 目录图库只缓存元数据和缩略图；旧导入、远程 URL、无持久句柄的拖放图片会继续保存在浏览器 `IndexedDB`
- 应用首次打开默认空图库，不再内置演示占位图片

## 当前支持

- PNG: 已实现 ComfyUI、SD WebUI 和 NovelAI 元数据读取，NovelAI 支持常规 PNG 文本块与 alpha 通道 stealth metadata 兜底
- JPEG / WebP: 已加入 SD WebUI EXIF 和 OpenAI provenance 标记识别的基础支持，取决于图片是否真的写入了相关元数据

## 运行

可以直接双击打开 [index.html](./index.html)，也可以在当前目录启动一个静态服务器。

本地文件夹授权和拖放文件夹依赖 Chrome / Edge 的 File System Access API。推荐用本地静态服务器打开，这样目录句柄可以保存在 IndexedDB 里，后续点击“同步图库”即可重新扫描。浏览器不会向网页暴露 `E:\...` 这类真实绝对路径，应用内部用“图库根目录 id + 相对路径”表示文件位置。

例如：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 代码结构

- `index.html`: 页面结构与脚本加载顺序
- `styles.css`: 全局视觉与布局样式
- `src/metadata.js`: 图片元数据统一入口与图库条目创建
- `src/metadata-core.js`: 元数据解析共享工具
- `src/metadata-png.js`: PNG 文本块读取
- `src/metadata-comfyui.js`: ComfyUI `prompt` / `workflow` 解析
- `src/metadata-sd-webui.js`: SD WebUI `parameters` 解析
- `src/metadata-novelai.js`: NovelAI 常规 PNG 文本块与 alpha 通道 stealth metadata 解析
- `src/metadata-openai.js`: OpenAI / GPT Image C2PA/provenance 来源标记识别
- `src/metadata-exif.js`: JPEG / WebP EXIF 解析
- `src/`: 应用源码，按配置、状态、数据库、元数据解析、渲染和控制器拆分
