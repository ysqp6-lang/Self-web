/**
 * main.js —— 启动入口
 * 控制整个启动流程的顺序：
 *   等字体就绪 → 加载背景图 → 创建场景 → 开始动画 → 绑定导航点击。
 */
// 方案C:document.fonts.ready 并不保证 Blanquotey 已就绪,
// 必须 fonts.load 同一字重(失败兜底不阻塞),字体就绪后再加载背景图,
// 保证 Kysoul 纹理用真实字体绘制
Promise.all([
    document.fonts.load(`${CONFIG.fontWeight} 100px "${CONFIG.font}"`).catch(() => {}),
    document.fonts.ready
]).then(() => {
    // 顺序很关键：必须先写 onload 接收器，再设置 src 发射图片请求
    bgImage.onload = () => {
        initializeScene(
            createTextTexture(
                CONFIG.text, CONFIG.font, null, "#ffffff", CONFIG.fontWeight, bgImage
            )
        );
        animateScene();
        // 通知 eclipse-loader:场景已真正就绪,可以日全食+淡出了
        document.dispatchEvent(new CustomEvent("site-ready"));
    };

    // 图片路径错误时弹窗提示，方便排查
    bgImage.onerror = () => {
        alert("❌ 图片加载失败，请检查相对路径：\n" + bgImage.src);
    };

    bgImage.src = CONFIG.bgImagePath;
});

// 导航点击绑定放在最外层：即使背景图加载失败，导航依然可用
bindNavClicks();
