/* ============================================================
   showcase.js —— 作品交互演示（work/eclipse.html）
   两个原创效果的"按需运行"版本：

   1) 涡流像素化着色器：改为原生 WebGL 实现，不再依赖 Three.js CDN；
      仅仅在指针移动时按需渲染，静止后停帧，DPR 上限 2。
   2) 全屏日食：从首页启动流程里剥离出来，只有点击按钮才播放；
      默认不进首屏、不阻塞任何内容，尊重「减少动态效果」。

   全部逻辑集中在这一个文件里，页面在没有脚本时仍然完整可读。
   ============================================================ */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* ============================================================
       一、涡流像素化着色器
       ============================================================ */
    var VORTEX = {
        grid: 40,                 // 像素块数量（横竖各 N 格）
        strength: 0.3,            // 鼠标拖拽时的偏移强度
        range: 0.3,               // 影响范围
        easeIdle: 0.02,
        easeActive: 0.04,
        texScale: 1.5,            // 纹理画布相对 CSS 尺寸的倍数（有像素化，不需要 2x）
        dprCap: 2
    };

    var VERTEX_SRC = [
        "attribute vec2 a_pos;",
        "varying vec2 v_vv;",
        "void main() {",
        "  v_vv = a_pos * 0.5 + 0.5;",
        "  gl_Position = vec4(a_pos, 0.0, 1.0);",
        "}"
    ].join("\n");

    function fragmentSrc() {
        return [
            "precision mediump float;",
            "varying vec2 v_vv;",
            "uniform sampler2D u_tex;",
            "uniform vec2 u_mouse;",
            "uniform vec2 u_prev;",
            "void main() {",
            "  float grid = " + VORTEX.grid.toFixed(1) + ";",
            "  vec2 gridUV = floor(v_vv * grid) / grid;",
            "  vec2 centerOfPixel = gridUV + vec2(1.0 / grid, 1.0 / grid);",
            "  vec2 mouseDirection = u_mouse - u_prev;",
            "  float dist = length(centerOfPixel - u_mouse);",
            // 用 1 - smoothstep 代替 edge0 > edge1 的写法：GLSL ES 1.0 对后者未定义
            "  float strength = 1.0 - smoothstep(0.0, " + VORTEX.range.toFixed(2) + ", dist);",
            "  vec2 uv = v_vv - strength * (-mouseDirection) * " + VORTEX.strength.toFixed(2) + ";",
            "  gl_FragColor = texture2D(u_tex, clamp(uv, 0.0, 1.0));",
            "}"
        ].join("\n");
    }

    function createShader(gl, type, src) {
        var sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            var log = gl.getShaderInfoLog(sh);
            gl.deleteShader(sh);
            throw new Error("着色器编译失败：" + log);
        }
        return sh;
    }

    function createProgram(gl, vsSrc, fsSrc) {
        var vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
        var fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error("着色器链接失败：" + gl.getProgramInfoLog(prog));
        }
        return prog;
    }

    function initVortex(opts) {
        var stage = opts.stage;
        var poster = opts.poster;
        var notice = opts.notice;
        var status = opts.status;
        var toggle = opts.toggle;

        // 底图现在包在 <picture> 里：画布要插到 picture 之前，
        // 显示/隐藏也作用于整个 picture，否则 img 被隐藏后容器还会留着位置。
        var posterWrap = poster.closest("picture") || poster;

        var canvas = document.createElement("canvas");
        canvas.className = "stage-canvas";
        canvas.setAttribute("role", "img");
        canvas.setAttribute(
            "aria-label",
            "涡流像素化着色器演示：富士山照片与 Kysoul 字样被切成像素格，指针移动时周围像素会被推开。"
        );
        canvas.hidden = true;

        var gl = canvas.getContext("webgl", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            powerPreference: "low-power"
        }) || canvas.getContext("experimental-webgl");

        if (!gl) {
            showNotice("这个浏览器或显卡驱动没有可用的 WebGL，所以只显示静态照片。演示说明在下方照旧可读。");
            status.textContent = "WebGL 不可用 —— 已回退为静态照片。";
            return null;
        }

        stage.insertBefore(canvas, posterWrap);

        var program = createProgram(gl, VERTEX_SRC, fragmentSrc());
        var aPos = gl.getAttribLocation(program, "a_pos");
        var uTex = gl.getUniformLocation(program, "u_tex");
        var uMouse = gl.getUniformLocation(program, "u_mouse");
        var uPrev = gl.getUniformLocation(program, "u_prev");

        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        var textureCanvas = document.createElement("canvas");

        var mouse = { x: 0.5, y: 0.5 };
        var target = { x: 0.5, y: 0.5 };
        var prev = { x: 0.5, y: 0.5 };
        var easeFactor = VORTEX.easeIdle;
        var raf = 0;
        var active = false;
        var running = false;
        var fontsReady = false;

        /** 把照片与 Kysoul 字样画进纹理画布（对应旧版 texture.js 的构图） */
        function paintTexture(cssWidth, cssHeight) {
            var scale = Math.min(VORTEX.texScale, VORTEX.dprCap);
            var w = Math.max(1, Math.round(cssWidth * scale));
            var h = Math.max(1, Math.round(cssHeight * scale));
            textureCanvas.width = w;
            textureCanvas.height = h;
            var ctx = textureCanvas.getContext("2d");
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = "#fbfaf7";
            ctx.fillRect(0, 0, w, h);

            // 1) 照片：等比铺满宽度、靠底部对齐
            if (poster.complete && poster.naturalWidth > 0) {
                var imgHeight = (w / poster.naturalWidth) * poster.naturalHeight;
                ctx.drawImage(poster, 0, h - imgHeight, w, imgHeight);
            } else {
                // 图片失败时也要有可看的东西：用暖白底 + 一行说明
                ctx.fillStyle = "rgba(25,24,23,.14)";
                ctx.fillRect(0, h * 0.62, w, h * 0.38);
            }

            // 2) 文字：超大字，按画布宽度缩放（旧版是 2 倍宽，再按 99% 收进画面）
            var fontSize = Math.floor(w * 2);
            var family = fontsReady ? 'Blanquotey, "Iowan Old Style", serif' : '"Iowan Old Style", Georgia, serif';
            ctx.font = "100 " + fontSize + "px " + family;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";

            var textWidth = ctx.measureText("Kysoul").width || 1;
            var fit = Math.min(1, (w * 0.99) / textWidth);
            // 旧版让字贴到画面顶端再被裁掉一点；这里略微下移，保留"撑满宽度"的力度，
            // 但让顶部字形完整落在框内。
            ctx.setTransform(fit, 0, 0, fit, w / 2, w * 0.006);
            ctx.fillStyle = "#000000";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = fontSize * 0.005;
            for (var i = 0; i < 3; i++) ctx.strokeText("Kysoul", 0, 0);
            ctx.fillText("Kysoul", 0, 0);
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
        }

        function draw() {
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
            gl.useProgram(program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(uTex, 0);
            gl.uniform2f(uMouse, mouse.x, 1 - mouse.y);
            gl.uniform2f(uPrev, prev.x, 1 - prev.y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        /** 按需渲染：只有还在缓动时才继续跑下一帧 */
        function tick() {
            prev.x = mouse.x;
            prev.y = mouse.y;
            mouse.x += (target.x - mouse.x) * easeFactor;
            mouse.y += (target.y - mouse.y) * easeFactor;
            draw();

            var dx = Math.abs(target.x - mouse.x);
            var dy = Math.abs(target.y - mouse.y);
            var vx = Math.abs(mouse.x - prev.x);
            var vy = Math.abs(mouse.y - prev.y);
            if (dx < 1e-4 && dy < 1e-4 && vx < 1e-5 && vy < 1e-5) {
                running = false;
                raf = 0;
                return;
            }
            raf = window.requestAnimationFrame(tick);
        }

        function schedule() {
            if (running || document.hidden || !active) return;
            running = true;
            raf = window.requestAnimationFrame(tick);
        }

        function resize() {
            // clientWidth / clientHeight 不含边框，避免画布与容器差 1–2px 造成轻微发虚
            var cssW = stage.clientWidth;
            var cssH = stage.clientHeight;
            if (!cssW || !cssH) return;
            var dpr = Math.min(window.devicePixelRatio || 1, VORTEX.dprCap);
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            gl.viewport(0, 0, canvas.width, canvas.height);
            paintTexture(cssW, cssH);
            draw();
        }

        function onPointerMove(event) {
            var rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            easeFactor = VORTEX.easeActive;
            target.x = (event.clientX - rect.left) / rect.width;
            target.y = (event.clientY - rect.top) / rect.height;
            schedule();
        }

        function onPointerEnter(event) {
            var rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            mouse.x = target.x = prev.x = (event.clientX - rect.left) / rect.width;
            mouse.y = target.y = prev.y = (event.clientY - rect.top) / rect.height;
            schedule();
        }

        function onPointerLeave() {
            easeFactor = VORTEX.easeIdle;
            target.x = 0.5;
            target.y = 0.5;
            schedule();
        }

        function start() {
            if (active) return;
            active = true;
            canvas.hidden = false;
            posterWrap.hidden = true;
            hideNotice();
            canvas.addEventListener("pointermove", onPointerMove, { passive: true });
            canvas.addEventListener("pointerenter", onPointerEnter, { passive: true });
            canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
            var ro = new ResizeObserver(function () { resize(); });
            ro.observe(stage);
            stage._vortexObserver = ro;
            resize();
            easeFactor = VORTEX.easeActive;
            // 开场的轻微"落位"动效：指针效果从中心收敛一次，用来确认画面是活的
            if (!reduceMotion.matches) {
                prev.x = mouse.x = 0.36;
                prev.y = mouse.y = 0.44;
                target.x = 0.5;
                target.y = 0.5;
                schedule();
            }
            toggle.textContent = "关闭涡流";
            if (status) status.textContent = "涡流运行中 · 在画面上移动指针（或手指）即可推动像素。";
        }

        function stop() {
            if (!active) return;
            active = false;
            canvas.hidden = true;
            posterWrap.hidden = false;
            if (raf) window.cancelAnimationFrame(raf);
            raf = 0;
            running = false;
            canvas.removeEventListener("pointermove", onPointerMove);
            canvas.removeEventListener("pointerenter", onPointerEnter);
            canvas.removeEventListener("pointerleave", onPointerLeave);
            if (stage._vortexObserver) {
                stage._vortexObserver.disconnect();
                stage._vortexObserver = null;
            }
            toggle.textContent = "开启涡流";
            if (status) status.textContent = "涡流已关闭 —— 静态照片表示的就是它最终铺满的样子。";
        }

        function showNotice(text) {
            if (!notice) return;
            notice.textContent = text;
            notice.hidden = false;
        }

        function hideNotice() {
            if (notice) notice.hidden = true;
        }

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                if (raf) window.cancelAnimationFrame(raf);
                raf = 0;
                running = false;
            } else if (active) {
                schedule();
            }
        });

        canvas.addEventListener("webglcontextlost", function (event) {
            event.preventDefault();
            if (raf) window.cancelAnimationFrame(raf);
            raf = 0;
            running = false;
            toggle.disabled = true;
            status.textContent = "显卡上下文丢失，涡流演示已暂停。刷新页面可以重试。";
        });

        if (!poster.complete) {
            poster.addEventListener("load", function () { if (active) resize(); }, { once: true });
        }

        if (document.fonts && document.fonts.load) {
            document.fonts.load('100 100px "Blanquotey"').then(function () {
                fontsReady = true;
                if (active) resize();
            }).catch(function () { /* 字体失败就用衬线兜底，不影响演示 */ });
        } else {
            fontsReady = true;
        }

        return { start: start, stop: stop, toggle: stop, isActive: function () { return active; } };
    }

    /* ============================================================
       二、全屏日食演示
       数值与几何都沿用旧版实现（js/eclipse-loader.js），
       区别是：进度不再绑定真实资源加载，而是由演示时间轴驱动。
       ============================================================ */
    function playEclipse(opts) {
        if (playEclipse.running) return;
        playEclipse.running = true;

        var reduced = reduceMotion.matches;
        var onEnd = opts.onEnd;
        var statusEl = opts.status;

        var overlay = document.createElement("div");
        overlay.className = "eclipse-overlay";
        overlay.setAttribute("role", "status");
        overlay.setAttribute("aria-label", "全屏日食加载动画演示播放中");

        var bgEl = document.createElement("canvas");
        var cvEl = document.createElement("canvas");
        overlay.appendChild(bgEl);
        overlay.appendChild(cvEl);
        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";

        var bgCtx = bgEl.getContext("2d");
        var cv = cvEl.getContext("2d");
        var W = 0, H = 0, CX = 0, CY = 0, R = 6, RM = 6.36;
        var dpr = 1;

        function resize() {
            dpr = Math.min(2, window.devicePixelRatio || 1);
            W = window.innerWidth;
            H = window.innerHeight;
            // 旧版太阳半径是固定的 6px：在 1280×900 的屏幕上只有直径 12px，
            // 作为独立演示几乎看不出是日食。这里按视口短边缩放（下限仍是 6px）。
            R = Math.max(6, Math.min(W, H) * 0.03);
            var targets = [[bgEl, bgCtx], [cvEl, cv]];
            for (var i = 0; i < targets.length; i++) {
                var el = targets[i][0];
                var ctx = targets[i][1];
                el.style.width = W + "px";
                el.style.height = H + "px";
                el.width = Math.round(W * dpr);
                el.height = Math.round(H * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            RM = R * 1.06;
            CX = W / 2;
            CY = H / 2;
        }
        resize();
        window.addEventListener("resize", resize);

        var ENTER_ANGLE = (Math.random() * 2 - 1) * Math.PI / 4;
        var DIR = { x: Math.cos(ENTER_ANGLE), y: -Math.sin(ENTER_ANGLE) };
        var LOOP_SEC = 44;
        var HOLD_P = 1 / LOOP_SEC;

        function moonOffsetX(p) {
            var c = 0.5, half = HOLD_P / 2;
            if (p >= c - half && p <= c + half) return 0;
            if (p < c - half) return 6 * (1 - p / (c - half));
            return -6 * (p - (c + half)) / (1 - (c + half));
        }

        function smoothstep(a, b, x) {
            var t = (x - a) / (b - a);
            t = Math.max(0, Math.min(1, t));
            return t * t * (3 - 2 * t);
        }

        function phaseInfo(x) {
            var d = Math.abs(x);
            var s = d - (RM - R) / R;
            var c = (R + RM - d * R) / (2 * R);
            if (d >= (R + RM) / R) return { dark: 0 };
            if (s <= 0) return { dark: 1 };
            if (s <= 0.05) return { dark: 0.96 };
            if (s <= 0.13) return { dark: 0.9 };
            return { dark: Math.min(1, Math.pow(c, 1.6)) };
        }

        var blobs = [];
        for (var i = 0; i < 26; i++) {
            blobs.push({
                a: Math.random() * Math.PI * 2,
                r: 1.08 + Math.random() * 0.8,
                sz: 0.5 + Math.random() * 0.4,
                av: (Math.random() - 0.5) * 0.035,
                rv: (Math.random() - 0.5) * 0.03,
                bp: Math.random() * Math.PI * 2,
                bs: 0.3 + Math.random() * 0.7,
                al: 0.05 + Math.random() * 0.045,
                blue: Math.random() < 0.25
            });
        }

        var grain = document.createElement("canvas");
        grain.width = grain.height = 160;
        var gctx = grain.getContext("2d");
        var gimg = gctx.createImageData(160, 160);
        for (var j = 0; j < gimg.data.length; j += 4) {
            var v = Math.random() * 255;
            gimg.data[j] = gimg.data[j + 1] = gimg.data[j + 2] = v;
            gimg.data[j + 3] = 22;
        }
        gctx.putImageData(gimg, 0, 0);

        var SKY_STOPS = [
            [0.00, [122, 150, 190]],
            [0.28, [90, 100, 150]],
            [0.58, [34, 38, 80]],
            [0.85, [4, 5, 13]]
        ];

        function skyRGB(dark) {
            for (var i2 = 1; i2 < SKY_STOPS.length; i2++) {
                if (dark <= SKY_STOPS[i2][0]) {
                    var d0 = SKY_STOPS[i2 - 1], d1 = SKY_STOPS[i2];
                    var t = (dark - d0[0]) / (d1[0] - d0[0]);
                    return d0[1].map(function (val, k) {
                        return Math.round(val + (d1[1][k] - val) * t);
                    });
                }
            }
            return SKY_STOPS[SKY_STOPS.length - 1][1];
        }

        function rgb(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

        function drawSky(dark) {
            var g = bgCtx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, rgb(skyRGB(dark)));
            g.addColorStop(1, rgb(skyRGB(Math.min(1, dark * 0.92 + 0.06))));
            bgCtx.fillStyle = g;
            bgCtx.fillRect(0, 0, W, H);
            bgCtx.fillStyle = "rgba(4,6,18," + (0.5 * dark * dark) + ")";
            bgCtx.fillRect(0, 0, W, H);
            var v2 = bgCtx.createRadialGradient(CX, CY, Math.min(W, H) * 0.25, CX, CY, Math.max(W, H) * 0.7);
            v2.addColorStop(0, "rgba(0,0,10,0)");
            v2.addColorStop(1, "rgba(0,0,12," + (0.15 + 0.18 * dark) + ")");
            bgCtx.fillStyle = v2;
            bgCtx.fillRect(0, 0, W, H);
        }

        function drawCorona(dark, t) {
            if (dark < 0.5) return;
            var a = Math.pow(Math.max(0, (dark - 0.5) / 0.5), 1.3);
            var breathe = 1 + 0.02 * Math.sin(t * 0.4);
            cv.save();
            cv.globalAlpha = a;
            var g = cv.createRadialGradient(CX, CY, RM * 0.9, CX, CY, RM * 1.5);
            g.addColorStop(0, "rgba(255,253,246,0.95)");
            g.addColorStop(0.55, "rgba(255,251,240,0.40)");
            g.addColorStop(1, "rgba(255,250,238,0)");
            cv.fillStyle = g;
            cv.beginPath(); cv.arc(CX, CY, RM * 1.5, 0, 7); cv.fill();
            var env = cv.createRadialGradient(CX, CY, RM * 0.98, CX, CY, R * 2.6);
            env.addColorStop(0, "rgba(255,252,244," + (0.17 * a) + ")");
            env.addColorStop(0.55, "rgba(240,246,255," + (0.065 * a) + ")");
            env.addColorStop(1, "rgba(230,240,255,0)");
            cv.fillStyle = env;
            cv.beginPath(); cv.arc(CX, CY, R * 2.6, 0, 7); cv.fill();
            g = cv.createRadialGradient(CX, CY, RM * 0.9, CX, CY, R * 2.2);
            g.addColorStop(0, "rgba(255,252,244," + (0.14 * a) + ")");
            g.addColorStop(0.5, "rgba(244,248,255," + (0.05 * a) + ")");
            g.addColorStop(1, "rgba(235,242,255,0)");
            cv.fillStyle = g;
            cv.beginPath(); cv.arc(CX, CY, R * 2.2, 0, 7); cv.fill();
            g = cv.createRadialGradient(CX, CY, RM * 1.2, CX, CY, R * 2.8);
            g.addColorStop(0, "rgba(250,250,246," + (0.06 * a) + ")");
            g.addColorStop(1, "rgba(230,240,255,0)");
            cv.fillStyle = g;
            cv.beginPath(); cv.arc(CX, CY, R * 2.8, 0, 7); cv.fill();

            for (var bi = 0; bi < blobs.length; bi++) {
                var b = blobs[bi];
                var ang = b.a + t * b.av;
                var drift = b.r + Math.sin(t * b.bs + b.bp) * 0.08 + t * b.rv;
                var fe = 1 - smoothstep(1.15, 2.3, drift);
                if (fe <= 0.02) continue;
                var rr = drift * R * breathe;
                var sz = b.sz * (1 + 0.12 * Math.sin(t * b.bs * 1.3 + b.bp)) * R * breathe;
                var px = CX + Math.cos(ang) * rr;
                var py = CY + Math.sin(ang) * rr;
                var fl = 0.8 + 0.2 * Math.sin(t * b.bs * 0.8 + b.bp);
                var g2 = cv.createRadialGradient(px, py, 0, px, py, sz);
                if (b.blue) {
                    g2.addColorStop(0, "rgba(226,234,255," + (b.al * fl * fe) + ")");
                    g2.addColorStop(0.6, "rgba(190,208,255," + (b.al * fl * fe * 0.45) + ")");
                } else {
                    g2.addColorStop(0, "rgba(255,252,244," + (b.al * fl * fe) + ")");
                    g2.addColorStop(0.6, "rgba(240,244,255," + (b.al * fl * fe * 0.40) + ")");
                }
                g2.addColorStop(1, "rgba(255,255,255,0)");
                cv.fillStyle = g2;
                cv.beginPath(); cv.arc(px, py, sz, 0, 7); cv.fill();
            }

            g = cv.createRadialGradient(CX, CY, RM * 0.95, CX, CY, RM * 1.55);
            g.addColorStop(0, "rgba(255,254,248," + (0.28 * a) + ")");
            g.addColorStop(1, "rgba(255,252,244,0)");
            cv.fillStyle = g;
            cv.beginPath(); cv.arc(CX, CY, RM * 1.55, 0, 7); cv.fill();
            g = cv.createRadialGradient(CX, CY, R * 1.2, CX, CY, R * 3.2);
            g.addColorStop(0, "rgba(240,246,255," + (0.05 * a) + ")");
            g.addColorStop(1, "rgba(230,240,255,0)");
            cv.fillStyle = g;
            cv.beginPath(); cv.arc(CX, CY, R * 3.2, 0, 7); cv.fill();
            cv.restore();
        }

        function drawSun() {
            var g = cv.createRadialGradient(CX, CY, R * 0.85, CX, CY, R * 2.1);
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
            var g = cv.createRadialGradient(mx - RM * 0.3, my - RM * 0.3, RM * 0.1, mx, my, RM);
            g.addColorStop(0, "#10141f");
            g.addColorStop(0.6, "#090b13");
            g.addColorStop(1, "#04050a");
            cv.fillStyle = g;
            cv.fillRect(mx - RM, my - RM, RM * 2, RM * 2);
            cv.globalCompositeOperation = "overlay";
            cv.globalAlpha = 0.4;
            var pat = cv.createPattern(grain, "repeat");
            if (pat) {
                cv.fillStyle = pat;
                cv.fillRect(mx - RM, my - RM, RM * 2, RM * 2);
            }
            cv.restore();
            cv.save();
            var rim = cv.createRadialGradient(mx, my, RM * 0.1, mx, my, RM);
            rim.addColorStop(0, "rgba(2,3,8,0)");
            rim.addColorStop(0.78, "rgba(2,3,8,0.30)");
            rim.addColorStop(0.97, "rgba(160,180,235,0.08)");
            rim.addColorStop(1, "rgba(170,190,240,0.06)");
            cv.fillStyle = rim;
            cv.beginPath(); cv.arc(mx, my, RM, 0, 7); cv.fill();
            cv.restore();
        }

        // 时间轴：进度 → 日食（加载完成 = 全食）→ 停留 → 光圈炸开
        var PROGRESS_MS = reduced ? 900 : 2400;
        var HOLD_MS = reduced ? 400 : 1000;
        var BURST_MS = reduced ? 260 : 1150;
        var startT = performance.now();
        var holding = 0;
        var burstStart = 0;
        var finished = false;

        function cleanup() {
            window.removeEventListener("resize", resize);
            document.removeEventListener("keydown", onKey, true);
            overlay.removeEventListener("pointerdown", finishNow);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.body.style.overflow = "";
            playEclipse.running = false;
            if (typeof onEnd === "function") onEnd();
        }

        function finishNow() {
            if (finished) return;
            finished = true;
            cleanup();
        }

        function onKey(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                finishNow();
            }
        }
        document.addEventListener("keydown", onKey, true);
        overlay.addEventListener("pointerdown", finishNow);

        function frameBurst(now) {
            var t = Math.min(1, (now - burstStart) / BURST_MS);
            bgEl.style.opacity = String(1 - Math.pow(t, 1.5));
            if (t >= 1) { finishNow(); return; }

            var corner = Math.hypot(W / 2, H / 2);
            var rStart = R * 2.8;
            var rEnd = corner * 1.12 + 40;
            var e = 1 - Math.pow(1 - t, 4);
            var r = rStart + (rEnd - rStart) * e;

            var targets = [[bgEl, bgCtx], [cvEl, cv]];
            for (var i3 = 0; i3 < targets.length; i3++) {
                var cx2 = targets[i3][1];
                cx2.save();
                cx2.globalCompositeOperation = "destination-out";
                cx2.fillStyle = "#000";
                cx2.beginPath(); cx2.arc(CX, CY, r, 0, 7); cx2.fill();
                cx2.restore();
            }

            if (t < 0.22) {
                var fa = (1 - t / 0.22) * 0.85;
                var fr = r * 0.55;
                var fg = cv.createRadialGradient(CX, CY, 0, CX, CY, fr);
                fg.addColorStop(0, "rgba(255,255,255," + fa + ")");
                fg.addColorStop(0.6, "rgba(255,250,236," + (fa * 0.5) + ")");
                fg.addColorStop(1, "rgba(255,248,230,0)");
                cv.fillStyle = fg;
                cv.beginPath(); cv.arc(CX, CY, fr, 0, 7); cv.fill();
            }

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

            if (finished) return;
            window.requestAnimationFrame(frameBurst);
        }

        function frame(now) {
            if (finished) return;
            var elapsed = now - startT;
            var progress = Math.min(1, elapsed / PROGRESS_MS);
            var p = progress * 0.5;
            var tSec = elapsed / 1000;
            var x = moonOffsetX(p);
            var dark = phaseInfo(x).dark;
            var moonMx = CX + DIR.x * x * R;
            var moonMy = CY + DIR.y * x * R;

            drawSky(dark);
            cv.clearRect(CX - 100, CY - 100, 200, 200);
            drawCorona(dark, tSec);
            drawSun();
            cv.save();
            cv.globalCompositeOperation = "destination-out";
            cv.fillStyle = "#000";
            cv.beginPath(); cv.arc(moonMx, moonMy, RM, 0, 7); cv.fill();
            cv.restore();
            var moonAlpha = smoothstep(0.72, 0.9, dark);
            if (moonAlpha > 0.01) {
                cv.save();
                cv.globalAlpha = moonAlpha;
                drawMoon(moonMx, moonMy);
                cv.restore();
            }

            if (progress >= 1 && !holding) holding = now;
            if (holding && now - holding > HOLD_MS) {
                if (reduced) {
                    overlay.style.opacity = "0";
                    window.setTimeout(finishNow, BURST_MS);
                    return;
                }
                burstStart = now;
                overlay.style.backgroundColor = "transparent";
                window.requestAnimationFrame(frameBurst);
                return;
            }
            window.requestAnimationFrame(frame);
        }

        if (statusEl) statusEl.textContent = reduced
            ? "演示播放中（已按「减少动态效果」缩短并省略光爆）"
            : "演示播放中 · 点击任意处或按 Esc 可提前结束";
        window.requestAnimationFrame(frame);
    }

    /* ============================================================
       三、接线
       ============================================================ */
    function boot() {
        var stage = document.getElementById("stage");
        if (!stage) return;

        var poster = document.getElementById("stage-poster");
        var notice = document.getElementById("stage-notice");
        var status = document.getElementById("stage-status");
        var toolbar = document.getElementById("stage-toolbar");
        var vortexBtn = document.getElementById("vortex-toggle");
        var eclipseBtn = document.getElementById("eclipse-play");
        var motionHint = document.getElementById("motion-hint");

        // 控件一开始就在 HTML 里占好位置（避免脚本就绪时把下方内容顶下去），
        // 但按钮是 disabled 的：脚本没跑起来时它们是明确的"不可用"，而不是点了没反应。
        [vortexBtn, eclipseBtn].forEach(function (btn) {
            if (btn) btn.disabled = false;
        });
        if (motionHint && reduceMotion.matches) motionHint.hidden = false;

        var vortex = null;
        if (vortexBtn) {
            vortexBtn.addEventListener("click", function () {
                if (!vortex) {
                    try {
                        vortex = initVortex({
                            stage: stage,
                            poster: poster,
                            notice: notice,
                            status: status,
                            toggle: vortexBtn
                        });
                    } catch (err) {
                        if (status) status.textContent = "涡流初始化失败：" + err.message;
                        console.warn(err);
                        return;
                    }
                    if (!vortex) {
                        vortexBtn.disabled = true;
                        return;
                    }
                }
                if (vortex.isActive()) vortex.stop();
                else vortex.start();
            });
        }

        if (eclipseBtn) {
            eclipseBtn.addEventListener("click", function () {
                var original = eclipseBtn.textContent;
                eclipseBtn.disabled = true;
                playEclipse({
                    status: status,
                    onEnd: function () {
                        eclipseBtn.disabled = false;
                        eclipseBtn.textContent = original;
                        window.setTimeout(function () { eclipseBtn.focus(); }, 60);
                    }
                });
                eclipseBtn.textContent = "播放中…";
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
