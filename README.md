# AI 网页助手 — Edge 浏览器扩展

一个调用 AI API 的 Edge 浏览器扩展，支持**代码解释**、**文本翻译**、**高亮标记**，所有操作均可直接在网页上完成。

## 功能

| 功能 | 操作方法 |
|------|----------|
| **AI 解释代码** | 选中代码 → 浮动按钮"解释" |
| **AI 翻译** | 选中文本 → 浮动按钮"翻译" |
| **高亮标记** | 选中文本 → "高亮"按钮 → 黄色持久标记 |
| **右键菜单** | 选中文本 → 右键 → AI 解释 / AI 翻译 |
| **自由对话** | 工具栏点击图标 → 侧边栏对话 |
| **流式响应** | AI 回复实时流式输出 |
| **代码渲染** | Markdown 渲染 + 语法高亮 + 一键复制 |

## 安装

### 方式一：Edge 外接程序商店
> 即将上架

### 方式二：手动加载
1. 克隆或下载本仓库
2. 打开 Edge，进入 `edge://extensions`
3. 开启左下角"开发人员模式"
4. 点击"加载解压缩的扩展"
5. 选择项目文件夹

## 配置 API Key

1. 安装后点击工具栏扩展图标
2. 点击侧边栏右上角"设置"按钮
3. 输入：
   - **API Key**: 你的 API Key (`sk-...`)
   - **API Base URL**: `https://api.deepseek.com/anthropic`
   - **Model**: `deepseek-v4-pro[1m]`
4. 点击"保存"

支持 DeepSeek API 及所有兼容 Anthropic Messages 协议的 API。

## 项目结构

```
edge-ai-assistant/
├── manifest.json                 # MV3 扩展配置
├── background/
│   └── service-worker.js         # 右键菜单 + 消息路由
├── content/
│   ├── content.js                # 文本选中监听 + 浮动按钮 + 高亮持久化
│   └── content.css               # 浮动按钮与高亮样式
├── sidepanel/
│   ├── sidepanel.html            # 侧边栏 UI
│   ├── sidepanel.js              # AI 对话 + SSE 流式 + Markdown 渲染
│   └── sidepanel.css             # 侧边栏样式（暗色主题）
├── icons/
│   └── icon-128.png              # 扩展图标
├── .gitignore
└── README.md
```

## 技术栈

- **Manifest V3** — Chrome / Edge 扩展标准
- **DeepSeek API** — Anthropic Messages 兼容协议
- **SSE Streaming** — 实时流式响应
- **Chrome Storage API** — 高亮与设置持久化

## 许可

MIT License
