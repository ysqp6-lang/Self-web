/**
 * texture.js —— 文字纹理
 * 负责：把 "Kysoul" 文字 + 背景图绘制到一块 canvas 上，
 *       生成 Three.js 的 CanvasTexture 交给着色器使用。
 * 依赖：config.js（参数）、three.js（THREE.CanvasTexture）
 */
// 背景图对象（先建空壳，等字体就绪后由 main.js 设置 src 真正加载）
const bgImage = new Image();

// 文字缩放系数（文字过长时等比缩小），保留全局变量方便调试/复用
let globalScaleFactor = 1.0;

function createTextTexture(text, font, size, color, fontWeight = "100", img = null) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // 画布尺寸 = 窗口尺寸 × canvasScale（越大越清晰，也越吃内存/性能）
    const canvasWidth = window.innerWidth * CONFIG.canvasScale;
    const canvasHeight = window.innerHeight * CONFIG.canvasScale;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 先画背景图（等比铺满宽度，靠底部对齐）
    if (img && img.complete && img.width > 0) {
        const imgWidth = canvasWidth;
        const imgHeight = (canvasWidth / img.width) * img.height;
        ctx.drawImage(img, 0, canvasHeight - imgHeight, imgWidth, imgHeight);
    }

    // 2. 再画超大号文字（字号是画布宽度的 2 倍，靠 transform 缩放适配）
    const fontSize = size || Math.floor(canvasWidth * 2);
    ctx.fillStyle = "#000000";
    ctx.font = `${fontWeight} ${fontSize}px ${font || "Blanquotey"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // 3. 文字超出画面时等比缩小到 99% 宽度以内
    const textWidth = ctx.measureText(text).width;
    const scaleFactor = Math.min(1, (canvasWidth * 0.99) / textWidth);
    globalScaleFactor = scaleFactor;

    ctx.setTransform(
        scaleFactor, 0, 0, scaleFactor,
        canvasWidth / 2,
        canvasWidth * -0.02
    );

    // 4. 描边 3 遍加粗笔画，再填充主体
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize * 0.005;
    for (let i = 0; i < 3; i++) {
        ctx.strokeText(text, 0, 0);
    }
    ctx.fillText(text, 0, 0);

    return new THREE.CanvasTexture(canvas);
}
