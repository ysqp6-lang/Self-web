# Kysoul 个人网站

杨添富（Kysoul）的公开个人网站：**https://kysoul.me**

原生 HTML + CSS + 一点点 JavaScript 的静态多页站点，没有构建步骤，没有运行时依赖，
正式托管目标是 GitHub Pages（分支根目录发布，`CNAME` 为 `kysoul.me`）。

---

## 本地预览

站点是纯静态的，任何静态文件服务器都能跑。仓库里推荐用 Python 自带的：

```bash
cd kysoul-web
python3 -m http.server 4173 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:4173/index.html>。

只监听 `127.0.0.1`（回环），不对外暴露端口。需要换端口就改命令里的 `4173`。

## 页面

| 路径 | 内容 |
|---|---|
| `/index.html` | 首页：品牌、一句介绍、自摄全景、精选作品、关于、联系方式 |
| `/about.html` | 我是谁、关注什么、这个网站怎么做的 |
| `/resume.html` | 教育经历、项目经历、技能；附图片版与打印入口 |
| `/resume-print.html` | 打印 / 导出 PDF 用的干净版本（`noindex`） |
| `/work.html` | 作品：kysoul.me 系统、Godot 起步项目 |
| `/work/eclipse.html` | 两个原创特效的可选交互演示（日食加载动画、涡流着色器） |
| `/contact.html` | 联系方式与联系用途 |
| `/404.html` | 自定义 404 |

旧地址 `/about.html`、`/resume.html`、`/work.html`、`/contact.html` 保持原样可访问。

## 目录

```
css/            tokens.css（设计变量）· base.css（重置/站头尾）· home.css · page.css · showcase.css
js/             showcase.js（只有特效演示页用）
fonts/          Blanquotey.woff（自托管，仅用于品牌字与演示画面）
assets/photos/  响应式派生图（AVIF/WebP/JPEG，960/1600/2400 三档）+ OG 封面
assets/resume/  简历图片派生图（900/1200/1400 三档）
assets/favicon/ 图标与 site.webmanifest
tools/          build-images.py：从站外原图生成上面的派生图
```

## 图片派生

原始素材（91.6 MB 的全景原图、5.3 MB 的简历原图）**不在仓库工作树里**，也不在发布产物里。
它们保存在仓库之外的 `../_materials/originals/`，同时永久保留在基线提交 `5cee5de` 中。

重新生成站点用的图片：

```bash
python3 -c "import PIL; print(PIL.__version__)"   # 需要 Pillow >= 11.3（AVIF 写入）
python3 tools/build-images.py                     # 写入 assets/photos 与 assets/resume
python3 tools/build-images.py --report            # 只打印尺寸清单，不写文件
```

素材目录可用环境变量覆盖：`KYSOUL_MATERIALS=/path/to/originals python3 tools/build-images.py`。

## 设计原则（给未来的自己）

- **内容先行**：品牌、介绍、导航必须直接存在于 HTML，不依赖脚本或 WebGL 才可见。
- **特效可选**：日食与涡流只在 `/work/eclipse.html` 里由点击触发，不进首屏、不阻塞阅读。
- **图片按需**：所有照片走 `<picture>` + `srcset` + 明确的 `width/height`，非首屏一律 `loading="lazy"`。
- **系统字体优先**：正文用系统字体栈，只有品牌字自托管。
- **可访问性下限**：导航字号 ≥16px、点击区 ≥44px、键盘焦点可见、对比度 ≥4.5:1、尊重 `prefers-reduced-motion`。
- **不引入框架**：改视觉用原生 CSS；将来要加 Blog/Gallery 再评估迁移（见 `../docs/02-设计与技术说明.md`）。

## 发布

正式发布走 GitHub Pages 的现有流程，**本分支不推送到远端、不触发部署**。
发布步骤、构建产物核对与回滚方式见 `../docs/04-部署与回滚.md`。
