import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

class Viewer3D {
  constructor() {
    this.container = document.querySelector('.canvas-container');
    this.canvas = document.getElementById('canvas');
    this.originalVideo = document.getElementById('original-video');
    this.depthVideo = document.getElementById('depth-video');
    this.loadingScreen = document.getElementById('loading-screen');
    
    // Settings
    this.settings = {
      effectStrength: 2.5,
      shineStrength: 0.8,
      depthContrast: 2.0
    };

    // Bind methods
    this.onResize = this.onResize.bind(this);
    this.animate = this.animate.bind(this);
    this.onSettingsChange = this.onSettingsChange.bind(this);

    // Initialize
    this.init();
    this.setupEventListeners();
  }

  init() {
    // Setup Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Setup scene and camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.z = 3;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 2);
    this.scene.add(directionalLight);

    // Initialize size
    this.onResize();
  }

  setupEventListeners() {
    window.addEventListener('resize', this.onResize);

    // Settings controls
    document.getElementById('effect-strength').addEventListener('input', this.onSettingsChange);
    document.getElementById('shine-strength').addEventListener('input', this.onSettingsChange);
    document.getElementById('depth-contrast').addEventListener('input', this.onSettingsChange);

    // Settings panel toggle
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('visible');
    });

    // Video loading
    Promise.all([
      this.loadVideo(this.originalVideo, 'video.mp4'),
      this.loadVideo(this.depthVideo, 'depth_video.mp4')
    ]).then(() => {
      this.initMesh();
      this.loadingScreen.classList.add('hidden');
      this.animate();
    }).catch(error => {
      console.error('Error loading videos:', error);
      this.loadingScreen.innerHTML = 'Error loading videos. Please refresh.';
    });
  }

  loadVideo(videoElement, src) {
    return new Promise((resolve, reject) => {
      videoElement.src = src;
      videoElement.addEventListener('loadedmetadata', () => resolve());
      videoElement.addEventListener('error', () => reject());
    });
  }

  initMesh() {
    const videoAspect = this.originalVideo.videoWidth / this.originalVideo.videoHeight;
    
    // Create geometry
    const segmentsX = 512;
    const segmentsY = Math.floor(segmentsX / videoAspect);
    this.geometry = new THREE.PlaneGeometry(2 * videoAspect, 2, segmentsX - 1, segmentsY - 1);

    // Create textures
    this.colorTexture = new THREE.VideoTexture(this.originalVideo);
    this.depthTexture = new THREE.VideoTexture(this.depthVideo);

    const textures = [this.colorTexture, this.depthTexture];
    for (const texture of textures) {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.format = THREE.RGBAFormat;
    }

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        colorMap: { value: this.colorTexture },
        depthMap: { value: this.depthTexture },
        effectStrength: { value: this.settings.effectStrength },
        shineStrength: { value: this.settings.shineStrength },
        depthContrast: { value: this.settings.depthContrast }
      },
      vertexShader: `
        uniform sampler2D depthMap;
        uniform float effectStrength;
        uniform float depthContrast;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vDepthValue;
        
        void main() {
          vUv = uv;
          vec4 depthColor = texture2D(depthMap, vUv);
          float depth = pow((depthColor.r + depthColor.g + depthColor.b) / 3.0, depthContrast);
          vDepthValue = depth;
          
          vec3 transformed = position;
          vec3 objNormal = normalize(normal);
          
          float displacement = depth * effectStrength;
          transformed += objNormal * displacement;
          
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          vViewPosition = -mvPosition.xyz;
          vNormal = normalMatrix * objNormal;
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D colorMap;
        uniform float shineStrength;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vDepthValue;
        
        void main() {
          vec4 diffuseColor = texture2D(colorMap, vUv);
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          
          vec3 lightPos = vec3(2.0, 2.0, 2.0);
          vec3 lightDir = normalize(lightPos - vViewPosition);
          
          float diff = max(dot(normal, lightDir), 0.0);
          vec3 halfwayDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0) * shineStrength;
          
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          float ao = 1.0 - (vDepthValue * 0.5);
          
          vec3 ambient = vec3(0.2) * ao;
          vec3 diffuse = vec3(0.7) * diff;
          vec3 specular = vec3(0.3) * spec;
          vec3 fresnelColor = vec3(0.2) * fresnel;
          
          vec3 finalColor = (ambient + diffuse + specular + fresnelColor) * diffuseColor.rgb;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  onSettingsChange(event) {
    const setting = event.target.id.replace('-', '');
    this.settings[setting] = Number.parseFloat(event.target.value);
    
    if (this.material?.uniforms) {
      switch(setting) {
        case 'effectStrength':
          this.material.uniforms.effectStrength.value = this.settings.effectStrength;
          break;
        case 'shineStrength':
          this.material.uniforms.shineStrength.value = this.settings.shineStrength;
          break;
        case 'depthContrast':
          this.material.uniforms.depthContrast.value = this.settings.depthContrast;
          break;
      }
    }
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize the viewer
new Viewer3D(); 