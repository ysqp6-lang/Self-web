/**
 * main.js —— 启动入口
 * 控制整个启动流程的顺序：
 *   等字体就绪 → 加载背景图 → 创建场景 → 开始动画 → 绑定导航点击。
 */
document.fonts.ready.then(() => {
    // 顺序很关键：必须先写 onload 接收器，再设置 src 发射图片请求
    bgImage.onload = () => {
        initializeScene(
            createTextTexture(
                CONFIG.text, CONFIG.font, null, "#ffffff", CONFIG.fontWeight, bgImage
            )
        );
        animateScene();
    };

    // 图片路径错误时弹窗提示，方便排查
    bgImage.onerror = () => {
        alert("❌ 图片加载失败，请检查相对路径：\n" + bgImage.src);
    };

    bgImage.src = CONFIG.bgImagePath;
});

// 导航点击绑定放在最外层：即使背景图加载失败，导航依然可用
bindNavClicks();
