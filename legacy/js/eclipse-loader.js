/* ============================================================
   eclipse-loader.js · kysoul.me 全屏日食加载动画
   - 网站打开时全屏日食随真实资源加载进度推进
   - 三个关键资源：three.js / 网站字体 / 背景图
   - 加载完成 = 恰好进入日全食，保留 1 秒后光圈炸开扩散，进入网站
   - 最短展示 2.5s + 超时兜底 120s（防止卡住）
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 创建遮罩层（放在页面最前，盖住网站内容） ---------- */
  const ov = document.createElement("div");
  ov.id = "eclipseLoader";
  ov.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#ffffff;" +
    "transition:opacity 1.2s ease;opacity:1;";
  const bgEl = document.createElement("canvas");
  bgEl.id = "elBg";
  bgEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  const cvEl = document.createElement("canvas");
  cvEl.id = "elCv";
  cvEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
  ov.appendChild(bgEl);
  ov.appendChild(cvEl);
  document.body.insertBefore(ov, document.body.firstChild);

  const cv = cvEl.getContext("2d");
  const bgCtx = bgEl.getContext("2d");
  let W, H, CX, CY, R, RM;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    for (const [el, cx2] of [[bgEl, bgCtx], [cvEl, cv]]) {
      el.style.width = W + "px";
      el.style.height = H + "px";
      el.width = Math.round(W * dpr);
      el.height = Math.round(H * dpr);
      cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    R = 6;
    RM = R * 1.06;
    CX = W / 2; CY = H / 2;
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---------- 日食几何：随机进入方向，匀速 + 全食中心停留 ---------- */
  const ENTER_ANGLE = (Math.random() * 2 - 1) * Math.PI / 4;
  const DIR = { x: Math.cos(ENTER_ANGLE), y: -Math.sin(ENTER_ANGLE) };
  const LOOP_SEC = 44;
  const HOLD_P = 1 / LOOP_SEC;
  function moonOffsetX(p) {
    const c = 0.5, half = HOLD_P / 2;
    if (p >= c - half && p <= c + half) return 0;
    if (p < c - half) return 6 * (1 - p / (c - half));
    return -6 * (p - (c + half)) / (1 - (c + half));
  }
  function smoothstep(a, b, x) {
    let t = b === undefined ? a : (x - a) / (b - a);
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  function phaseInfo(x, p) {
    const d = Math.abs(x);
    const s = d - (RM - R) / R;
    const c = (R + RM - d * R) / (2 * R);
    if (d >= (R + RM) / R) return { name: "初亏前", dark: 0 };
    if (s <= 0) return { name: "食甚 · 日全食", dark: 1 };
    if (s <= 0.05) return { name: "食既/生光", dark: 0.96 };
    if (s <= 0.13) return { name: "月牙将尽", dark: 0.9 };
    return { name: "偏食 · 食分 " + c.toFixed(3), dark: Math.min(1, Math.pow(c, 1.6)) };
  }

  /* ---------- 日冕光晕 ---------- */
  const blobs = [];
  for (let i = 0; i < 26; i++) {
    blobs.push({
      a: Math.random() * Math.PI * 2,
      r: 1.08 + Math.random() * 0.8,
      sz: 0.5 + Math.random() * 0.4,
      av: (Math.random() - 0.5) * 0.035,
      rv: (Math.random() - 0.5) * 0.03,
      bp: Math.random() * Math.PI * 2,
      bs: 0.3 + Math.random() * 0.7,
      al: 0.05 + Math.random() * 0.045,
      blue: Math.random() < 0.25,
    });
  }
  const grain = document.createElement("canvas");
  grain.width = grain.height = 160;
  const gctx = grain.getContext("2d");
  const gimg = gctx.createImageData(160, 160);
  for (let i = 0; i < gimg.data.length; i += 4) {
    const v = Math.random() * 255;
    gimg.data[i] = gimg.data[i + 1] = gimg.data[i + 2] = v;
    gimg.data[i + 3] = 22;
  }
  gctx.putImageData(gimg, 0, 0);

  /* ---------- 天色 ---------- */
  const SKY_STOPS = [
    [0.00, [122, 150, 190]],
    [0.28, [90, 100, 150]],
    [0.58, [34, 38, 80]],
    [0.85, [4, 5, 13]],
  ];
  function skyRGB(dark) {
    for (let i = 1; i < SKY_STOPS.length; i++) {
      if (dark <= SKY_STOPS[i][0]) {
        const [d0, c0] = SKY_STOPS[i - 1], [d1, c1] = SKY_STOPS[i];
        const t = (dark - d0) / (d1 - d0);
        return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      }
    }
    return SKY_STOPS[SKY_STOPS.length - 1][1];
  }
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  function drawSky(dark) {
    const g = bgCtx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(skyRGB(dark)));
    g.addColorStop(1, rgb(skyRGB(Math.min(1, dark * 0.92 + 0.06))));
    bgCtx.fillStyle = g;
    bgCtx.fillRect(0, 0, W, H);
    bgCtx.fillStyle = `rgba(4,6,18,${0.5 * dark * dark})`;
    bgCtx.fillRect(0, 0, W, H);
    const v = bgCtx.createRadialGradient(CX, CY, Math.min(W, H) * 0.25, CX, CY, Math.max(W, H) * 0.7);
    v.addColorStop(0, "rgba(0,0,10,0)");
    v.addColorStop(1, `rgba(0,0,12,${0.15 + 0.18 * dark})`);
    bgCtx.fillStyle = v;
    bgCtx.fillRect(0, 0, W, H);
  }

  function drawCorona(dark, t) {
    if (dark < 0.5) return;
    const a = Math.pow(Math.max(0, (dark - 0.5) / 0.5), 1.3);
    const breathe = 1 + 0.02 * Math.sin(t * 0.4);
    cv.save();
    cv.globalAlpha = a;
    let g = cv.createRadialGradient(CX, CY, RM * 0.9, CX, CY, RM * 1.5);
    g.addColorStop(0, "rgba(255,253,246,0.95)");
    g.addColorStop(0.55, "rgba(255,251,240,0.40)");
    g.addColorStop(1, "rgba(255,250,238,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, RM * 1.5, 0, 7); cv.fill();
    const env = cv.createRadialGradient(CX, CY, RM * 0.98, CX, CY, R * 2.6);
    env.addColorStop(0, `rgba(255,252,244,${0.17 * a})`);
    env.addColorStop(0.55, `rgba(240,246,255,${0.065 * a})`);
    env.addColorStop(1, "rgba(230,240,255,0)");
    cv.fillStyle = env;
    cv.beginPath(); cv.arc(CX, CY, R * 2.6, 0, 7); cv.fill();
    g = cv.createRadialGradient(CX, CY, RM * 0.9, CX, CY, R * 2.2);
    g.addColorStop(0, `rgba(255,252,244,${0.14 * a})`);
    g.addColorStop(0.5, `rgba(244,248,255,${0.05 * a})`);
    g.addColorStop(1, "rgba(235,242,255,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, R * 2.2, 0, 7); cv.fill();
    g = cv.createRadialGradient(CX, CY, RM * 1.2, CX, CY, R * 2.8);
    g.addColorStop(0, `rgba(250,250,246,${0.06 * a})`);
    g.addColorStop(1, "rgba(230,240,255,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, R * 2.8, 0, 7); cv.fill();
    for (const b of blobs) {
      const ang = b.a + t * b.av;
      const drift = b.r + Math.sin(t * b.bs + b.bp) * 0.08 + t * b.rv;
      const fe = 1 - smoothstep(1.15, 2.3, drift);
      if (fe <= 0.02) continue;
      const rr = drift * R * breathe;
      const sz = b.sz * (1 + 0.12 * Math.sin(t * b.bs * 1.3 + b.bp)) * R * breathe;
      const px = CX + Math.cos(ang) * rr;
      const py = CY + Math.sin(ang) * rr;
      const fl = 0.8 + 0.2 * Math.sin(t * b.bs * 0.8 + b.bp);
      const g2 = cv.createRadialGradient(px, py, 0, px, py, sz);
      if (b.blue) {
        g2.addColorStop(0, `rgba(226,234,255,${b.al * fl * fe})`);
        g2.addColorStop(0.6, `rgba(190,208,255,${b.al * fl * fe * 0.45})`);
      } else {
        g2.addColorStop(0, `rgba(255,252,244,${b.al * fl * fe})`);
        g2.addColorStop(0.6, `rgba(240,244,255,${b.al * fl * fe * 0.40})`);
      }
      g2.addColorStop(1, "rgba(255,255,255,0)");
      cv.fillStyle = g2;
      cv.beginPath(); cv.arc(px, py, sz, 0, 7); cv.fill();
    }
    g = cv.createRadialGradient(CX, CY, RM * 0.95, CX, CY, RM * 1.55);
    g.addColorStop(0, `rgba(255,254,248,${0.28 * a})`);
    g.addColorStop(1, "rgba(255,252,244,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, RM * 1.55, 0, 7); cv.fill();
    g = cv.createRadialGradient(CX, CY, R * 1.2, CX, CY, R * 3.2);
    g.addColorStop(0, `rgba(240,246,255,${0.05 * a})`);
    g.addColorStop(1, "rgba(230,240,255,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, R * 3.2, 0, 7); cv.fill();
    cv.restore();
  }

  function drawSun() {
    let g = cv.createRadialGradient(CX, CY, R * 0.85, CX, CY, R * 2.1);
    g.addColorStop(0, "rgba(255,244,210,0.40)");
    g.addColorStop(0.4, "rgba(255,224,160,0.14)");
    g.addColorStop(1, "rgba(255,215,150,0)");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, R * 2.1, 0, 7); cv.fill();
    g = cv.createRadialGradient(CX - R * 0.25, CY - R * 0.25, R * 0.1, CX, CY, R);
    g.addColorStop(0, "#fffef6");
    g.addColorStop(0.35, "#fffbe6");
    g.addColorStop(0.72, "#fdf1ca");
    g.addColorStop(1, "#f8dc96");
    cv.fillStyle = g;
    cv.beginPath(); cv.arc(CX, CY, R, 0, 7); cv.fill();
  }

  function drawMoon(mx, my) {
    cv.save();
    cv.beginPath();
    cv.arc(mx, my, RM, 0, 7);
    cv.clip();
    const g = cv.createRadialGradient(mx - RM * 0.3, my - RM * 0.3, RM * 0.1, mx, my, RM);
    g.addColorStop(0, "#10141f");
    g.addColorStop(0.6, "#090b13");
    g.addColorStop(1, "#04050a");
    cv.fillStyle = g;
    cv.fillRect(mx - RM, my - RM, RM * 2, RM * 2);
    cv.globalCompositeOperation = "overlay";
    cv.globalAlpha = 0.4;
    const pat = cv.createPattern(grain, "repeat");
    if (pat) {
      cv.fillStyle = pat;
      cv.fillRect(mx - RM, my - RM, RM * 2, RM * 2);
    }
    cv.restore();
    cv.save();
    const rim = cv.createRadialGradient(mx, my, RM * 0.1, mx, my, RM);
    rim.addColorStop(0, "rgba(2,3,8,0)");
    rim.addColorStop(0.78, "rgba(2,3,8,0.30)");
    rim.addColorStop(0.97, "rgba(160,180,235,0.08)");
    rim.addColorStop(1, "rgba(170,190,240,0.06)");
    cv.fillStyle = rim;
    cv.beginPath(); cv.arc(mx, my, RM, 0, 7); cv.fill();
    cv.restore();
  }

  let moonMx = CX, moonMy = CY;

  /* ============================================================
     加载进度：three.js（0.5）/ 字体（0.25）/ 背景图（0.25）
     p = progress × 0.5 —— 加载完成(1.0) 恰好进入日全食(p=0.5)
     ============================================================ */
  let res = { three: false, fonts: false, img: false };
  // 站点场景就绪信号:script.js 在 animateScene() 启动后派发 "site-ready"
  let siteReady = false;
  document.addEventListener("site-ready", () => { siteReady = true; }, { once: true });
  // three.js：轮询检测（three 的 script 在本脚本之后同步加载）
  const t3 = setInterval(() => {
    if (typeof THREE !== "undefined") { res.three = true; clearInterval(t3); }
  }, 100);
  // 字体
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { res.fonts = true; }).catch(() => { res.fonts = true; });
  } else {
    res.fonts = true;
  }
  // 背景图探测（与 script.js 同一张图：这里用的是 211 KB 派生图）
  // 探测与站内 bgImage 同 URL，浏览器会合并为同一请求；
  // 探测完成 ≈ bgImage 加载完 ≈ 场景即将初始化
  const probe = new Image();
  probe.onload = probe.onerror = () => { res.img = true; };
  probe.src = "photo/background/fujim.jpg";
  // 超时兜底：120 秒后强制完成（防止异常卡死；正常完成由 onload 驱动，
  // 404/断网由 onerror 兜底。91MB 原图在慢网下需要更久，勿设太短）
  setTimeout(() => {
    res.three = res.fonts = res.img = true;
    siteReady = true;
  }, 120000);

  let progress = 0;          // 当前进度（平滑）
  let p = 0;                 // 日食进度（目标 = progress×0.5）
  let done = false, holdStart = 0, burst = false, burstStart = 0, startT = performance.now();
  let lastT = performance.now();
  const BURST_MS = 1150; // 光爆时长

  /* 结束动画 v3:细亮白圈"炸开"(更震撼)
     - 起爆瞬间中心闪光;细亮环(强光晕)以 easeOutQuart 飞速扩散
     - 环内实时挖空漏出网页;暗空背景单独渐隐(保留渐隐,但不淡化光圈)
     - 光圈一路扩到飞出屏幕外(完全看不见)才移除遮罩 */
  function frameBurst(now) {
    const t = Math.min(1, (now - burstStart) / BURST_MS);
    // 暗空渐隐:只淡背景画布,光圈保持明亮
    bgEl.style.opacity = String(1 - Math.pow(t, 1.5));
    if (t >= 1) {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      return;
    }

    const corner = Math.hypot(W / 2, H / 2); // 屏幕最远角到中心的距离
    const rStart = R * 2.8;                  // 从日冕光晕边缘起爆
    const rEnd = corner * 1.12 + 40;         // 终点在屏幕外:光圈完全看不见
    const e = 1 - Math.pow(1 - t, 4);        // easeOutQuart: 起爆更快更炸
    const r = rStart + (rEnd - rStart) * e;

    // 1) 环内挖空:网页从光圈中间直接漏出(只挖洞,不填白)
    for (const [el, cx2] of [[bgEl, bgCtx], [cvEl, cv]]) {
      cx2.save();
      cx2.globalCompositeOperation = "destination-out";
      cx2.fillStyle = "#000";
      cx2.beginPath(); cx2.arc(CX, CY, r, 0, 7); cx2.fill();
      cx2.restore();
    }

    // 2) 起爆闪光:前 22% 时间中心闪亮一下(短促,不是白坨)
    if (t < 0.22) {
      const fa = (1 - t / 0.22) * 0.85;
      const fr = r * 0.55;
      const fg = cv.createRadialGradient(CX, CY, 0, CX, CY, fr);
      fg.addColorStop(0, `rgba(255,255,255,${fa})`);
      fg.addColorStop(0.6, `rgba(255,250,236,${fa * 0.5})`);
      fg.addColorStop(1, "rgba(255,248,230,0)");
      cv.fillStyle = fg;
      cv.beginPath(); cv.arc(CX, CY, fr, 0, 7); cv.fill();
    }

    // 3) 细白色光圈:淡柔光底 + 强发光细环(无内部填充)
    cv.save();
    cv.lineCap = "round";
    cv.strokeStyle = "rgba(255,246,220,0.18)";
    cv.lineWidth = Math.max(2, r * 0.018);
    cv.beginPath(); cv.arc(CX, CY, r, 0, 7); cv.stroke();
    cv.shadowColor = "rgba(255,253,244,0.95)";
    cv.shadowBlur = Math.max(12, r * 0.04);
    cv.strokeStyle = "rgba(255,255,255,0.98)";
    cv.lineWidth = Math.max(1.5, r * 0.004);
    cv.beginPath(); cv.arc(CX, CY, r, 0, 7); cv.stroke();
    cv.restore();

    requestAnimationFrame(frameBurst);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    const tSec = (now - startT) / 1000;

    // 资源进度（均分）
    let resP = ((res.three ? 1 : 0) + (res.fonts ? 1 : 0) + (res.img ? 1 : 0)) / 3;
    // 最短展示 2.5s：避免缓存秒开时动画一闪而过
    const minP = Math.min(1, tSec / 2.5);
    const target = Math.min(resP, minP);
    progress += (target - progress) * Math.min(1, dt * 1.2);
    // 日食进度 = 加载进度的一半 → 加载完成 = 全食
    const pTarget = progress * 0.5;
    p += (pTarget - p) * Math.min(1, dt * 2.5);
    if (Math.abs(pTarget - p) < 0.0002) p = pTarget;

    // 完成判定：资源全好、场景已就绪且进度到位 → 全食保留 1 秒后光爆扩散
    if (!done && resP >= 0.999 && progress >= 0.995 && siteReady) {
      done = true;
      holdStart = now;
    }
    if (done && !burst && now - holdStart > 1000) {
      burst = true;
      burstStart = now;
      ov.style.backgroundColor = "transparent"; // 环内挖空后露出的是网页而非白底
      requestAnimationFrame(frameBurst);
      return;
    }

    const x = moonOffsetX(p);
    const info = phaseInfo(x, p);
    const dark = info.dark;
    moonMx = CX + DIR.x * x * R;
    moonMy = CY + DIR.y * x * R;

    drawSky(dark);
    cv.clearRect(CX - 100, CY - 100, 200, 200);
    drawCorona(dark, tSec);
    drawSun();
    cv.save();
    cv.globalCompositeOperation = "destination-out";
    cv.fillStyle = "#000";
    cv.beginPath();
    cv.arc(moonMx, moonMy, RM, 0, 7);
    cv.fill();
    cv.restore();
    const moonAlpha = smoothstep(0.72, 0.9, dark);
    if (moonAlpha > 0.01) {
      cv.save();
      cv.globalAlpha = moonAlpha;
      drawMoon(moonMx, moonMy);
      cv.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
