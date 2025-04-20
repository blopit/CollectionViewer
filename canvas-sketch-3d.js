const canvasSketch = require("canvas-sketch");

// Import ThreeJS and assign it to global scope
// This way examples/ folder can use it too
const THREE = require("three");
global.THREE = THREE;

// Import extra THREE plugins
require("three/examples/js/controls/OrbitControls");
require("three/examples/js/geometries/RoundedBoxGeometry.js");
require("three/examples/js/loaders/GLTFLoader.js");
require("three/examples/js/loaders/RGBELoader.js");
require("three/examples/js/postprocessing/EffectComposer.js");
require("three/examples/js/postprocessing/RenderPass.js");
require("three/examples/js/postprocessing/ShaderPass.js");
require("three/examples/js/postprocessing/UnrealBloomPass.js");
require("three/examples/js/shaders/LuminosityHighPassShader.js");
require("three/examples/js/shaders/CopyShader.js");

const Stats = require("stats-js");
const { GUI } = require("dat.gui");

const settings = {
  animate: true,
  context: "webgl",
  resizeCanvas: false,
};

const sketch = ({ context, canvas, width, height }) => {
  const stats = new Stats();
  document.body.appendChild(stats.dom);
  const gui = new GUI();

  // Load saved settings if available
  const loadSettings = () => {
    const savedSettings = localStorage.getItem('canvasSketchSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Merge saved settings with defaults
        Object.assign(options, parsed);
        console.log('Loaded settings:', options);
      } catch (e) {
        console.error('Error loading settings:', e);
      }
    }
  };

  // Save settings to localStorage
  const saveSettings = () => {
    try {
      localStorage.setItem('canvasSketchSettings', JSON.stringify(options));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  };

  const options = {
    enableSwoopingCamera: false,
    enableRotation: true,
    transmission: 1,
    thickness: 1.2,
    roughness: 0.6,
    envMapIntensity: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    normalScale: 1,
    clearcoatNormalScale: 0.3,
    normalRepeat: 1,
    bloomThreshold: 0.85,
    bloomStrength: 0.5,
    bloomRadius: 0.33,
    // New foreground shine parameters
    foregroundShine: 0.8,
    foregroundShininess: 50,
    foregroundSpecularColor: [1.0, 0.9, 0.8],
    // Strategic lighting parameters
    lightTopLeft: 0.7,
    lightTopRight: 0.5,
    lightBottomLeft: 0.3,
    lightBottomRight: 0.2,
    // Depth threshold for foreground elements
    depthThreshold: 0.5,
  };

  // Load saved settings
  loadSettings();

  // Setup
  // -----

  const renderer = new THREE.WebGLRenderer({
    context,
    antialias: false,
  });
  renderer.setClearColor(0x1f1e1c, 1);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, 5);

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enabled = !options.enableSwoopingCamera;

  const scene = new THREE.Scene();

  const renderPass = new THREE.RenderPass(scene, camera);
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(width, height),
    options.bloomStrength,
    options.bloomRadius,
    options.bloomThreshold
  );

  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // Content
  // -------

  const textureLoader = new THREE.TextureLoader();

  const bgTexture = textureLoader.load("src/texture.jpg");
  const bgGeometry = new THREE.PlaneGeometry(5, 5);
  const bgMaterial = new THREE.MeshBasicMaterial({ map: bgTexture });
  const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
  bgMesh.position.set(0, 0, -1);
  scene.add(bgMesh);

  const positions = [
    [-0.85, 0.85, 0],
    [0.85, 0.85, 0],
    [-0.85, -0.85, 0],
    [0.85, -0.85, 0],
  ];

  const geometries = [
    new THREE.IcosahedronGeometry(0.75, 0), // Faceted
    new THREE.IcosahedronGeometry(0.67, 24), // Sphere
    new THREE.RoundedBoxGeometry(1.12, 1.12, 1.12, 16, 0.2),
  ];

  const hdrEquirect = new THREE.RGBELoader().load(
    "src/empty_warehouse_01_2k.hdr",
    () => {
      hdrEquirect.mapping = THREE.EquirectangularReflectionMapping;
    }
  );

  const normalMapTexture = textureLoader.load("src/normal.jpg");
  normalMapTexture.wrapS = THREE.RepeatWrapping;
  normalMapTexture.wrapT = THREE.RepeatWrapping;
  normalMapTexture.repeat.set(options.normalRepeat, options.normalRepeat);

  // Create a custom shader material for foreground shine effects
  const createCustomMaterial = () => {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        normalMap: { value: normalMapTexture },
        envMap: { value: hdrEquirect },
        depthMap: { value: null },
        depthThreshold: { value: options.depthThreshold },
        transmission: { value: options.transmission },
        thickness: { value: options.thickness },
        roughness: { value: options.roughness },
        envMapIntensity: { value: options.envMapIntensity },
        clearcoat: { value: options.clearcoat },
        clearcoatRoughness: { value: options.clearcoatRoughness },
        normalScale: { value: new THREE.Vector2(options.normalScale, options.normalScale) },
        clearcoatNormalScale: { value: new THREE.Vector2(options.clearcoatNormalScale, options.clearcoatNormalScale) },
        foregroundShine: { value: options.foregroundShine },
        foregroundShininess: { value: options.foregroundShininess },
        foregroundSpecularColor: { value: new THREE.Vector3(...options.foregroundSpecularColor) },
        lightTopLeft: { value: options.lightTopLeft },
        lightTopRight: { value: options.lightTopRight },
        lightBottomLeft: { value: options.lightBottomLeft },
        lightBottomRight: { value: options.lightBottomRight },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        uniform sampler2D baseTexture;
        uniform sampler2D normalMap;
        uniform sampler2D envMap;
        uniform sampler2D depthMap;
        uniform float depthThreshold;
        uniform float transmission;
        uniform float thickness;
        uniform float roughness;
        uniform float envMapIntensity;
        uniform float clearcoat;
        uniform float clearcoatRoughness;
        uniform vec2 normalScale;
        uniform vec2 clearcoatNormalScale;
        uniform float foregroundShine;
        uniform float foregroundShininess;
        uniform vec3 foregroundSpecularColor;
        uniform float lightTopLeft;
        uniform float lightTopRight;
        uniform float lightBottomLeft;
        uniform float lightBottomRight;
        
        void main() {
          // Base color
          vec4 baseColor = texture2D(baseTexture, vUv);
          
          // Normal mapping
          vec3 normal = normalize(vNormal);
          vec3 normalMapValue = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
          normal = normalize(normal + normalMapValue * normalScale.x);
          
          // Depth map for foreground detection
          float depth = texture2D(depthMap, vUv).r;
          float isForeground = step(depthThreshold, depth);
          
          // View direction for specular calculation
          vec3 viewDir = normalize(vViewPosition);
          
          // Strategic lighting from four corners
          vec3 lightDirTopLeft = normalize(vec3(-1.0, 1.0, 1.0));
          vec3 lightDirTopRight = normalize(vec3(1.0, 1.0, 1.0));
          vec3 lightDirBottomLeft = normalize(vec3(-1.0, -1.0, 1.0));
          vec3 lightDirBottomRight = normalize(vec3(1.0, -1.0, 1.0));
          
          // Calculate diffuse lighting
          float diffuseTopLeft = max(0.0, dot(normal, lightDirTopLeft)) * lightTopLeft;
          float diffuseTopRight = max(0.0, dot(normal, lightDirTopRight)) * lightTopRight;
          float diffuseBottomLeft = max(0.0, dot(normal, lightDirBottomLeft)) * lightBottomLeft;
          float diffuseBottomRight = max(0.0, dot(normal, lightDirBottomRight)) * lightBottomRight;
          float diffuse = diffuseTopLeft + diffuseTopRight + diffuseBottomLeft + diffuseBottomRight;
          
          // Calculate specular highlights (only for foreground)
          vec3 reflectDirTopLeft = reflect(-lightDirTopLeft, normal);
          vec3 reflectDirTopRight = reflect(-lightDirTopRight, normal);
          vec3 reflectDirBottomLeft = reflect(-lightDirBottomLeft, normal);
          vec3 reflectDirBottomRight = reflect(-lightDirBottomRight, normal);
          
          float specularTopLeft = pow(max(0.0, dot(reflectDirTopLeft, viewDir)), foregroundShininess) * lightTopLeft;
          float specularTopRight = pow(max(0.0, dot(reflectDirTopRight, viewDir)), foregroundShininess) * lightTopRight;
          float specularBottomLeft = pow(max(0.0, dot(reflectDirBottomLeft, viewDir)), foregroundShininess) * lightBottomLeft;
          float specularBottomRight = pow(max(0.0, dot(reflectDirBottomRight, viewDir)), foregroundShininess) * lightBottomRight;
          
          // Apply specular only to foreground elements
          float specular = (specularTopLeft + specularTopRight + specularBottomLeft + specularBottomRight) * foregroundShine * isForeground;
          
          // Combine lighting with base color
          vec3 finalColor = baseColor.rgb * (0.2 + 0.8 * diffuse);
          
          // Add specular highlights to foreground
          finalColor += foregroundSpecularColor * specular;
          
          gl_FragColor = vec4(finalColor, baseColor.a);
        }
      `,
      side: THREE.DoubleSide
    });
  };

  const material = new THREE.MeshPhysicalMaterial({
    transmission: options.transmission,
    thickness: options.thickness,
    roughness: options.roughness,
    envMap: hdrEquirect,
    envMapIntensity: options.envMapIntensity,
    clearcoat: options.clearcoat,
    clearcoatRoughness: options.clearcoatRoughness,
    normalScale: new THREE.Vector2(options.normalScale),
    normalMap: normalMapTexture,
    clearcoatNormalMap: normalMapTexture,
    clearcoatNormalScale: new THREE.Vector2(options.clearcoatNormalScale),
  });

  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material)
  );

  meshes.forEach((mesh, i) => {
    scene.add(mesh);
    mesh.position.set(...positions[i]);
  });

  // Add dragon GLTF model
  new THREE.GLTFLoader().load("src/dragon.glb", (gltf) => {
    const dragon = gltf.scene.children.find((mesh) => mesh.name === "Dragon");

    // Just copy the geometry from the loaded model
    const geometry = dragon.geometry.clone();

    // Adjust geometry to suit our scene
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, -4, 0);

    // Create a new mesh and place it in the scene
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...positions[3]);
    mesh.scale.set(0.135, 0.135, 0.135);
    meshes.push(mesh);
    scene.add(mesh);

    // Discard the model
    dragon.geometry.dispose();
    dragon.material.dispose();
  });

  // GUI
  // ---

  // Camera controls
  const cameraFolder = gui.addFolder('Camera Controls');
  cameraFolder.add(options, "enableSwoopingCamera").onChange((val) => {
    controls.enabled = !val;
    controls.reset();
    saveSettings();
  });
  cameraFolder.add(options, "enableRotation").onChange(() => {
    meshes.forEach((mesh) => mesh.rotation.set(0, 0, 0));
    saveSettings();
  });
  cameraFolder.open();

  // Material properties
  const materialFolder = gui.addFolder('Material Properties');
  materialFolder.add(options, "transmission", 0, 1, 0.01).onChange((val) => {
    material.transmission = val;
    saveSettings();
  });
  materialFolder.add(options, "thickness", 0, 5, 0.1).onChange((val) => {
    material.thickness = val;
    saveSettings();
  });
  materialFolder.add(options, "roughness", 0, 1, 0.01).onChange((val) => {
    material.roughness = val;
    saveSettings();
  });
  materialFolder.add(options, "envMapIntensity", 0, 5, 0.1).onChange((val) => {
    material.envMapIntensity = val;
    saveSettings();
  });
  materialFolder.add(options, "clearcoat", 0, 1, 0.01).onChange((val) => {
    material.clearcoat = val;
    saveSettings();
  });
  materialFolder.add(options, "clearcoatRoughness", 0, 1, 0.01).onChange((val) => {
    material.clearcoatRoughness = val;
    saveSettings();
  });
  materialFolder.add(options, "normalScale", 0, 5, 0.01).onChange((val) => {
    material.normalScale.set(val, val);
    saveSettings();
  });
  materialFolder.add(options, "clearcoatNormalScale", 0, 5, 0.01).onChange((val) => {
    material.clearcoatNormalScale.set(val, val);
    saveSettings();
  });
  materialFolder.add(options, "normalRepeat", 1, 4, 1).onChange((val) => {
    normalMapTexture.repeat.set(val, val);
    saveSettings();
  });
  materialFolder.open();

  // Foreground shine controls
  const foregroundFolder = gui.addFolder('Foreground Shine');
  foregroundFolder.add(options, "depthThreshold", 0, 1, 0.01).onChange((val) => {
    options.depthThreshold = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.depthThreshold) {
        mesh.material.uniforms.depthThreshold.value = val;
      }
    });
    saveSettings();
  });
  foregroundFolder.add(options, "foregroundShine", 0, 3, 0.05).onChange((val) => {
    options.foregroundShine = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.foregroundShine) {
        mesh.material.uniforms.foregroundShine.value = val;
      }
    });
    saveSettings();
  });
  foregroundFolder.add(options, "foregroundShininess", 1, 200, 1).onChange((val) => {
    options.foregroundShininess = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.foregroundShininess) {
        mesh.material.uniforms.foregroundShininess.value = val;
      }
    });
    saveSettings();
  });
  foregroundFolder.addColor(options, "foregroundSpecularColor").onChange((val) => {
    options.foregroundSpecularColor = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.foregroundSpecularColor) {
        mesh.material.uniforms.foregroundSpecularColor.value = new THREE.Vector3(...val);
      }
    });
    saveSettings();
  });
  foregroundFolder.open();

  // Strategic lighting controls
  const lightingFolder = gui.addFolder('Strategic Lighting');
  lightingFolder.add(options, "lightTopLeft", 0, 3, 0.05).onChange((val) => {
    options.lightTopLeft = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.lightTopLeft) {
        mesh.material.uniforms.lightTopLeft.value = val;
      }
    });
    saveSettings();
  });
  lightingFolder.add(options, "lightTopRight", 0, 3, 0.05).onChange((val) => {
    options.lightTopRight = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.lightTopRight) {
        mesh.material.uniforms.lightTopRight.value = val;
      }
    });
    saveSettings();
  });
  lightingFolder.add(options, "lightBottomLeft", 0, 3, 0.05).onChange((val) => {
    options.lightBottomLeft = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.lightBottomLeft) {
        mesh.material.uniforms.lightBottomLeft.value = val;
      }
    });
    saveSettings();
  });
  lightingFolder.add(options, "lightBottomRight", 0, 3, 0.05).onChange((val) => {
    options.lightBottomRight = val;
    // Update shader uniforms if using custom shader
    meshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.lightBottomRight) {
        mesh.material.uniforms.lightBottomRight.value = val;
      }
    });
    saveSettings();
  });
  lightingFolder.open();

  // Post-processing controls
  const postprocessing = gui.addFolder('Post Processing');
  postprocessing.add(options, "bloomThreshold", 0, 1, 0.01).onChange((val) => {
    bloomPass.threshold = val;
    saveSettings();
  });
  postprocessing.add(options, "bloomStrength", 0, 5, 0.01).onChange((val) => {
    bloomPass.strength = val;
    saveSettings();
  });
  postprocessing.add(options, "bloomRadius", 0, 1, 0.01).onChange((val) => {
    bloomPass.radius = val;
    saveSettings();
  });
  postprocessing.open();

  // Reset button
  const resetSettings = () => {
    // Reset to default values
    const defaults = {
      enableSwoopingCamera: false,
      enableRotation: true,
      transmission: 1,
      thickness: 1.2,
      roughness: 0.6,
      envMapIntensity: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      normalScale: 1,
      clearcoatNormalScale: 0.3,
      normalRepeat: 1,
      bloomThreshold: 0.85,
      bloomStrength: 0.5,
      bloomRadius: 0.33,
      foregroundShine: 0.8,
      foregroundShininess: 50,
      foregroundSpecularColor: [1.0, 0.9, 0.8],
      lightTopLeft: 0.7,
      lightTopRight: 0.5,
      lightBottomLeft: 0.3,
      lightBottomRight: 0.2,
      depthThreshold: 0.5,
    };

    // Apply defaults to options
    Object.assign(options, defaults);

    // Update GUI controllers
    for (const folder of Object.values(gui.__folders)) {
      for (const controller of folder.__controllers) {
        controller.updateDisplay();
      }
    }

    // Apply to materials
    material.transmission = options.transmission;
    material.thickness = options.thickness;
    material.roughness = options.roughness;
    material.envMapIntensity = options.envMapIntensity;
    material.clearcoat = options.clearcoat;
    material.clearcoatRoughness = options.clearcoatRoughness;
    material.normalScale.set(options.normalScale, options.normalScale);
    material.clearcoatNormalScale.set(options.clearcoatNormalScale, options.clearcoatNormalScale);
    normalMapTexture.repeat.set(options.normalRepeat, options.normalRepeat);

    // Apply to bloom pass
    bloomPass.threshold = options.bloomThreshold;
    bloomPass.strength = options.bloomStrength;
    bloomPass.radius = options.bloomRadius;

    // Reset controls
    controls.enabled = !options.enableSwoopingCamera;
    controls.reset();

    // Reset meshes rotation
    if (!options.enableRotation) {
      meshes.forEach((mesh) => mesh.rotation.set(0, 0, 0));
    }

    // Clear saved settings
    localStorage.removeItem('canvasSketchSettings');
  };

  const utilsFolder = gui.addFolder('Utilities');
  utilsFolder.add({ resetSettings }, 'resetSettings');
  utilsFolder.open();

  // Update
  // ------

  const update = (time, deltaTime) => {
    const ROTATE_TIME = 10; // Time in seconds for a full rotation
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const rotateX = (deltaTime / ROTATE_TIME) * Math.PI * 2;
    const rotateY = (deltaTime / ROTATE_TIME) * Math.PI * 2;

    if (options.enableRotation) {
      meshes.forEach((mesh) => {
        mesh.rotateOnWorldAxis(xAxis, rotateX);
        mesh.rotateOnWorldAxis(yAxis, rotateY);
      });
    }

    if (options.enableSwoopingCamera) {
      camera.position.x = Math.sin((time / 10) * Math.PI * 2) * 2;
      camera.position.y = Math.cos((time / 10) * Math.PI * 2) * 2;
      camera.position.z = 4;
      camera.lookAt(scene.position);
    }
  };

  // Lifecycle
  // ---------

  return {
    resize({ canvas, pixelRatio, viewportWidth, viewportHeight }) {
      const dpr = Math.min(pixelRatio, 2); // Cap DPR scaling to 2x

      canvas.width = viewportWidth * dpr;
      canvas.height = viewportHeight * dpr;
      canvas.style.width = viewportWidth + "px";
      canvas.style.height = viewportHeight + "px";

      bloomPass.resolution.set(viewportWidth, viewportHeight);

      renderer.setPixelRatio(dpr);
      renderer.setSize(viewportWidth, viewportHeight);

      composer.setPixelRatio(dpr);
      composer.setSize(viewportWidth, viewportHeight);

      camera.aspect = viewportWidth / viewportHeight;
      camera.updateProjectionMatrix();
    },
    render({ time, deltaTime }) {
      stats.begin();
      controls.update();
      update(time, deltaTime);
      // renderer.render(scene, camera);
      composer.render();
      stats.end();
    },
    unload() {
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      hdrEquirect.dispose();
      controls.dispose();
      renderer.dispose();
      bloomPass.dispose();
      gui.destroy();
      document.body.removeChild(stats.dom);
    },
  };
};

canvasSketch(sketch, settings);
