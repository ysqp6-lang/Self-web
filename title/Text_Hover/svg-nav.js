/**
 * svg-nav.js —— SVG 导航
 * 负责：首页 4 个导航入口（ABOUT / RESUME / CONTACT / WORK）的
 *       曲线路径计算和点击跳转。
 * 原代码是 4 份几乎一样的函数（约 180 行），这里合并成
 *       1 张配置表 + 1 个更新函数 + 1 个点击绑定函数。
 * 依赖：无（纯 DOM 操作）
 */

// 导航配置表：每条曲线的锚点位置（相对窗口宽度的百分比）和跳转目标
const NAV_ITEMS = [
    {
        pathId: "curve-under-s",     // SVG path 元素 id
        textId: "nav-text-about",    // 可点击文字元素 id
        url: "about.html",
        startX: -0.144, startY: 0.166,
        ctrlX: -0.069,  ctrlY: 0.33,
        endX: 0.010,    endY: 0.166,
    },
    {
        pathId: "curve-under-o",
        textId: "nav-text-resume",
        url: "resume.html",
        startX: 0.023, startY: 0.185,
        ctrlX: 0.103,  ctrlY: 0.306,
        endX: 0.183,   endY: 0.185,
    },
    {
        pathId: "curve-under-y",
        textId: "nav-text-contact",
        url: "contact.html",
        startX: -0.322, startY: 0.173,
        ctrlX: -0.238, ctrlY: 0.318,
        endX: -0.161,  endY: 0.173,
    },
    {
        pathId: "curve-under-u",
        textId: "nav-text-work",
        url: "work.html",
        startX: 0.215, startY: 0.185,
        ctrlX: 0.298,  ctrlY: 0.306,
        endX: 0.378,   endY: 0.185,
    },
];

/**
 * 计算并更新 4 条导航曲线 + 文字大小。
 * 曲线只取决于窗口宽度，所以只在【初始化】和【窗口变化】时调用一次，
 * 不再像原来那样每个动画帧都重算（这是本次最主要的提速点）。
 */
function updateSvgNavigation() {
    const w = window.innerWidth;
    const centerX = w / 2;
    const anchorY = w * -0.02;
    const fontSize = `${w * 0.012}px`;

    NAV_ITEMS.forEach((item) => {
        const path = document.getElementById(item.pathId);
        if (!path) return;

        const d = [
            "M",
            centerX + w * item.startX, anchorY + w * item.startY,
            "Q",
            centerX + w * item.ctrlX, anchorY + w * item.ctrlY,
            centerX + w * item.endX,   anchorY + w * item.endY,
        ].join(" ");
        path.setAttribute("d", d);

        const navText = document.getElementById(item.textId);
        if (navText) navText.style.fontSize = fontSize;
    });
}

/** 给 4 个导航文字绑定点击跳转 */
function bindNavClicks() {
    NAV_ITEMS.forEach((item) => {
        const el = document.getElementById(item.textId);
        if (!el) return;
        el.style.pointerEvents = "auto";
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
            window.location.href = item.url;
        });
    });
}
