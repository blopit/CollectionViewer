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
const pointLight = new THREE.PointLight(0xffffff, 2, 10);
pointLight.position.set(0, 0, 1);
scene.add(pointLight);

const frontLight = new THREE.DirectionalLight(0xffffff, 1.2);
frontLight.position.set(0, 0, 2);
scene.add(frontLight);

const topLight = new THREE.DirectionalLight(0xffffff, 0.8);
topLight.position.set(0, 2, 1);
scene.add(topLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// Settings that can be adjusted
const settings = {
  effectStrength: 2.5,
  shineStrength: 0.8,
  depthContrast: 2.0,
  depthSmoothing: 0.5,  // New setting for depth smoothing
  rotationX: 0,
  rotationY: 0,
  objectPosition: new THREE.Vector3(0, 0, 0) // Add object position to settings
};

// Track video state
let isPlaying = false;

// Hide debug overlay
if (debug) {
  debug.style.display = 'none';
}

// Add camera and touch state
let initialCameraZ = -5;
let currentCameraZ = -5;
const MIN_CAMERA_Z = -8;
const MAX_CAMERA_Z = -2;
let initialPinchDistance = 0;
let lastTouchCenter = { x: 0, y: 0 };
let initialTouchPosition = { x: 0, y: 0 }; // Store initial touch position for joystick-like tilting
const objectPosition = { x: 0, y: 0, z: 0 };
const MAX_TRANSLATION = 2.0;
const TRANSLATION_SENSITIVITY = 8.0; // Increased sensitivity
const TILT_SENSITIVITY = 0.5; // Sensitivity for joystick-like tilting

// Update debug info
function updateDebugInfo(info) {
  // Skip updating debug info since debug overlay has been removed
  // This prevents errors when the debug element doesn't exist
  return;
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

  // Optimized shader material
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
        varying float vDepthValue;

        float getSmoothedDepth(vec2 uv) {
          vec4 depthColor = texture2D(depthMap, uv);
          float depth = (depthColor.r + depthColor.g + depthColor.b) / 3.0;
          
          // Simple 3x3 blur for smoothing
          float pixelSize = 1.0 / 256.0;
          float sum = depth;
          float weight = 1.0;
          
          for(float x = -1.0; x <= 1.0; x++) {
            for(float y = -1.0; y <= 1.0; y++) {
              if(x == 0.0 && y == 0.0) continue;
              vec2 offset = vec2(x, y) * pixelSize * depthSmoothing;
              vec4 sampleColor = texture2D(depthMap, uv + offset);
              float sampleDepth = (sampleColor.r + sampleColor.g + sampleColor.b) / 3.0;
              sum += sampleDepth;
              weight += 1.0;
            }
          }
          
          return sum / weight;
        }

        void main() {
          vUv = vec2(1.0 - uv.x, 1.0 - uv.y);
          
          float depth = getSmoothedDepth(vUv);
          depth = 1.0 - pow(depth, depthContrast);
          vDepthValue = depth;

          // Apply displacement along normal
          vec3 pos = position + normal * (depth * effectStrength);
          
          // Apply rotations
          float cosX = cos(rotationX);
          float sinX = sin(rotationX);
          float cosY = cos(rotationY);
          float sinY = sin(rotationY);
          
          mat3 rotMatrix = mat3(
            cosY, 0.0, -sinY,
            sinX * sinY, cosX, sinX * cosY,
            cosX * sinY, -sinX, cosX * cosY
          );
          
          pos = rotMatrix * pos;
          
          // Apply translation from touch interaction
          pos += objectPosition;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          vViewPosition = -mvPosition.xyz;
          vNormal = normalize(normalMatrix * rotMatrix * normal);
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
          
          // Basic lighting with increased intensity
          vec3 lightDir = normalize(vec3(2.0, 2.0, 2.0));
          float diff = max(dot(normal, lightDir), 0.0) * 1.2; // Increased diffuse intensity
          
          // Simple specular with increased intensity
          vec3 halfwayDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(normal, halfwayDir), 0.0), 16.0) * shineStrength * 1.5; // Increased specular intensity
          
          // Ambient occlusion with less darkening
          float ao = mix(1.0, 0.7, vDepthValue); // Changed from 0.5 to 0.7 to reduce darkening
          
          // Final color with increased ambient light
          vec3 lighting = vec3(0.3 * ao + 0.8 * diff + 0.4 * spec); // Increased ambient and diffuse components
          gl_FragColor = vec4(diffuseColor.rgb * lighting, diffuseColor.a);
        }
      `,
      side: THREE.DoubleSide
    });
  } else {
    // Update existing material uniforms
    material.uniforms.colorMap.value = colorTexture;
    material.uniforms.depthMap.value = depthTexture;
  }

  if (!mesh) {
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  }

  camera.position.set(0, 0, -3);
  camera.lookAt(0, 0, 0);

  return true;
}

// Function to update dimensions
function updateDimensions() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const videoWidth = colorVideo.videoWidth;
  const videoHeight = colorVideo.videoHeight;

  if (!videoWidth || !videoHeight) return;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Debug info update removed
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
      // Store initial touch position for joystick-like tilting
      initialTouchPosition = {
        x: touch.clientX,
        y: touch.clientY
      };
      // We'll calculate deltas from this initial position
      // but maintain the current rotation
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

      // Calculate delta from initial touch position (joystick-like behavior)
      const deltaX = touch.clientX - initialTouchPosition.x;
      const deltaY = touch.clientY - initialTouchPosition.y;

      // Store current position as new initial position for next move
      initialTouchPosition = {
        x: touch.clientX,
        y: touch.clientY
      };

      // Apply tilt based on the delta from initial position
      // Normalize by screen dimensions and apply sensitivity
      const rotationY = deltaX / window.innerWidth * Math.PI * TILT_SENSITIVITY;
      const rotationX = deltaY / window.innerHeight * Math.PI * TILT_SENSITIVITY;

      // Update tilt with calculated rotations
      updateJoystickTilt(rotationX, rotationY);
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
      settings.objectPosition.x = Math.max(-MAX_TRANSLATION, Math.min(MAX_TRANSLATION, settings.objectPosition.x + deltaX));
      settings.objectPosition.y = Math.max(-MAX_TRANSLATION, Math.min(MAX_TRANSLATION, settings.objectPosition.y + deltaY));

      if (material?.uniforms) {
        material.uniforms.objectPosition.value.copy(settings.objectPosition);
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
      initialPinchDistance = 0;
      // Store current camera Z as initial for next pinch
      initialCameraZ = currentCameraZ;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      initialTouchPosition = {
        x: touch.clientX,
        y: touch.clientY
      };
    }
  }

  // Mouse handling
  let isMouseDown = false;
  let initialMousePosition = { x: 0, y: 0 };

  function handleMouseDown(e) {
    if (!isTouch) {
      isMouseDown = true;
      initialMousePosition = {
        x: e.clientX,
        y: e.clientY
      };

      // We'll calculate deltas from this initial position
      // but maintain the current rotation
    }
  }

  function handleMouseMove(e) {
    if (!isTouch && isMouseDown) {
      // Calculate delta from initial mouse position
      const deltaX = e.clientX - initialMousePosition.x;
      const deltaY = e.clientY - initialMousePosition.y;

      // Store current position as new initial position for next move
      initialMousePosition = {
        x: e.clientX,
        y: e.clientY
      };

      // Apply tilt based on the delta from initial position
      const rotationY = deltaX / window.innerWidth * Math.PI * TILT_SENSITIVITY;
      const rotationX = deltaY / window.innerHeight * Math.PI * TILT_SENSITIVITY;

      // Update tilt with calculated rotations
      updateJoystickTilt(rotationX, rotationY);
    }
  }

  function handleMouseUp() {
    if (!isTouch) {
      isMouseDown = false;
      // Keep the current tilt when mouse is released (don't reset)
    }
  }

  // Add event listeners
  sceneEl.addEventListener('touchstart', handleTouchStart, { passive: false });
  sceneEl.addEventListener('touchmove', handleTouchMove, { passive: false });
  sceneEl.addEventListener('touchend', handleTouchEnd);
  sceneEl.addEventListener('touchcancel', handleTouchEnd);

  // Add mouse event listeners for joystick-like behavior
  sceneEl.addEventListener('mousedown', handleMouseDown);
  sceneEl.addEventListener('mousemove', handleMouseMove);
  sceneEl.addEventListener('mouseup', handleMouseUp);
  sceneEl.addEventListener('mouseleave', handleMouseUp);

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
    // Only increment if we haven't reached max
    if (videosLoaded < 2) {
      videosLoaded++;
      console.log(`Video loaded (${videosLoaded}/2):`, this.src);
    }

    if (videosLoaded === 2) {
      console.log('Both videos loaded, preparing playback');
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
          console.log('Color video playing');
          // Wait for color video to actually start
          return new Promise(resolve => {
            const checkPlaying = () => {
              if (colorVideo.currentTime > 0) {
                console.log('Color video confirmed playing at:', colorVideo.currentTime);
                resolve();
              } else {
                requestAnimationFrame(checkPlaying);
              }
            };
            checkPlaying();
          });
        }),
        depthVideo.play().then(() => {
          console.log('Depth video playing');
        })
      ]).then(() => {
        console.log('Both videos playing, initializing 3D');
        // Initial sync
        depthVideo.currentTime = colorVideo.currentTime;
        console.log('Videos synced at time:', colorVideo.currentTime);

        // Create or update mesh with lower resolution for better performance
        if (!geometry) {
          const videoWidth = colorVideo.videoWidth;
          const videoHeight = colorVideo.videoHeight;
          const aspect = videoWidth / videoHeight;
          const segmentsX = 256; // Reduced from 512 for better performance
          const segmentsY = Math.floor(segmentsX / aspect);
          geometry = new THREE.PlaneGeometry(3 * aspect, 3, segmentsX - 1, segmentsY - 1);
          geometry.computeVertexNormals();
        }

        initOrUpdateMesh();
        updateDimensions();
        syncFrames();  // Start frame sync
        animate();
        // Hide processing overlay
        showProcessing(false);
      }).catch(error => {
        console.error('Error during video playback setup:', error);
        showProcessing(true, `Playback error: ${error.message}`, 100);
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

  // Add error handlers for videos
  colorVideo.addEventListener('error', (e) => {
    console.error('Color video error:', e.target.error);
    showProcessing(true, `Color video error: ${e.target.error.message}`, 100);
    setTimeout(() => showProcessing(false), 3000);
  });

  depthVideo.addEventListener('error', (e) => {
    console.error('Depth video error:', e.target.error);
    showProcessing(true, `Depth video error: ${e.target.error.message}`, 100);
    setTimeout(() => showProcessing(false), 3000);
  });
}

// Frame synchronization
function syncFrames() {
  // Check if videos are out of sync
  const drift = Math.abs(colorVideo.currentTime - depthVideo.currentTime);
  if (drift > 0.1) { // Increased threshold to reduce constant adjustments
    // Only sync if drift is significant
    depthVideo.currentTime = colorVideo.currentTime;
    console.log('Syncing videos, drift:', drift);
  }
  requestAnimationFrame(syncFrames);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Only check sync in animation loop if videos are playing
  if (isPlaying && colorVideo.readyState >= 2 && depthVideo.readyState >= 2) {
    const drift = Math.abs(colorVideo.currentTime - depthVideo.currentTime);
    if (drift > 0.1) { // Increased threshold
      depthVideo.currentTime = colorVideo.currentTime;
      console.log('Syncing in animation loop, drift:', drift);
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

// Update tilt using Three.js rotation based on absolute position
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

// Update tilt using joystick-like behavior (relative to initial touch)
function updateJoystickTilt(rotationX, rotationY) {
  // Apply maximum tilt limits
  const MAX_TILT = Math.PI / 4; // 45 degrees max tilt

  // Add the new rotation to the current rotation (accumulate)
  let newRotationX = settings.rotationX + rotationX;
  let newRotationY = settings.rotationY + rotationY;

  // Clamp rotation values to prevent extreme tilting
  newRotationX = Math.max(-MAX_TILT, Math.min(MAX_TILT, newRotationX));
  newRotationY = Math.max(-MAX_TILT, Math.min(MAX_TILT, newRotationY));

  // Update settings and shader uniforms
  settings.rotationX = newRotationX;
  settings.rotationY = newRotationY;

  if (material?.uniforms) {
    material.uniforms.rotationX.value = newRotationX;
    material.uniforms.rotationY.value = newRotationY;
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

    let response;
    // Check if we're in local development first
    if (window.location.hostname === 'localhost') {
      console.log('Running in local development, using fallback videos');
      response = {
        ok: true,
        json: async () => ({
          url: 'http://localhost:5678/video.mp4',
          depth_url: 'http://localhost:5678/depth_video.mp4'
        })
      };
    } else {
      // If not localhost, try direct CORS request first
      try {
        response = await fetch('https://shrenp.com/fp17545703/random_video_api.php', {
          mode: 'cors',
          headers: {
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        console.log('Direct CORS request failed, trying proxy:', error);
        response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://shrenp.com/fp17545703/random_video_api.php')}`);
      }
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch random video: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Random Video API Response:', data);

    // Handle both direct API response and local development formats
    let videoUrl;
    let depthUrl;

    if (data.depth_url) {
      // Direct response with depth URL
      videoUrl = data.url;
      depthUrl = data.depth_url;
    } else if (data.url || data.file) {
      // Regular API response, need to check/generate depth map
      videoUrl = data.url || `https://shrenp.com/files/${data.file}`;
      const videoPath = videoUrl.substring(0, videoUrl.lastIndexOf('.'));
      const videoExt = videoUrl.substring(videoUrl.lastIndexOf('.'));
      depthUrl = `${videoPath}_depth${videoExt}`;
    } else {
      throw new Error('Invalid API response format');
    }

    console.log('Video URL:', videoUrl);
    console.log('Depth URL:', depthUrl);

    showProcessing(true, 'Checking video accessibility...', 20);

    // Check if video is accessible
    try {
      const videoCheck = await fetch(videoUrl, { method: 'HEAD' }).catch(() => ({ ok: false }));
      if (!videoCheck.ok && !videoUrl.startsWith('http://localhost')) {
        throw new Error(`Video not accessible: ${videoCheck.status} ${videoCheck.statusText}`);
      }
      console.log('Video is accessible');
    } catch (error) {
      console.error('Video accessibility check failed:', error);
      if (!videoUrl.startsWith('http://localhost')) {
        throw new Error('Video file not accessible');
      }
    }

    showProcessing(true, 'Checking for depth map...', 30);

    // Check if depth map exists or is provided directly
    let depthMapExists = false;
    try {
      if (data.depth_url) {
        depthMapExists = true;
      } else {
        const depthResponse = await fetch(depthUrl, { method: 'HEAD' }).catch(() => ({ ok: false }));
        depthMapExists = depthResponse.ok || depthUrl.startsWith('http://localhost');
      }
      console.log('Depth map exists:', depthMapExists);
    } catch (error) {
      console.log('No existing depth map found:', error);
    }

    if (depthMapExists) {
      showProcessing(true, 'Loading videos...', 60);
      console.log('Loading videos with URLs:', { videoUrl, depthUrl });

      // Load both videos
      colorVideo.src = videoUrl;
      depthVideo.src = depthUrl;

      // Wait for video metadata to validate
      try {
        await Promise.all([
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Color video load timeout')), 10000);
            colorVideo.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              resolve();
            }, { once: true });
            colorVideo.addEventListener('error', (e) => {
              clearTimeout(timeout);
              reject(new Error(`Color video load failed: ${e.target.error?.message || 'Unknown error'}`));
            }, { once: true });
          }),
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Depth video load timeout')), 10000);
            depthVideo.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              resolve();
            }, { once: true });
            depthVideo.addEventListener('error', (e) => {
              clearTimeout(timeout);
              reject(new Error(`Depth video load failed: ${e.target.error?.message || 'Unknown error'}`));
            }, { once: true });
          })
        ]);

        showProcessing(true, 'Starting playback...', 90);
        return true;
      } catch (error) {
        console.error('Error loading videos:', error);
        throw error;
      }
    }

    // If we're here and running locally, throw error since local videos should exist
    if (window.location.hostname === 'localhost') {
      throw new Error('Local development videos not found');
    }

    // Continue with depth map generation as before...
    // ... rest of the existing depth map generation code ...

  } catch (error) {
    console.error('Error in video loading process:', error);
    showProcessing(true, `Error: ${error.message}`, 100);
    setTimeout(() => showProcessing(false), 3000);
    return false;
  }
}

// Start everything
init();
// Test the random video API
testRandomVideoAPI();