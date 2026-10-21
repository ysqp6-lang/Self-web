# 图标说明

主屏与通知图标使用 **Kyshit「没名字」方形画稿**（原作者艺术稿，勿改比例）：

| 文件 | 尺寸 | 用途 | 来源 |
|---|---|---|---|
| `icon.svg` | 2800×2800 画幅 → 1024 方图 | 矢量母版（改色/改形从它改） | `~/Desktop/Kyshit/没名字/没名字_方形.svg` 原样副本 |
| `icon-512.png` / `icon-192.png` | 512 / 192 | manifest（主屏 App、通知落款图标） | 由母版按原比例缩放 |
| `apple-touch-icon-180.png` | 180 | iOS 主屏图标 | 同上 |
| `favicon-32.png` | 32 | 浏览器标签页 | 同上 |

**特性**：满幅 1024×1024、完全不透明（无 alpha）、无自带圆角，交给 iOS 自己切圆角遮罩。
画稿内容占宽度 92%，故 manifest 里声明 `purpose: any`（不用 maskable，避免 Android 裁掉胡须）。

**再生成**：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --allow-file-access-from-files \
  --window-size=1024,1024 --screenshot=icon-1024.png file:///…/render.html
sips -Z 512 icon-1024.png --out icon-512.png
sips -Z 192 icon-1024.png --out icon-192.png
sips -Z 180 icon-1024.png --out apple-touch-icon-180.png
sips -Z 32  icon-1024.png --out favicon-32.png
```

> iOS 缓存「添加到主屏幕」那一刻的图标：**换图标后必须删掉主屏 App 再加回来**才生效（会顺带退订，需重新输入访问码）。
