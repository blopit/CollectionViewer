// Initialize Three.js and DOM elements
const card = document.getElementById('card');
const sceneEl = document.querySelector('.scene');
const debug = document.getElementById('debug');
const canvas = document.getElementById('videoCanvas');
const colorVideo = document.getElementById('colorVideo');
const depthVideo = document.getElementById('depthVideo');
const processingOverlay = document.getElementById('processing-overlay');
const statusText = processingOverlay.querySelector('.status-text');
const progressBarFill = processingOverlay.querySelector('.progress-bar-fill');

// Settings panel elements
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const effectStrengthInput = document.getElementById('effect-strength');
const shineStrengthInput = document.getElementById('shine-strength');
const depthContrastInput = document.getElementById('depth-contrast');
const depthSmoothingInput = document.getElementById('depth-smoothing');

// Three.js globals
let geometry;
let material;
let mesh;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ 
  canvas, 
  antialias: true,
  alpha: true
});

// Add lights
const pointLight = new THREE.PointLight(0xffffff, 1, 10);
pointLight.position.set(0, 0, 1);
scene.add(pointLight);

const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
frontLight.position.set(0, 0, 2);
scene.add(frontLight);

const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
topLight.position.set(0, 2, 1);
scene.add(topLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Settings that can be adjusted
const settings = {
  effectStrength: 2.5,
  shineStrength: 0.8,
  depthContrast: 2.0,
  depthSmoothing: 0.5,  // New setting for depth smoothing
  rotationX: 0,
  rotationY: 0
};

// Track video state
let isPlaying = false;

// Hide debug overlay initially
if (debug) {
  debug.style.display = 'none';
}

// Add camera and touch state
const initialCameraZ = -5;
let currentCameraZ = -5;
const MIN_CAMERA_Z = -8;
const MAX_CAMERA_Z = -2;
let initialPinchDistance = 0;
let lastTouchCenter = { x: 0, y: 0 };
const objectPosition = { x: 0, y: 0, z: 0 };
const MAX_TRANSLATION = 2.0;
const TRANSLATION_SENSITIVITY = 8.0; // Increased sensitivity

// Update debug info
function updateDebugInfo(info) {
  debug.innerHTML = `
    Video: ${info.videoWidth}x${info.videoHeight}<br>
    Canvas: ${info.canvasWidth}x${info.canvasHeight}<br>
    Mesh: ${info.meshWidth}x${info.meshHeight}<br>
    Screen: ${info.screenWidth}x${info.screenHeight}<br>
    Aspect: ${info.aspect.toFixed(4)}<br>
    Color Video: ${!colorVideo.paused ? 'Playing' : 'Paused'} (${colorVideo.readyState})<br>
    Depth Video: ${!depthVideo.paused ? 'Playing' : 'Paused'} (${depthVideo.readyState})<br>
    Effect Strength: ${settings.effectStrength.toFixed(2)}<br>
    Shine: ${settings.shineStrength.toFixed(2)}<br>
    Contrast: ${settings.depthContrast.toFixed(2)}<br>
    Camera Z: ${info.cameraZ || currentCameraZ.toFixed(2)}
  `;
}

// Function to create or update mesh with improved shaders
function initOrUpdateMesh() {
  const videoWidth = colorVideo.videoWidth;
  const videoHeight = colorVideo.videoHeight;
  
  if (!videoWidth || !videoHeight) {
    console.warn('Video dimensions not available yet');
    return false;
  }

  const aspect = videoWidth / videoHeight;

  // High resolution mesh for detailed displacement
  const segmentsX = 512;
  const segmentsY = Math.floor(segmentsX / aspect);
  
  if (!geometry) {
    // Make the mesh larger to enhance the pop-out effect
    geometry = new THREE.PlaneGeometry(3 * aspect, 3, segmentsX - 1, segmentsY - 1);
    geometry.computeVertexNormals();
  }

  const colorTexture = new THREE.VideoTexture(colorVideo);
  const depthTexture = new THREE.VideoTexture(depthVideo);

  const textures = [colorTexture, depthTexture];
  for (const texture of textures) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.format = THREE.RGBAFormat;
    texture.generateMipmaps = false;
  }

  // Enhanced shader material with clearcoat and proper displacement
  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: {
        colorMap: { value: colorTexture },
        depthMap: { value: depthTexture },
        effectStrength: { value: settings.effectStrength },
        shineStrength: { value: settings.shineStrength },
        depthContrast: { value: settings.depthContrast },
        depthSmoothing: { value: settings.depthSmoothing },
        time: { value: 0.0 },
        rotationX: { value: 0.0 },
        rotationY: { value: 0.0 },
        clearcoatRoughness: { value: 0.1 },
        clearcoatNormal: { value: 0.5 },
        objectPosition: { value: new THREE.Vector3(0, 0, 0) }
      },
      vertexShader: `
        uniform sampler2D depthMap;
        uniform float effectStrength;
        uniform float depthContrast;
        uniform float depthSmoothing;
        uniform float rotationX;
        uniform float rotationY;
        uniform vec3 objectPosition;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying float vDepthValue;
        
        float sampleDepthValue(vec2 uv) {
          vec4 depthColor = texture2D(depthMap, uv);
          return (depthColor.r + depthColor.g + depthColor.b) / 3.0;
        }
        
        float getSmoothedDepth(vec2 uv) {
          float center = sampleDepthValue(uv);
          
          float pixelSize = 1.0 / 512.0;
          float sum = center;
          float weight = 1.0;
          
          for(float x = -2.0; x <= 2.0; x++) {
            for(float y = -2.0; y <= 2.0; y++) {
              if(x == 0.0 && y == 0.0) continue;
              
              vec2 offset = vec2(x, y) * pixelSize;
              float sampleValue = sampleDepthValue(uv + offset);
              
              float dist = length(vec2(x, y));
              float sampleWeight = exp(-dist * (1.0 - depthSmoothing) * 0.5);
              
              sum += sampleValue * sampleWeight;
              weight += sampleWeight;
            }
          }
          
          return sum / weight;
        }
        
        mat4 rotationMatrix(vec3 axis, float angle) {
          axis = normalize(axis);
          float s = sin(angle);
          float c = cos(angle);
          float oc = 1.0 - c;
          
          return mat4(
            oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
            oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
            oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
            0.0,                                 0.0,                                 0.0,                                 1.0
          );
        }
        
        void main() {
          vUv = vec2(1.0 - uv.x, 1.0 - uv.y);
          
          float rawDepth = getSmoothedDepth(vUv);
          float depth = 1.0 - pow(rawDepth, depthContrast);
          vDepthValue = depth;
          
          vec3 pos = position;
          vec3 transformedNormal = normalize(normalMatrix * normal);
          
          // Apply displacement along normal
          float displacement = depth * effectStrength;
          pos += normal * displacement;
          
          // Move pivot point to base of the depth
          float baseOffset = 1.5 - effectStrength;
          pos.y += baseOffset;
          
          // Apply rotations around base point
          mat4 rotX = rotationMatrix(vec3(1.0, 0.0, 0.0), rotationX);
          mat4 rotY = rotationMatrix(vec3(0.0, 1.0, 0.0), rotationY);
          
          vec4 centeredPos = vec4(pos, 1.0);
          centeredPos = rotY * rotX * centeredPos;
          pos = centeredPos.xyz;
          
          // Move back and apply object translation
          pos.y -= baseOffset;
          pos += objectPosition;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          vViewPosition = -mvPosition.xyz;
          vNormal = normalize(normalMatrix * mat3(rotY * rotX) * normal);
          vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
        }
      `,
      fragmentShader: `
        uniform sampler2D colorMap;
        uniform float shineStrength;
        uniform float clearcoatRoughness;
        uniform float clearcoatNormal;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying float vDepthValue;
        
        void main() {
          vec4 diffuseColor = texture2D(colorMap, vUv);
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          
          // Base layer lighting
          vec3 lightPos = vec3(2.0, 2.0, 2.0);
          vec3 lightDir = normalize(lightPos - vWorldPosition);
          float diff = max(dot(normal, lightDir), 0.0);
          
          // Specular
          vec3 halfwayDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0) * shineStrength;
          
          // Clearcoat layer
          float clearcoatDiff = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
          vec3 clearcoatReflect = reflect(-viewDir, normal);
          float clearcoatSpec = pow(max(dot(clearcoatReflect, lightDir), 0.0), 
                                  mix(16.0, 128.0, 1.0 - clearcoatRoughness));
          
          // Fresnel
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          
          // Ambient occlusion from depth
          float ao = 1.0 - (vDepthValue * 0.5);
          
          // Combine all lighting components
          vec3 ambient = vec3(0.2) * ao;
          vec3 diffuse = vec3(0.7) * diff;
          vec3 specular = vec3(0.3) * spec;
          vec3 clearcoat = vec3(0.5) * clearcoatSpec * clearcoatDiff;
          vec3 fresnelColor = vec3(0.2) * fresnel;
          
          vec3 finalColor = (ambient + diffuse + specular + clearcoat + fresnelColor) * diffuseColor.rgb;
          
          gl_FragColor = vec4(finalColor, diffuseColor.a);
        }
      `,
      side: THREE.DoubleSide,
      derivatives: true
    });
  }

  if (!mesh) {
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  }

  camera.position.set(0, 0, -3);
  camera.lookAt(0, 0, 0);

  return true;
}

// Function to update dimensions and debug info
function updateDimensions() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const videoWidth = colorVideo.videoWidth;
  const videoHeight = colorVideo.videoHeight;

  if (!videoWidth || !videoHeight) return;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  updateDebugInfo({
    videoWidth,
    videoHeight,
    canvasWidth: width,
    canvasHeight: height,
    meshWidth: mesh ? mesh.geometry.parameters.width : 0,
    meshHeight: mesh ? mesh.geometry.parameters.height : 0,
    screenWidth: width,
    screenHeight: height,
    aspect: videoWidth / videoHeight
  });
}

// Helper to convert screen coordinates to 3D space
function screenToWorld(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  const normalizedX = ((x - rect.left) / rect.width) * 2 - 1;
  const normalizedY = -((y - rect.top) / rect.height) * 2 + 1;

  const vector = new THREE.Vector3(normalizedX, normalizedY, 0.5);
  vector.unproject(camera);
  
  const dir = vector.sub(camera.position).normalize();
  const distance = -camera.position.z / dir.z;
  
  const pos = camera.position.clone().add(dir.multiplyScalar(distance));
  
  pos.x = Math.max(-2, Math.min(2, pos.x));
  pos.y = Math.max(-2, Math.min(2, pos.y));
  pos.z = 1;

  return pos;
}

// Update light position based on interaction
function updateLightPosition(x, y) {
  const worldPos = screenToWorld(x, y);
  pointLight.position.copy(worldPos);
  
  // Update shader uniforms if needed
  if (material?.uniforms) {
    material.uniforms.effectStrength.value = settings.effectStrength;
    material.uniforms.shineStrength.value = settings.shineStrength;
    material.uniforms.depthContrast.value = settings.depthContrast;
  }
}

// Toggle video playback
async function togglePlayback() {
  try {
    if (!colorVideo.readyState >= 2 || !depthVideo.readyState >= 2) {
      console.log('Videos not ready yet');
      return;
    }

    if (isPlaying) {
      await Promise.all([
        colorVideo.pause(),
        depthVideo.pause()
      ]);
      isPlaying = false;
    } else {
      await Promise.all([
        colorVideo.play(),
        depthVideo.play()
      ]);
      isPlaying = true;
    }
  } catch (error) {
    console.error('Error toggling playback:', error);
  }
}

// Initialize everything
function init() {
  // Set initial renderer size
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Set initial camera position further back
  camera.position.z = initialCameraZ;
  camera.lookAt(0, 0, 0);

  // Setup event listeners
  window.addEventListener('resize', updateDimensions);
  
  // Touch handling
  let isTouch = false;
  let touchStartTime = 0;
  let hasMoved = false;
  
  function handleTouchStart(e) {
    isTouch = true;
    touchStartTime = Date.now();
    hasMoved = false;
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      updateTilt(touch.clientX, touch.clientY, true);
    } else if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Store initial pinch distance and center point
      initialPinchDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      lastTouchCenter = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    hasMoved = true;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      updateTilt(touch.clientX, touch.clientY, true);
    } else if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Calculate new center point
      const currentCenter = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
      };
      
      // Calculate translation (inverted directions for natural feel)
      const deltaX = -(currentCenter.x - lastTouchCenter.x) / window.innerWidth * TRANSLATION_SENSITIVITY;
      const deltaY = (currentCenter.y - lastTouchCenter.y) / window.innerHeight * TRANSLATION_SENSITIVITY;
      
      // Update object position with bounds
      objectPosition.x = Math.max(-MAX_TRANSLATION, Math.min(MAX_TRANSLATION, objectPosition.x + deltaX));
      objectPosition.y = Math.max(-MAX_TRANSLATION, Math.min(MAX_TRANSLATION, objectPosition.y + deltaY));
      
      if (material?.uniforms) {
        material.uniforms.objectPosition.value.set(objectPosition.x, objectPosition.y, objectPosition.z);
      }
      
      // Store new center point
      lastTouchCenter = currentCenter;
      
      // Handle pinch zoom
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      if (initialPinchDistance > 0) {
        const pinchDelta = currentDistance / initialPinchDistance;
        const newCameraZ = Math.max(MIN_CAMERA_Z, Math.min(MAX_CAMERA_Z, initialCameraZ * (1 / pinchDelta)));
        
        if (newCameraZ !== currentCameraZ) {
          currentCameraZ = newCameraZ;
          camera.position.z = currentCameraZ;
          camera.updateProjectionMatrix();
        }
      }
    }
  }

  function handleTouchEnd(e) {
    const touchDuration = Date.now() - touchStartTime;
    
    // If it was a quick tap without much movement, toggle playback
    if (!hasMoved && touchDuration < 200) {
      togglePlayback();
    }
    
    if (!e.touches || e.touches.length === 0) {
      // Only reset tilt, keep translation
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--rotateX', '0deg');
        document.documentElement.style.setProperty('--rotateY', '0deg');
      });
      initialPinchDistance = 0;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      updateTilt(touch.clientX, touch.clientY, true);
    }
  }

  // Mouse handling
  function handleMouseMove(e) {
    if (!isTouch) {
      updateTilt(e.clientX, e.clientY);
    }
  }

  // Add event listeners
  sceneEl.addEventListener('touchstart', handleTouchStart, { passive: false });
  sceneEl.addEventListener('touchmove', handleTouchMove, { passive: false });
  sceneEl.addEventListener('touchend', handleTouchEnd);
  sceneEl.addEventListener('touchcancel', handleTouchEnd);
  sceneEl.addEventListener('mousemove', handleMouseMove);

  // Settings panel
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('visible');
  });

  // Random video button
  const randomVideoBtn = document.getElementById('random-video-btn');
  randomVideoBtn.addEventListener('click', async () => {
    const success = await testRandomVideoAPI();
    if (success) {
      // Reset video loading state
      videosLoaded = 0;
    }
  });

  // Settings controls
  effectStrengthInput.addEventListener('input', (e) => {
    settings.effectStrength = Number.parseFloat(e.target.value);
    if (material?.uniforms) {
      material.uniforms.effectStrength.value = settings.effectStrength;
    }
  });

  shineStrengthInput.addEventListener('input', (e) => {
    settings.shineStrength = Number.parseFloat(e.target.value);
    if (material?.uniforms) {
      material.uniforms.shineStrength.value = settings.shineStrength;
    }
  });

  depthContrastInput.addEventListener('input', (e) => {
    settings.depthContrast = Number.parseFloat(e.target.value);
    if (material?.uniforms) {
      material.uniforms.depthContrast.value = settings.depthContrast;
    }
  });

  depthSmoothingInput.addEventListener('input', (e) => {
    settings.depthSmoothing = Number.parseFloat(e.target.value);
    if (material?.uniforms) {
      material.uniforms.depthSmoothing.value = settings.depthSmoothing;
    }
  });

  // Video loading
  let videosLoaded = 0;
  function handleVideoLoad() {
    videosLoaded++;
    if (videosLoaded === 2) {
      // Ensure both videos loop
      colorVideo.loop = true;
      depthVideo.loop = true;
      
      // Reset videos to start
      colorVideo.currentTime = 0;
      depthVideo.currentTime = 0;
      
      // Play both videos and ensure sync
      Promise.all([
        colorVideo.play().then(() => {
          isPlaying = true;
          // Wait for color video to actually start
          return new Promise(resolve => {
            const checkPlaying = () => {
              if (colorVideo.currentTime > 0) {
                resolve();
              } else {
                requestAnimationFrame(checkPlaying);
              }
            };
            checkPlaying();
          });
        }),
        depthVideo.play()
      ]).then(() => {
        console.log('Videos playing');
        // Ensure initial sync
        depthVideo.currentTime = colorVideo.currentTime;
        initOrUpdateMesh();
        updateDimensions();
        syncFrames();  // Start frame sync
        animate();
        // Hide processing overlay
        showProcessing(false);
      }).catch(error => {
        console.error('Error playing videos:', error);
        showProcessing(true, 'Error playing videos', 100);
        setTimeout(() => showProcessing(false), 3000);
      });
    }
  }

  colorVideo.addEventListener('loadedmetadata', handleVideoLoad);
  depthVideo.addEventListener('loadedmetadata', handleVideoLoad);

  // Add loop event listeners to handle sync at loop points
  colorVideo.addEventListener('loop', () => {
    if (Math.abs(colorVideo.currentTime - depthVideo.currentTime) > 0.1) {
      depthVideo.currentTime = colorVideo.currentTime;
    }
  });

  depthVideo.addEventListener('loop', () => {
    if (Math.abs(depthVideo.currentTime - colorVideo.currentTime) > 0.1) {
      depthVideo.currentTime = colorVideo.currentTime;
    }
  });
}

// Frame synchronization
function syncFrames() {
  // Check if videos are out of sync
  const drift = Math.abs(colorVideo.currentTime - depthVideo.currentTime);
  if (drift > 0.01) { // More than 10ms drift
    depthVideo.currentTime = colorVideo.currentTime;
  }
  requestAnimationFrame(syncFrames);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Ensure videos stay in sync
  if (colorVideo.readyState >= 2 && depthVideo.readyState >= 2) {
    const drift = Math.abs(colorVideo.currentTime - depthVideo.currentTime);
    if (drift > 0.01) {
      depthVideo.currentTime = colorVideo.currentTime;
    }
  }

  // Update uniforms
  if (material?.uniforms) {
    material.uniforms.effectStrength.value = settings.effectStrength;
    material.uniforms.shineStrength.value = settings.shineStrength;
    material.uniforms.depthContrast.value = settings.depthContrast;
    material.uniforms.depthSmoothing.value = settings.depthSmoothing;
    material.uniforms.time.value = performance.now() / 1000;
  }
  
  renderer.render(scene, camera);
}

// Update tilt using Three.js rotation
function updateTilt(x, y, isTouch = false) {
  const rect = sceneEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const multiplier = isTouch ? 2 : 1;
  const rotationY = ((x - centerX) / (rect.width / 2) * Math.PI / 6) * multiplier;
  const rotationX = ((y - centerY) / (rect.height / 2) * Math.PI / 6) * multiplier;
  
  settings.rotationX = rotationX;
  settings.rotationY = rotationY;
  
  if (material?.uniforms) {
    material.uniforms.rotationX.value = rotationX;
    material.uniforms.rotationY.value = rotationY;
  }
}

// Show/hide processing overlay
function showProcessing(show, status = '', progress = 0) {
  processingOverlay.style.display = show ? 'block' : 'none';
  if (status) statusText.textContent = status;
  progressBarFill.style.width = `${progress}%`;
}

// Test random video API
async function testRandomVideoAPI() {
  try {
    showProcessing(true, 'Fetching random video...', 10);
    
    const response = await fetch('https://shrenp.com/fp17545703/random_video_api.php');
    const data = await response.json();
    console.log('Random Video API Response:', data);
    
    if (!data.url) {
      throw new Error('No video URL in response');
    }

    showProcessing(true, 'Loading video...', 30);
    
    // Check if depth map exists by appending _depth to the filename
    const videoUrl = data.url;
    const videoPath = videoUrl.substring(0, videoUrl.lastIndexOf('.'));
    const videoExt = videoUrl.substring(videoUrl.lastIndexOf('.'));
    const depthUrl = `${videoPath}_depth${videoExt}`;

    // Try to fetch the depth map
    try {
      const depthResponse = await fetch(depthUrl, { method: 'HEAD' });
      if (depthResponse.ok) {
        // Depth map exists, use it
        showProcessing(true, 'Loading depth map...', 60);
        colorVideo.src = videoUrl;
        depthVideo.src = depthUrl;
        showProcessing(true, 'Starting playback...', 90);
        return true;
      }
    } catch (error) {
      console.log('No existing depth map found, generating...');
    }

    // No depth map found, generate one
    showProcessing(true, 'Generating depth map...', 40);
    
    try {
      // Call depth generation API
      const formData = new FormData();
      formData.append('video_url', videoUrl);
      
      const depthGenResponse = await fetch('https://shrenp.com/depth_generation_api.php', {
        method: 'POST',
        body: formData
      });
      
      if (!depthGenResponse.ok) {
        throw new Error('Depth generation failed');
      }
      
      const depthGenData = await depthGenResponse.json();
      
      if (!depthGenData.depth_url) {
        throw new Error('No depth map URL in response');
      }
      
      showProcessing(true, 'Loading generated depth map...', 80);
      
      // Use the generated depth map
      colorVideo.src = videoUrl;
      depthVideo.src = depthGenData.depth_url;
      
      showProcessing(true, 'Starting playback...', 90);
      return true;
    } catch (error) {
      console.error('Error generating depth map:', error);
      showProcessing(true, 'Error generating depth map', 100);
      setTimeout(() => showProcessing(false), 3000);
      return false;
    }
  } catch (error) {
    console.error('Error fetching random videos:', error);
    showProcessing(true, 'Error loading video', 100);
    setTimeout(() => showProcessing(false), 3000);
    return false;
  }
}

// Start everything
init();
// Test the random video API
testRandomVideoAPI(); 