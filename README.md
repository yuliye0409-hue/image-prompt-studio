# Image Prompt Studio

独立保存版 Chrome / Edge Manifest V3 扩展，用于把网页图片或本地图片转换成中文和英文两套专业文生图 Prompt。

## 功能

- 右键网页图片生成 Prompt。
- 弹窗或侧边栏上传、拖拽、粘贴图片，最多支持 6 张。
- 本地上传图片会自动压缩到适合视觉分析的尺寸，减少 API 请求体积和 524 超时概率。
- 每张预览图都可以单独移除。
- 支持 OpenAI 兼容 Responses API 和 Google Gemini。
- 支持进度条、取消任务、错误建议、重试和固定侧边栏。
- 新任务开始、取消或失败时会清空旧生成结果，避免把上一次结果误认为本次输出。
- 可在三套逻辑之间切换：通用图生文 Prompt、产品外观分析 Prompt、本地化营销排版 Prompt。

## 三套逻辑

- 通用图生文 Prompt：综合主体、构图、背景、灯光、视觉风格和纯净留白预留区，只预留后期排版空间，不生成文案、字体、按钮、Logo、占位文字或排版元素。
- 产品外观分析 Prompt：约 80 字内精炼提取外观、形态、材质、纹理和结构细节。
- 本地化营销排版 Prompt：按目标市场重写每张图中的可见文案，包括小字；主视觉文案强制“大标题 + 内容”两行结构，大标题 ALL CAPS 且不超过 25 个字符，内容 Title Case 且严格 35 - 40 个字符；多图时先建立统一排版系统。

## 加载方式

1. 打开 `chrome://extensions/` 或 `edge://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择这个新目录：`C:\Users\19708\Documents\ImagePromptStudio_Standalone_20260723`。
5. 打开扩展设置页，填写 API Key 后保存。

## 默认接口

- 默认服务商：OpenAI 兼容接口
- 默认 Base URL：`https://ai.gs88.shop`
- 默认模型：`gpt-5.5`
- 请求已设置 `store: false`

API Key 只保存在 Chrome 本地扩展存储中。不要把 API Key 写进源码、截图或发送给其他人。
