const textContainer = document.getElementById("textContainer");
let globalcaleFactor = 1.0;
let easeFactor = 0.02;
let scene, camera, renderer, planeMesh;
let mousePosition = { x: 0.5, y: 0.5 };
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
    float strength = smoothstep(0.3, 0.0, pixelDistanceToMouse);
    //计算偏量
    vec2 uvOffset = strength * -mouseDirection *0.3;
    vec2 uv = vUv - uvOffset;

    vec4 color = texture2D(u_texture, uv);
    gl_FragColor = color;

}
`;
// 全局建立一个图片对象
// 🌟 1. 在全局建立一个图片对象（此时它还是个空壳）
const bgImage = new Image();

// 🌟 2. 第一重锁：监听【字体】加载事件
// 这是你最开始直觉告诉你的解法，它是对的！我们要保证 Blanquotey 字体 ready。
document.fonts.ready.then(() => {
    
    // 🌟 3. 在字体 ready 后，我们再来配置【图片】的 onload 魔法
    // 顺序非常关键：必须先写 onload 接收器，再写 src 发射图片请求！
    bgImage.onload = () => {
        // A. 先用带图片的 createTextTexture 初始化 Three.js 场景
        initializeScene(
            createTextTexture("Kysoul", "Blanquotey", null, "#ffffff", "100", bgImage)
        );
        // B. 场景和 3D 画布都建好了，最后拧开车钥匙启动动画循环！
        animateScene();
    };

    // 🌟 4. 这里加上报错检测，如果路径不对，直接弹窗报错，免得你干等！
    bgImage.onerror = () => {
        alert("❌ 图片加载失败，请检查相对路径：\n" + bgImage.src);
    };

    // 🌟 5. 一切魔法都布置好了，最后发射图片请求！
    // 确保你的路径 "./photo/background/fujim.png" 是相对于 HTML 的正确路径。
    bgImage.src = "./photo/background/fujim.png"; 

});



function createTextTexture(text, font, size, color, fontWeight = "100", img = null) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d"); 

    const canvasWidth = window.innerWidth * 2;
    const canvasHeight = window.innerHeight * 2;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (img && img.complete && img.width > 0) {
        const imgWidth = canvasWidth;
        const imgHeight = (canvasWidth / img.width) * img.height;
        const imgX = 0;
        const imgY = canvasHeight - imgHeight; // 靠底对齐
        
        ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
    }

    const fontSize = size || Math.floor(canvasWidth * 2);

    ctx.fillStyle = "#000000";
    ctx.font = `${fontWeight} ${fontSize}px ${font || "Blanquotey"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;

    const caleFactor = Math.min(1, (canvasWidth * 0.99) / textWidth);
    globalcaleFactor = caleFactor; 

    ctx.setTransform(
        caleFactor,
        0,
        0,
        caleFactor,
        canvasWidth / 2,
        canvasWidth * -0.02
    );

    ctx.strokeStyle = "#000000"; 
    ctx.lineWidth = fontSize * 0.005;
    for (let i = 0; i < 3; i++) {
        ctx.strokeText(text, 0, 0);
    }
    ctx.fillText(text, 0, 0);

    return new THREE.CanvasTexture(canvas);
}

//点击about
function updateSvgNavigation(){
    const w = window.innerWidth;
    const h = window.innerHeight;

    const path = document.getElementById('curve-under-s');
    if(path) {
        //原点
        const centerX = w / 2;       
        const anchorY = w * -0.02;   
        
        
        const relativeStartX_Pct = -0.144; 
        const relativeStartY_Pct = 0.166; 
        
        const relativeControlX_Pct = -0.069;
        const relativeControlY_Pct = 0.33;
        
        const relativeEndX_Pct = 0.010;
        const relativeEndY_Pct = 0.166;


        const OstartX = centerX + (w * relativeStartX_Pct);
        const OstartY = anchorY + (w * relativeStartY_Pct); 
        
        const OcontrolX = centerX + (w * relativeControlX_Pct);
        const OcontrolY = anchorY + (w * relativeControlY_Pct);
        
        const OendX = centerX + (w * relativeEndX_Pct);
        const OendY = anchorY + (w * relativeEndY_Pct);

        const dAttribute = `M ${OstartX},${OstartY} Q ${OcontrolX},${OcontrolY} ${OendX},${OendY}`;
        path.setAttribute('d', dAttribute);

        
        const navText = document.getElementById('nav-text-about');
        if(navText) {
            navText.style.fontSize = `${w * 0.012}px`; 
        }
    }
}

//点击resume
function updateSvgNavigationResume(){
    const w = window.innerWidth;
    
    const path = document.getElementById('curve-under-o');
    if(path) {
        //原点
        const centerX = w / 2;       
        const anchorY = w * -0.02;   
        
        const relativeStartX_Pct = 0.023; 
        const relativeStartY_Pct = 0.185; 
        
        const relativeControlX_Pct = 0.103;
        const relativeControlY_Pct = 0.306;
        
        const relativeEndX_Pct = 0.183;
        const relativeEndY_Pct = 0.185;


        const OstartX = centerX + (w * relativeStartX_Pct);
        const OstartY = anchorY + (w * relativeStartY_Pct); 
        
        const OcontrolX = centerX + (w * relativeControlX_Pct);
        const OcontrolY = anchorY + (w * relativeControlY_Pct);
        
        const OendX = centerX + (w * relativeEndX_Pct);
        const OendY = anchorY + (w * relativeEndY_Pct);

        const dAttribute = `M ${OstartX},${OstartY} Q ${OcontrolX},${OcontrolY} ${OendX},${OendY}`;
        path.setAttribute('d', dAttribute);

        
        const navText = document.getElementById('nav-text-resume');
        if(navText) {
            navText.style.fontSize = `${w * 0.012}px`; 
        }
    }
}

//点击contact
function updateSvgNavigationContact(){
    const w = window.innerWidth;
    
    const path = document.getElementById('curve-under-y');
    if(path) {
        //原点
        const centerX = w / 2;       
        const anchorY = w * -0.02;   
        
        
        const relativeStartX_Pct = -0.322; 
        const relativeStartY_Pct = 0.173; 
        
        const relativeControlX_Pct = -0.238;
        const relativeControlY_Pct = 0.318;
        
        const relativeEndX_Pct = -0.161;
        const relativeEndY_Pct = 0.173;


        const OstartX = centerX + (w * relativeStartX_Pct);
        const OstartY = anchorY + (w * relativeStartY_Pct); 
        
        const OcontrolX = centerX + (w * relativeControlX_Pct);
        const OcontrolY = anchorY + (w * relativeControlY_Pct);
        
        const OendX = centerX + (w * relativeEndX_Pct);
        const OendY = anchorY + (w * relativeEndY_Pct);

        const dAttribute = `M ${OstartX},${OstartY} Q ${OcontrolX},${OcontrolY} ${OendX},${OendY}`;
        path.setAttribute('d', dAttribute);

        
        const navText = document.getElementById('nav-text-contact');
        if(navText) {
            navText.style.fontSize = `${w * 0.012}px`; 
        }
    }
}
//点击work
function updateSvgNavigationWork(){
    const w = window.innerWidth;
    
    const path = document.getElementById('curve-under-u');
    if(path) {
        //原点
        const centerX = w / 2;       
        const anchorY = w * -0.02;   
        
        
        const relativeStartX_Pct = 0.215; 
        const relativeStartY_Pct = 0.185; 
        
        const relativeControlX_Pct = 0.298;
        const relativeControlY_Pct = 0.306;
        
        const relativeEndX_Pct = 0.378;
        const relativeEndY_Pct = 0.185;


        const OstartX = centerX + (w * relativeStartX_Pct);
        const OstartY = anchorY + (w * relativeStartY_Pct); 
        
        const OcontrolX = centerX + (w * relativeControlX_Pct);
        const OcontrolY = anchorY + (w * relativeControlY_Pct);
        
        const OendX = centerX + (w * relativeEndX_Pct);
        const OendY = anchorY + (w * relativeEndY_Pct);

        const dAttribute = `M ${OstartX},${OstartY} Q ${OcontrolX},${OcontrolY} ${OendX},${OendY}`;
        path.setAttribute('d', dAttribute);

        
        const navText = document.getElementById('nav-text-work');
        if(navText) {
            navText.style.fontSize = `${w * 0.012}px`; 
        }
    }
}


function initializeScene(texture){
    scene = new THREE.Scene();

    const aspectRatio = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
        -1,
        1,
        1,
        -1,
        0.1,
        1000
    );
    camera.position.z = 1;

    let shaderUniforms = {
        u_mouse: { type:"v2", value: new THREE.Vector2()},
        u_prevMouse: { type: "v2", value: new THREE.Vector2()},
        u_texture: { type: "t", value: texture },
    };

    planeMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2,2),
        new THREE.ShaderMaterial({
            uniforms: shaderUniforms,
            vertexShader,
            fragmentShader,
        })
    );
    scene.add(planeMesh);

    renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setClearColor(0xffffff,0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    textContainer.appendChild(renderer.domElement);
    updateSvgNavigation();
    updateSvgNavigationResume();
    updateSvgNavigationContact();
    updateSvgNavigationWork();

}

function reloadTexture(){
    if (planeMesh.material.uniforms.u_texture.value) {
        planeMesh.material.uniforms.u_texture.value.dispose();
    }
    const newTexture = createTextTexture(
        "Kysoul",
        "Blanquotey",
        null,
        "#ffffff",
        "100",
        bgImage,
    );
    newTexture.needsUpdate = true;

    planeMesh.material.uniforms.u_texture.value = newTexture;
    updateSvgNavigation();// ABOUT
    updateSvgNavigationResume();// RESUME
    updateSvgNavigationContact(); // CONTACT
    updateSvgNavigationWork(); // WORK
}


function animateScene(){
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
    updateSvgNavigation();// ABOUT
    updateSvgNavigationResume();// RESUME
    updateSvgNavigationContact(); // CONTACT
    updateSvgNavigationWork(); // WORK
    renderer.render(scene, camera);
}


textContainer.addEventListener("mousemove", handleMouseMove);
textContainer.addEventListener("mouseenter", handleMouseEnter);
textContainer.addEventListener("mouseleave",handleMouseLeave);

function handleMouseMove(event){
    easeFactor = 0.04;
    let rect = textContainer.getBoundingClientRect();
    prevPosition = { ...targetMousePosition };

    targetMousePosition.x = (event.clientX - rect.left) / rect.width;
    targetMousePosition.y = (event.clientY - rect.top) / rect.height;
}

function handleMouseEnter(event){
    easeFactor = 0.02;
    let rect = textContainer.getBoundingClientRect();

    mousePosition.x = targetMousePosition.x = 
        (event.clientX - rect.left) / rect.width;
    mousePosition.y = targetMousePosition.y = 
        (event.clientY - rect.top) / rect.height;
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
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    reloadTexture();
}
//导航栏跳转
function bindNavClicks() {
    const navs = [
        { id: 'nav-text-about', url: 'about.html' },
        { id: 'nav-text-resume', url: 'resume.html' },
        { id: 'nav-text-contact', url: 'contact.html' },
        { id: 'nav-text-work', url: 'work.html' }
    ];

    navs.forEach(nav => {
        const el = document.getElementById(nav.id);
        if (el) {
            
            el.style.pointerEvents = 'auto';
            el.style.cursor = 'pointer';

            el.addEventListener('click', () => {
                window.location.href = nav.url;
            });
        }
    });
}
bindNavClicks();



