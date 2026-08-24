/**
 * shaders.js —— GLSL 着色器源码
 * 涡流特效的 GPU 计算逻辑：像素化 + 鼠标拖拽偏移。
 * 注意：源码里的 ${...} 是 JS 模板字符串插值，用来把 config.js 的参数
 *       注入到着色器里，改 config.js 即可调效果，不用碰 GLSL。
 */
const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform sampler2D u_texture;
uniform vec2 u_mouse;
uniform vec2 u_prevMouse;

void main() {
    // 像素化：把画面切成 N x N 的网格，取每个网格中心点
    float grid = ${CONFIG.pixelGrid}.0;
    vec2 gridUV = floor(vUv * vec2(grid, grid)) / vec2(grid, grid);
    vec2 centerOfPixel = gridUV + vec2(1.0/grid, 1.0/grid);

    // 鼠标移动方向（上一帧 -> 当前帧）
    vec2 mouseDirection = u_mouse - u_prevMouse;
    vec2 pixelToMouseDirection = centerOfPixel - u_mouse;
    float pixelDistanceToMouse = length(pixelToMouseDirection);

    // 影响范围：离鼠标越近，偏移越强
    float strength = smoothstep(${CONFIG.distortionRange}, 0.0, pixelDistanceToMouse);

    // 计算采样偏移量（方向与鼠标移动相反，产生"推水"的涡流感）
    vec2 uvOffset = strength * -mouseDirection * ${CONFIG.distortionStrength};
    vec2 uv = vUv - uvOffset;

    vec4 color = texture2D(u_texture, uv);
    gl_FragColor = color;
}
`;
