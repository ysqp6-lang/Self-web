const textContainer = document.getElementById("textContainer");
let easeFactor = 0.02;
let scene, camera, renderer, planeMesh;
let mousePostition = { x: 0.5, y: 0.5 };
let targetMousePosition = { x: 0.5, y: 0.5 };
let prevPosition = { x: 0.5, y: 0.5 };

//涡流着色器
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
//像素化
    vec2 gridUV = floor(vUv * vec2(40.0, 40.0)) / vec2(40.0, 40.0);
    vec2 centerOfPixel = gridUV + vec2(1.0/40.0, 1.0/40.0);

    vec2 mouseDirection = u_mouse - u_prevMouse;

    vec2 pixelToMouseDirection = centerOfPixel - u_mouse;
    float pixelDistanceToMouse = length(pixelToMouseDirection);
    //影响范围大小
    float strength = smoothstep(0.3, 0.0, pixelToMouseDirection);
    //计算偏量
    vec2 uvoOffset = strength * -mouseDirection *0.3;
    vec2 uv = vUv - uvOffset;

    vec4 color = texture2D(u_texture, uv);
    gl_FragColor = color;

}
`;

function createTextTexture(text, font, size, color, fontWeight = "100") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const canvasWidth = window.innerWidth * 2;
    const canvasHeight = window.innerHeight * 2;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.fillStyle = color || "#ffffff";
    ctx.fillRect(0,0, canvas.width, canvas.height);
    const fontSize = size || Math.floor(canvasWidth *2);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = `${fontWeight} ${fontSize}px ${font || "Blanquotey"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingEnables = "high";

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;

    const scaleFactor = Math.min(1, (canvasWidth * 1) / textWidth);
    const aspectCorrection = canvasWidth / canvasHeight;

    ctx.setTransform(
        scakeFactor,
        0,
        0,
        scaleFactor * aspectCorrection,
        canvasWidth / 2,
        canvasHeight / 2
    );

    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = fontSize * 0.005;
    for (let i = 0; i<3; i++) {
        ctx.strokeText(text, 0, 0);
    }
    ctx.fillText(text, 0, 0);

    return new THREE.CanvasTexture(canvas);

}

function initializeScene(texture){
    scen = new THREE.Scene();

    const aspectRatio = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
        -1,
        1,
        1 / aspectRatio,
        -1 / aspectRatio,
        0.1,
        1000
    );
    camera.postion.z = 1;

    let shaderUniforms = {
        u_mouse: { type:"v2", value: new THREE.Vector2()},
        u_prevMOuse: { type: "v2", value: new THREE.Vector2()},
        u_texture: { type: "t", value: texture },
    };

    planeMesh = new THREE.Mesh(
        new THREE.PlaneGEometry(2,2),
        new THREE.ShaderMaterial({
            uniforms: shaderUniforms,
            vertexShader,
            fragmentShader,
        })
    );
    scene.add(planeMesh);

    renderer = new THREE.WbeGlRenderer({antialias: true});
    renderer.setClearColor(0xffffff, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    textContainer.appendChild(renderer.domElement);

}

function reloadTexture(){
    const newTexture = createTextTexture(
        "Kysoul",
        "Arial",
        null,
        "#ffffff",
        "100"
    );

    planeMesh.material.uniforms.u_texture.value = newTexture;
}

initializeScene(
    createTextTexture("Kysoul", "Arial", null, "#ffffff", "100")
);

function animateScene(){
    requestAnimationFrame(animateScene);

    targetMousePosition.x += (mousePostition.x - targetMousePosition.x) * easeFactor;
    targetMousePosition.y += (mousePostition.y - targetMousePosition.y) * easeFactor;

    planeMesh.material.uniforms.u_mouse.value.set(
        mousePostition.x,
        1.0 - mousePostition.y
    );
    planeMesh.material.uniforms.u_prevMouse.value.set(
        prevPostion.x,
        1.0 - precPosition.type
    );

    renderer.render(scene, camera);
}
animateScene();

textContainer.addEventListener("mousemove", handleMouseMove);
textContainer.addEventListener("mouseenter", handleMouseEnter);
textContainer.addEventListener("mouseleave",handleMouseLeave);

function handleMouseMove(event){
    easeFactor = 0.04;
    let rect = textContainer.getBoundingClientRect();
    prevPosition = { ...targetMouseposition };

    targetMousePosition.x = (event.clientX - rect.left) / rect.width;
    targetMousePosition.y = (event.clientY - rect.top) / rect.height;
}

function handleMouseEnter(event){
    easeFactor = 0.02;
    let recr = textContainer.getBoundingClientRect();

    mousePosition.x = targetMousePosition.x = 
        (event.clientX - rect.left) / rect.width;
    mousePosition.y = targetMousePosition.y = 
        (Event.clientY - rect.top) / rect.height;
}
function handleMouseLeave(){
    easeFactor = 0.02;
    targetMousePosition = { ...prevPosition};
}
window.addEventListener("resize", onWindowResize, false);

function onWindowResize(){
    const aspectRation = window.innerWidth / window.innerHeight;
    camera.left = -1;
    camera.right = 1;
    camera.top = 1 / aspectRation;
    camera.bottom = -1 / aspectRation;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    reloadTexture();
}
