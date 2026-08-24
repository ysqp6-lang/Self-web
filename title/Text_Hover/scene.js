/**
 * scene.js —— Three.js 场景
 * 负责：3D 场景 / 相机的创建、动画循环、鼠标交互、窗口缩放响应。
 * 依赖：config.js（参数）、shaders.js（着色器）、texture.js（纹理）、svg-nav.js（导航）
 */
const textContainer = document.getElementById("textContainer");

let scene, camera, renderer, planeMesh;

// 鼠标位置（当前值 / 目标值 / 上一帧值），0~1 归一化坐标
let mousePosition = { x: 0.5, y: 0.5 };
let targetMousePosition = { x: 0.5, y: 0.5 };
let prevPosition = { x: 0.5, y: 0.5 };
let easeFactor = CONFIG.easeFactorIdle; // 缓动系数（进入/移动/离开时切换）

/** 创建场景、相机、着色器平面和渲染器 */
function initializeScene(texture) {
    scene = new THREE.Scene();

    // 正交相机：画面正好铺满整个窗口
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 1;

    const shaderUniforms = {
        u_mouse: { type: "v2", value: new THREE.Vector2() },
        u_prevMouse: { type: "v2", value: new THREE.Vector2() },
        u_texture: { type: "t", value: texture },
    };

    planeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
            uniforms: shaderUniforms,
            vertexShader,
            fragmentShader,
        })
    );
    scene.add(planeMesh);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0xffffff, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    textContainer.appendChild(renderer.domElement);

    updateSvgNavigation(); // 窗口尺寸已定，计算一次导航曲线即可
}

/** 窗口变化时：重建文字纹理（含背景图），并重新计算导航曲线 */
function reloadTexture() {
    if (planeMesh.material.uniforms.u_texture.value) {
        planeMesh.material.uniforms.u_texture.value.dispose();
    }
    const newTexture = createTextTexture(
        CONFIG.text, CONFIG.font, null, "#ffffff", CONFIG.fontWeight, bgImage
    );
    newTexture.needsUpdate = true;
    planeMesh.material.uniforms.u_texture.value = newTexture;
    updateSvgNavigation();
}

/** 动画主循环：缓动鼠标位置 → 更新着色器 → 渲染 */
function animateScene() {
    requestAnimationFrame(animateScene);

    mousePosition.x += (targetMousePosition.x - mousePosition.x) * easeFactor;
    mousePosition.y += (targetMousePosition.y - mousePosition.y) * easeFactor;

    planeMesh.material.uniforms.u_mouse.value.set(
        mousePosition.x,
        1.0 - mousePosition.y
    );
    planeMesh.material.uniforms.u_prevMouse.value.set(
        prevPosition.x,
        1.0 - prevPosition.y
    );

    renderer.render(scene, camera);
}

// ---------- 鼠标交互 ----------
textContainer.addEventListener("mousemove", handleMouseMove);
textContainer.addEventListener("mouseenter", handleMouseEnter);
textContainer.addEventListener("mouseleave", handleMouseLeave);

function handleMouseMove(event) {
    easeFactor = CONFIG.easeFactorActive; // 移动时更跟手
    const rect = textContainer.getBoundingClientRect();
    prevPosition = { ...targetMousePosition };

    targetMousePosition.x = (event.clientX - rect.left) / rect.width;
    targetMousePosition.y = (event.clientY - rect.top) / rect.height;
}

function handleMouseEnter(event) {
    easeFactor = CONFIG.easeFactorIdle;
    const rect = textContainer.getBoundingClientRect();

    mousePosition.x = targetMousePosition.x =
        (event.clientX - rect.left) / rect.width;
    mousePosition.y = targetMousePosition.y =
        (event.clientY - rect.top) / rect.height;
}

function handleMouseLeave() {
    easeFactor = CONFIG.easeFactorIdle;
    targetMousePosition = { ...prevPosition };
}

// ---------- 窗口缩放 ----------
window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
    camera.left = -1;
    camera.right = 1;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    reloadTexture();
}
