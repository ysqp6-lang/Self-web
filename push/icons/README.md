# 图标说明

**设计**：琥珀底（`#b4521f`）+ 纸白（`#f7f4ee`）。K 的竖笔＝鲸身，右侧两笔合并为一片鲸尾，
中间 V 形凹口分出两瓣——既是 Kysoul 的 K，也是鲸尾。主体收在 80% 安全区内，兼容自适应遮罩。

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icon-512.png` / `icon-192.png` | 512 / 192 | manifest（主屏 App、通知落款图标） |
| `apple-touch-icon-180.png` | 180 | iOS 主屏图标（`apple-touch-icon`） |
| `favicon-32.png` | 32 | 浏览器标签页 |
| `icon.svg` | 矢量源 | 改色/改形从它改，再按需导出 |

**再生成**（任选其一）：

- 直接用 `icon.svg` 导出目标尺寸（满幅、无圆角、无透明）。
- 或用无头 Chrome 栅格化后缩放：
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new --disable-gpu --window-size=1024,1024 \
    --screenshot=icon-1024.png file:///…/render.html   # 页面里放 <img src="icon.svg" width=1024 height=1024>
  sips -Z 512 icon-1024.png --out icon-512.png
  sips -Z 192 icon-1024.png --out icon-192.png
  sips -Z 180 icon-1024.png --out apple-touch-icon-180.png
  sips -Z 32  icon-1024.png --out favicon-32.png
  ```

> iOS 会缓存「添加到主屏幕」那一刻的图标，**换图标后必须删掉主屏 App 再加回来**才生效
> （顺带会退订，需要重新输入访问码）。
