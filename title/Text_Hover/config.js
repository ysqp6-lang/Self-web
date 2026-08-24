/**
 * config.js —— 全局配置
 * 所有可调参数集中在这里：想改文字、字体、特效强弱，只改这个文件即可。
 */
const CONFIG = {
    // 鼠标缓动系数（越小越平滑，越大越跟手）
    easeFactorIdle: 0.02,   // 静止/进入时
    easeFactorActive: 0.04, // 移动时

    // 首页文字与字体
    text: "Kysoul",
    font: "Blanquotey",
    fontWeight: "100",

    // 背景图路径（相对 index.html）
    bgImagePath: "./photo/background/fujim.png",

    // 纹理画布相对窗口的放大倍数（越高越清晰，也越耗性能）
    canvasScale: 2,

    // 涡流像素化效果
    pixelGrid: 40,            // 像素块数量（横竖各 N 格）
    distortionStrength: 0.3,  // 鼠标拖拽时的偏移强度
    distortionRange: 0.3,     // 影响范围（0~1，越大影响区域越广）
};
