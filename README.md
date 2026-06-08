# Prompt Manager

一个零依赖的前端应用，用来读取和管理 ComfyUI、SD WebUI 生成图片及其 Prompt / TAG / 参数。

## 功能

- 浏览 AI 图库
- 点击图片后以独立悬浮页查看详情，左侧图片，右侧元数据
- 读取 ComfyUI 图片中的 `prompt` / `workflow`
- 读取 SD WebUI 图片中的 `parameters`
- 自动提取正向 / 反向 Prompt、模型、尺寸、Sampler、Seed、Steps、CFG
- 根据 Prompt 自动生成 TAG
- 支持批量导入本地图片
- 支持本地图片上传或图片 URL
- 支持搜索、标签筛选、收藏、排序
- 支持 JSON 导入 / 导出
- 图片与元数据保存在浏览器 `IndexedDB`
- 应用首次打开默认空图库，不再内置演示占位图片

## 当前支持

- PNG: 已实现 ComfyUI 和 SD WebUI 元数据读取
- JPEG / WebP: 已加入 SD WebUI EXIF 读取的基础支持，取决于图片是否真的写入了 EXIF 参数

## 运行

可以直接双击打开 [index.html](./index.html)，也可以在当前目录启动一个静态服务器。

例如：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173`。
