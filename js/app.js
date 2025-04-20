/**
 * 3D Collection Viewer - Main Application Code
 *
 * This file contains the core functionality for the 3D Collection Viewer application.
 * It uses Three.js for 3D rendering and GSAP for animations.
 *
 * Note: IDE may show warnings for GSAP functions and WebGL shader code (like 'fract'),
 * but these are valid in their respective contexts.
 */

// Import THREE from CDN
import * as THREE from 'https://unpkg.com/three@0.175.0/build/three.module.js';
// Import GSAP for animations
import { gsap } from 'https://cdn.skypack.dev/gsap';
// Import VideoUploader
import { VideoUploader } from './upload.js';

// Initialize video uploader
const videoUploader = new VideoUploader();

// Global state
let scene;
let camera;
let renderer;
let videoTexture;
let depthTexture;
let card;
let backgroundPlane; // Background plane showing original video
let animationFrameId; // Store animation frame ID for cleanup
const accelerometer = { x: 0, y: 0 };
const touchStartTime = 0;
let isCardRevealed = false;
let isShowingDepth = true; // Enable depth effect by default
let isShowingDepthMap = false;
let isShowingForeground = false; // New flag for showing isolated foreground
let timeoutId = null;
let lastInteractionTime = 0;
const mousePosition = { x: 0, y: 0 };
const targetRotation = { x: 0, y: 0 };
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let isTouch = false;
let depthInverted = false; // Flag to track if depth map is inverted

// Local storage key for saving settings
const STORAGE_KEY = 'collectionViewerSettings';

// Add cursor position tracking
const cursorPosition = { x: 0.5, y: 0.5 };

/**
 * Saves the current settings to localStorage
 */
function saveSettings() {
  const settings = {
    params: { ...params },
    toggles: {
      isShowingDepth,
      isShowingDepthMap,
      isShowingForeground,
      depthInverted
    }
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    console.log('Settings saved to localStorage');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Loads settings from localStorage
 * @returns {Object|null} The loaded settings or null if none exist
 */
function loadSettings() {
  try {
    const savedSettings = localStorage.getItem(STORAGE_KEY);
    if (savedSettings) {
      return JSON.parse(savedSettings);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return null;
}

// Effect parameters
const params = {
  // Basic effect parameters
  effectStrength: 1.0,     // Increased max effect strength
  shineStrength: 0.6,      // Increased for more dramatic shine
  depthContrast: 2.0,      // Increased for better depth definition
  perspective: 0.5,        // Increased for more dramatic perspective
  depthSmoothing: 0.5,     // Parameter for depth map smoothing
  zoom: 1.3,               // Default zoom level (camera position z)
  backgroundDistance: 0.3, // Increased distance between card and background plane
  depthThreshold: 0.5,     // Threshold for depth effect intensity

  // Clear coat parameters
  clearCoat: 1.0,
  clearCoatRoughness: 0.1,
  clearCoatNormalScale: 0.3,

  // New cursor light parameters
  cursorLightStrength: 0.8,    // Strength of cursor light
  cursorLightRadius: 0.2,      // Radius of cursor light effect
  cursorLightColor: [1.0, 0.8, 0.6], // Warm light color

  // New shine effect parameters
  specularStrength: 0.8,   // Increased strength of specular highlights
  specularShininess: 40.0, // Shininess factor (higher = smaller, sharper highlights)
  specularColor: [1.0, 0.9, 0.8], // Color of specular highlights (warm gold)

  // Strategic lighting parameters
  lightTopLeft: 0.7,       // Increased intensity of top-left light
  lightTopRight: 0.5,      // Increased intensity of top-right light
  lightBottomLeft: 0.3,    // Increased intensity of bottom-left light
  lightBottomRight: 0.2,   // Increased intensity of bottom-right light
  vignetteStrength: 2.0    // Increased strength of vignette effect
};

/**
 * Initialize the Three.js scene and set up the 3D environment
 * This is the main entry point for the application
 */
function init() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // More dramatic perspective camera
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = params.zoom;

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  // Get video elements from DOM
  const video = document.getElementById('original-video');
  const depthVideo = document.getElementById('depth-video');

  // Create video texture
  videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.format = THREE.RGBFormat;

  // Create depth texture
  depthTexture = new THREE.VideoTexture(depthVideo);
  depthTexture.minFilter = THREE.LinearFilter;
  depthTexture.magFilter = THREE.LinearFilter;
  depthTexture.format = THREE.RGBFormat;
  depthTexture.generateMipmaps = false; // Disable mipmaps for sharper details
  depthTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // Ensure synchronization of both videos
  video.addEventListener('play', () => {
    depthVideo.currentTime = video.currentTime;
  });

  video.addEventListener('seeked', () => {
    depthVideo.currentTime = video.currentTime;
  });

  // Wait for both videos to be ready and calculate aspect ratio
  Promise.all([
    new Promise(resolve => {
      if (video.readyState >= 2) {
        resolve(video);
      } else {
        video.addEventListener('canplay', () => resolve(video), { once: true });
      }
    }),
    new Promise(resolve => {
      if (depthVideo.readyState >= 2) {
        resolve(depthVideo);
      } else {
        depthVideo.addEventListener('canplay', () => resolve(depthVideo), { once: true });
      }
    })
  ]).then(([video, depthVideo]) => {
    const aspectRatio = video.videoWidth / video.videoHeight;
    createCard(aspectRatio);

    // Start videos if they're not already playing
    if (video.paused) video.play().catch(console.error);
    if (depthVideo.paused) depthVideo.play().catch(console.error);

    // Start animation loop
    animate();
  }).catch(error => {
    console.error('Error loading videos:', error);
  });

  // Add window resize handler
  window.addEventListener('resize', onWindowResize, false);

  // Add device motion handler for mobile
  if (isMobile) {
    window.addEventListener('deviceorientation', handleOrientation, true);
  }

  // Add touch handler
  window.addEventListener('touchstart', () => {
    isTouch = true;
    lastInteractionTime = Date.now();
  });

  window.addEventListener('touchmove', handleTouch);
  window.addEventListener('touchend', () => {
    // Reset card to neutral position after touch end
    setTimeout(() => {
      gsap.to(targetRotation, {
        x: 0,
        y: 0,
        duration: 1.5,
        ease: "elastic.out(1, 0.3)"
      });
    }, 100);
  });

  // Add mouse movement handler for desktop
  if (!isMobile) {
    window.addEventListener('mousemove', handleMouseMove);
    // Add mouse wheel zoom handler
    window.addEventListener('wheel', (event) => {
      event.preventDefault();

      // Determine zoom direction and amount
      const zoomSpeed = 0.1;
      const delta = Math.sign(event.deltaY) * zoomSpeed;

      // Update zoom parameter (clamped between 0.5 and 10)
      params.zoom = Math.max(0.5, Math.min(10, params.zoom + delta));

      // Apply zoom to camera
      gsap.to(camera.position, {
        z: params.zoom,
        duration: 0.3,
        ease: "power2.out"
      });

      // Update zoom slider if it exists
      const zoomSlider = document.getElementById('zoom-level');
      const zoomValueEl = document.getElementById('zoom-level-value');

      if (zoomSlider) {
        zoomSlider.value = params.zoom;
      }

      if (zoomValueEl) {
        zoomValueEl.textContent = params.zoom.toFixed(2);
      }

      lastInteractionTime = Date.now();
    }, { passive: false });
  }

  // Setup controls
  setupControls();
}

/**
 * Creates the 3D card with the specified aspect ratio
 * Sets up the geometry and shader material with all necessary uniforms
 * @param {number} aspectRatio - The width/height ratio of the video
 */
function createCard(aspectRatio) {
  // Create card geometry with dynamic aspect ratio
  // We'll keep the width at 1.6 and adjust height accordingly
  const width = 1.6;
  const height = width / aspectRatio;

  // Create much more detailed geometry for higher resolution depth effect
  const cardGeometry = new THREE.PlaneGeometry(width, height, 512, 512); // Doubled the segments for higher resolution

  // Create shader material for the card
  const cardMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: videoTexture },
      depthMap: { value: depthTexture },
      effectStrength: { value: params.effectStrength },
      shineStrength: { value: params.shineStrength },
      showDepth: { value: isShowingDepth ? 1.0 : 0.0 },
      showDepthMap: { value: isShowingDepthMap ? 1.0 : 0.0 },
      showForeground: { value: isShowingForeground ? 1.0 : 0.0 },
      depthContrast: { value: params.depthContrast },
      perspective: { value: params.perspective },
      depthSmoothing: { value: params.depthSmoothing },
      invertDepth: { value: depthInverted ? 1.0 : 0.0 },
      depthThreshold: { value: params.depthThreshold },
      time: { value: 0.0 }, // Add time uniform for animated effects

      // New shine effect uniforms
      specularStrength: { value: params.specularStrength },
      specularShininess: { value: params.specularShininess },
      specularColor: { value: new THREE.Vector3(...params.specularColor) },

      // Strategic lighting uniforms
      lightTopLeft: { value: params.lightTopLeft },
      lightTopRight: { value: params.lightTopRight },
      lightBottomLeft: { value: params.lightBottomLeft },
      lightBottomRight: { value: params.lightBottomRight },
      vignetteStrength: { value: params.vignetteStrength },

      // Add cursor light uniforms
      cursorPos: { value: new THREE.Vector2(0.5, 0.5) },
      cursorLightStrength: { value: params.cursorLightStrength },
      cursorLightRadius: { value: params.cursorLightRadius },
      cursorLightColor: { value: new THREE.Vector3(...params.cursorLightColor) },

      // Add clear coat uniforms
      clearCoat: { value: params.clearCoat },
      clearCoatRoughness: { value: params.clearCoatRoughness },
      clearCoatNormalScale: { value: params.clearCoatNormalScale }
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vOrigPosition; // Add original position for edge calculations

      uniform sampler2D depthMap;
      uniform float effectStrength;
      uniform float depthThreshold;
      uniform float depthSmoothing;
      uniform float invertDepth;
      uniform float showDepth;

      // Improved smootherstep for better transitions
      float smootherstep(float edge0, float edge1, float x) {
        x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
      }

      // Improved RGB to grayscale conversion using proper luminance weights
      float rgb2gray(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
      }

      // Function to detect edges using depth discontinuities
      float detectEdges(sampler2D depthTex, vec2 uv, float texelSize) {
        // Sample depth at neighboring pixels
        float depthCenter = rgb2gray(texture2D(depthTex, uv).rgb);
        float depthLeft = rgb2gray(texture2D(depthTex, uv + vec2(-texelSize, 0.0)).rgb);
        float depthRight = rgb2gray(texture2D(depthTex, uv + vec2(texelSize, 0.0)).rgb);
        float depthUp = rgb2gray(texture2D(depthTex, uv + vec2(0.0, texelSize)).rgb);
        float depthDown = rgb2gray(texture2D(depthTex, uv + vec2(0.0, -texelSize)).rgb);

        // Calculate depth differences
        float edgeH = abs(depthLeft - depthCenter) + abs(depthRight - depthCenter);
        float edgeV = abs(depthUp - depthCenter) + abs(depthDown - depthCenter);

        // Return edge factor (higher value at depth discontinuities)
        return clamp(edgeH + edgeV, 0.0, 1.0);
      }

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vOrigPosition = position; // Store original position for edge detection

        // Sample depth from depth map texture
        vec4 depthSample = texture2D(depthMap, uv);

        // Convert RGB to grayscale with accurate luminance weights
        float depth = rgb2gray(depthSample.rgb);

        // Apply inversion if needed
        depth = mix(depth, 1.0 - depth, invertDepth);

        // Make vDepth available to fragment shader (before applying threshold)
        vDepth = depth;

        // Create the foreground mask based on threshold
        float threshold = depthThreshold;
        float smoothing = max(0.001, depthSmoothing);
        float foregroundMask = smootherstep(threshold - smoothing, threshold + smoothing, depth);

        // Calculate a much stronger displacement for 3D effect
        // Scale by showDepth to enable/disable the 3D effect
        float displacementStrength = mix(0.0, effectStrength, showDepth);

        // Apply much stronger displacement to create more pronounced 3D effect
        // Scale by depth to create varying heights based on depth map
        float displacement = depth * displacementStrength;

        // Only apply to foreground (above threshold)
        displacement *= foregroundMask;

        // Detect depth discontinuities (edges where artifacts might appear)
        float edgeFactor = detectEdges(depthMap, uv, 0.005);

        // Reduce displacement at depth discontinuities to avoid artifacts
        displacement *= 1.0 - edgeFactor * 0.8;

        // Create a smoother falloff at boundaries to reduce prism effects
        float distFromThreshold = abs(depth - threshold);
        float boundaryFactor = smoothstep(0.0, smoothing * 2.0, distFromThreshold);

        // Apply tapering at the boundaries of depth regions
        displacement *= mix(0.7, 1.0, boundaryFactor);

        // Apply direct Z displacement for stronger 3D effect with boundary smoothing
        vec3 newPosition = position + vec3(0.0, 0.0, displacement * 0.5);

        // Also apply displacement along normal for more natural surface
        newPosition += normal * displacement * 0.1;

        // Set the final position
        vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vDepth;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vOrigPosition; // Add original position from vertex shader

      uniform sampler2D map;
      uniform sampler2D depthMap;
      uniform float shineStrength;
      uniform float depthThreshold;
      uniform float depthSmoothing;
      uniform float invertDepth;
      uniform float showDepth;
      uniform float showDepthMap;
      uniform float showForeground;
      uniform float time;

      // New shine effect uniforms
      uniform float specularStrength;
      uniform float specularShininess;
      uniform vec3 specularColor;

      // Strategic lighting uniforms
      uniform float lightTopLeft;
      uniform float lightTopRight;
      uniform float lightBottomLeft;
      uniform float lightBottomRight;
      uniform float vignetteStrength;

      // Add cursor light uniforms
      uniform vec2 cursorPos;
      uniform float cursorLightStrength;
      uniform float cursorLightRadius;
      uniform vec3 cursorLightColor;

      // Add clear coat uniforms
      uniform float clearCoat;
      uniform float clearCoatRoughness;
      uniform float clearCoatNormalScale;

      // Improved smootherstep for better transitions
      float smootherstep(float edge0, float edge1, float x) {
        x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
      }

      // Function to calculate specular highlight
      float specular(vec3 normal, vec3 viewDir, vec3 lightDir, float shininess) {
        // Calculate reflection vector
        vec3 reflectDir = reflect(-lightDir, normal);

        // Calculate specular component (Blinn-Phong)
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
        return spec;
      }

      void main() {
        // Get base color from texture
        vec4 texColor = texture2D(map, vUv);

        // Calculate lighting based on normal and view direction
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.0);

        // Create foreground mask based on depth threshold
        float threshold = depthThreshold;
        float smoothing = max(0.001, depthSmoothing);

        // Generate a strict foreground mask where depth > threshold
        float foregroundMask = smootherstep(threshold - smoothing, threshold + smoothing, vDepth);

        // Apply basic shininess effect to foreground elements
        vec3 shineColor = vec3(1.0, 1.0, 1.0) * fresnel * shineStrength * foregroundMask;

        // Initialize final color with base texture
        vec3 finalColor = texColor.rgb;

        // Apply lighting and visual effects
        if (showDepthMap > 0.5) {
          // If showing depth map, visualize with a threshold line
          // This clearly shows where the threshold cuts foreground from background
          float thresholdLine = smoothstep(threshold - 0.01, threshold + 0.01, vDepth);
          float thresholdMask = abs(thresholdLine - 0.5) < 0.1 ? 1.0 : 0.0;

          // Visualize depth map with blue line showing threshold (changed from red)
          finalColor = mix(vec3(vDepth), vec3(0.0, 0.5, 1.0), thresholdMask * 0.8);
        }
        else if (showForeground > 0.5) {
          // If showing isolated foreground, apply mask with clear threshold edge
          // Black background with colored foreground
          vec3 borderColor = vec3(0.0, 0.7, 1.0); // Changed to blue border

          // Create edge detection for better boundary visualization
          float edge = smoothstep(threshold - smoothing * 0.5, threshold, vDepth) -
                       smoothstep(threshold, threshold + smoothing * 0.5, vDepth);

          // Show only foreground with the original color (depth > threshold)
          finalColor = mix(vec3(0.0), texColor.rgb, foregroundMask);

          // Add colored edge for better boundary visualization
          finalColor = mix(finalColor, borderColor, edge * 0.9);

          // Add subtle grid pattern to foreground for better depth perception
          float gridX = mod(vUv.x * 50.0, 1.0);
          float gridY = mod(vUv.y * 50.0, 1.0);
          float grid = (gridX < 0.05 || gridY < 0.05) ? 0.15 : 0.0;

          // Apply grid only to foreground
          finalColor = mix(finalColor, finalColor * (1.0 - grid), foregroundMask);
        }
        else {
          // Always apply enhanced lighting and shine effects, regardless of showDepth value
          // This ensures the 3D effect is preserved

          // Define light directions from each corner
          vec3 lightDirTopLeft = normalize(vec3(-1.0, 1.0, 1.0));
          vec3 lightDirTopRight = normalize(vec3(1.0, 1.0, 1.0));
          vec3 lightDirBottomLeft = normalize(vec3(-1.0, -1.0, 1.0));
          vec3 lightDirBottomRight = normalize(vec3(1.0, -1.0, 1.0));

          // Calculate diffuse lighting from each corner
          float diffuseTopLeft = max(dot(normal, lightDirTopLeft), 0.0) * lightTopLeft;
          float diffuseTopRight = max(dot(normal, lightDirTopRight), 0.0) * lightTopRight;
          float diffuseBottomLeft = max(dot(normal, lightDirBottomLeft), 0.0) * lightBottomLeft;
          float diffuseBottomRight = max(dot(normal, lightDirBottomRight), 0.0) * lightBottomRight;

          // Combine diffuse lighting
          float diffuseTotal = diffuseTopLeft + diffuseTopRight + diffuseBottomLeft + diffuseBottomRight;

          // Calculate specular highlights from each corner
          float specTopLeft = specular(normal, viewDir, lightDirTopLeft, specularShininess) * lightTopLeft;
          float specTopRight = specular(normal, viewDir, lightDirTopRight, specularShininess) * lightTopRight;
          float specBottomLeft = specular(normal, viewDir, lightDirBottomLeft, specularShininess) * lightBottomLeft;
          float specBottomRight = specular(normal, viewDir, lightDirBottomRight, specularShininess) * lightBottomRight;

          // Combine specular highlights
          float specTotal = (specTopLeft + specTopRight + specBottomLeft + specBottomRight) * specularStrength;

          // Apply lighting effects to the texture color
          finalColor = texColor.rgb * (1.0 + diffuseTotal * 0.5);

          // Modulate effect intensity based on showDepth value
          float effectIntensity = mix(0.3, 1.0, showDepth);

          // Add specular highlights with color - only to foreground
          finalColor += specTotal * specularColor * foregroundMask * effectIntensity;

          // Add basic shine - only to foreground
          finalColor += shineColor * effectIntensity * foregroundMask;

          // Add animated shine effect - only to foreground
          float shineX = sin(vUv.x * 10.0 + time) * 0.5 + 0.5;
          float shineY = cos(vUv.y * 8.0 + time * 0.7) * 0.5 + 0.5;
          float shine = shineX * shineY * specularStrength * 0.3;
          finalColor += shine * specularColor * foregroundMask * effectIntensity;

          // Apply vignette effect
          float vig = 1.0 - smoothstep(0.2, 0.8, distance(vUv, vec2(0.5, 0.5)) * vignetteStrength);
          finalColor *= mix(1.0, vig, effectIntensity);
        }

        if (showDepthMap < 0.5 && showForeground < 0.5) {
          // Calculate distance from cursor
          float cursorDist = distance(vUv, cursorPos);
          
          // Create smooth falloff for cursor light
          float cursorLight = smoothstep(cursorLightRadius, 0.0, cursorDist);
          
          // Add cursor light to final color
          finalColor += cursorLightColor * cursorLight * cursorLightStrength * foregroundMask;

          // Apply clear coat effect
          vec3 clearCoatNormal = normalize(vNormal);
          float clearCoatFresnel = pow(1.0 - abs(dot(clearCoatNormal, viewDir)), 5.0);
          
          // Calculate clear coat reflection
          vec3 clearCoatReflection = reflect(-viewDir, clearCoatNormal);
          float clearCoatSpecular = pow(max(dot(clearCoatReflection, normalize(vec3(1.0, 1.0, 1.0))), 0.0), 
                                     mix(128.0, 1.0, clearCoatRoughness));
          
          // Apply clear coat layer
          vec3 clearCoatColor = vec3(1.0);
          float clearCoatStrength = clearCoat * clearCoatFresnel;
          finalColor = mix(finalColor, clearCoatColor, clearCoatStrength * clearCoatSpecular);
          
          // Add clear coat normal mapping effect
          float clearCoatNormalFactor = clearCoatNormalScale * clearCoatStrength;
          finalColor += clearCoatColor * clearCoatNormalFactor * clearCoatSpecular;
        }

        gl_FragColor = vec4(finalColor, texColor.a);
      }
    `,
    side: THREE.DoubleSide
  });

  // Create card mesh
  card = new THREE.Mesh(cardGeometry, cardMaterial);

  // Position the card slightly forward
  card.position.z = params.backgroundDistance;

  // Create background plane with original high-definition video
  // Using MeshBasicMaterial for flat rendering with no lighting or depth effects
  const backgroundMaterial = new THREE.MeshBasicMaterial({
    map: videoTexture,
    side: THREE.DoubleSide,
    depthWrite: false, // Don't write to depth buffer
    transparent: false // No transparency
  });

  // Create background plane with a completely flat geometry (only 4 vertices)
  // Make it slightly larger than the card for a subtle border effect
  const backgroundGeometry = new THREE.PlaneGeometry(width * 1.05, height * 1.05, 1, 1);
  backgroundPlane = new THREE.Mesh(backgroundGeometry, backgroundMaterial);

  // Position the background plane at a fixed distance behind the card
  // Use a negative z value to ensure it's always behind the card
  backgroundPlane.position.z = -0.05;

  // Add both meshes to scene
  scene.add(backgroundPlane);
  scene.add(card);
}

/**
 * Animates the card reveal with a dramatic scaling and rotation effect
 */
function revealCard() {
  isCardRevealed = true;

  // Check if card exists before animating
  if (!card) return;

  // More dramatic reveal animation for the card
  gsap.from(card.scale, {
    x: 0.3,
    y: 0.3,
    z: 0.3,
    duration: 1.8,
    ease: "elastic.out(1, 0.3)"
  });

  gsap.from(card.rotation, {
    x: Math.PI,
    y: Math.PI/4,
    duration: 2,
    ease: "power3.out"
  });

  // Simple fade-in for background plane
  if (backgroundPlane) {
    // Start with zero opacity
    backgroundPlane.material.opacity = 0;
    backgroundPlane.material.transparent = true;

    // Fade in
    gsap.to(backgroundPlane.material, {
      opacity: 1.0,
      duration: 1.0,
      ease: "power2.out"
    });

    // Ensure background stays flat and in position
    backgroundPlane.position.z = -0.05;
    backgroundPlane.rotation.x = 0;
    backgroundPlane.rotation.y = 0;
  }
}

/**
 * Handles device orientation events for mobile tilt functionality
 * @param {DeviceOrientationEvent} event - The device orientation event
 */
function handleOrientation(event) {
  if (isTouch) return; // Skip if touch is being used

  // Handle device orientation (mobile tilt)
  if (event.gamma && event.beta) {
    const gammaConstrained = Math.min(Math.max(event.gamma, -25), 25) / 25;
    const betaConstrained = Math.min(Math.max(event.beta - 45, -25), 25) / 25;

    targetRotation.y = gammaConstrained * 0.4; // Increased from 0.3
    targetRotation.x = -betaConstrained * 0.3; // Increased from 0.2

    lastInteractionTime = Date.now();
  }
}

/**
 * Handles touch events for interactive card rotation
 * @param {TouchEvent} event - The touch event
 */
function handleTouch(event) {
  if (event.touches.length !== 1) return;

  const touch = event.touches[0];
  const x = touch.clientX / window.innerWidth * 2 - 1;
  const y = -(touch.clientY / window.innerHeight) * 2 + 1;

  targetRotation.y = x * 0.3; // Increased from 0.2
  targetRotation.x = y * 0.25; // Increased from 0.15

  lastInteractionTime = Date.now();
}

/**
 * Handles mouse movement for desktop interaction
 * @param {MouseEvent} event - The mouse event
 */
function handleMouseMove(event) {
  if (isTouch) return; // Skip if touch is being used

  // Get mouse position normalized from -1 to 1
  mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
  mousePosition.y = -((event.clientY / window.innerHeight) * 2 - 1);

  // Set rotation based on mouse position with stronger effect
  targetRotation.y = mousePosition.x * 0.3; // Increased from 0.2
  targetRotation.x = mousePosition.y * 0.25; // Increased from 0.15

  lastInteractionTime = Date.now();

  // Reset auto-return timeout
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  // Set timeout to return card to neutral position after 2 seconds
  timeoutId = setTimeout(() => {
    gsap.to(targetRotation, {
      x: 0,
      y: 0,
      duration: 1.5,
      ease: "elastic.out(1, 0.3)"
    });
  }, 2000);
}

/**
 * Handles window resize events to maintain proper aspect ratio
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let time = 0;

/**
 * Main animation loop that runs every frame
 * Updates time-based effects and handles card rotation
 */
function animate() {
  if (card?.material?.uniforms) {
    card.material.uniforms.cursorPos.value.set(cursorPosition.x, cursorPosition.y);
  }
  animationFrameId = requestAnimationFrame(animate);

  time += 0.01;

  // Update time uniform if card exists
  if (card?.material?.uniforms?.time) {
    card.material.uniforms.time.value = time;
  }

  // Add subtle ambient motion when not interacting
  if (Date.now() - lastInteractionTime > 3000 && card) {
    const idleAmplitude = 0.02;
    const idleX = Math.sin(time * 0.5) * idleAmplitude;
    const idleY = Math.cos(time * 0.3) * idleAmplitude;

    targetRotation.x = idleX;
    targetRotation.y = idleY;
  }

  // Smooth rotation transition for both card and background
  if (card && backgroundPlane) {
    // Update both planes with the same rotation
    gsap.to([card.rotation, backgroundPlane.rotation], {
      x: targetRotation.x,
      y: targetRotation.y,
      duration: 0.3,
      overwrite: true,
      ease: "power2.out"
    });
  }

  renderer.render(scene, camera);
}

// Setup UI controls
/**
 * Sets up the UI controls and event listeners
 * Initializes all sliders and toggle switches
 * Loads saved settings from localStorage if available
 */
function setupControls() {
  // Load saved settings if available
  const savedSettings = loadSettings();
  if (savedSettings) {
    console.log('Loading saved settings from localStorage');

    // Apply saved parameters
    if (savedSettings.params) {
      // Update each parameter, preserving any that might not be in saved settings
      for (const key of Object.keys(savedSettings.params)) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
          // Special handling for specularColor which is an array
          if (key === 'specularColor') {
            params[key] = savedSettings.params[key];
          } else {
            params[key] = savedSettings.params[key];
          }
        }
      }
    }

    // Apply saved toggle states
    if (savedSettings.toggles) {
      if (typeof savedSettings.toggles.isShowingDepth === 'boolean') {
        isShowingDepth = savedSettings.toggles.isShowingDepth;
      }
      if (typeof savedSettings.toggles.isShowingDepthMap === 'boolean') {
        isShowingDepthMap = savedSettings.toggles.isShowingDepthMap;
      }
      if (typeof savedSettings.toggles.isShowingForeground === 'boolean') {
        isShowingForeground = savedSettings.toggles.isShowingForeground;
      }
      if (typeof savedSettings.toggles.depthInverted === 'boolean') {
        depthInverted = savedSettings.toggles.depthInverted;
      }
    }

    // Update camera position based on saved zoom
    if (camera && params.zoom) {
      camera.position.z = params.zoom;
    }

    // Update card position if it exists
    if (card && params.backgroundDistance) {
      card.position.z = params.backgroundDistance;
    }

    // Update shader uniforms if card exists
    if (card?.material?.uniforms) {
      // Update all numeric uniforms
      for (const key in params) {
        if (card.material.uniforms[key] && typeof params[key] === 'number') {
          card.material.uniforms[key].value = params[key];
        }
      }

      // Update toggle uniforms
      card.material.uniforms.showDepth.value = isShowingDepth ? 1.0 : 0.0;
      card.material.uniforms.showDepthMap.value = isShowingDepthMap ? 1.0 : 0.0;
      card.material.uniforms.showForeground.value = isShowingForeground ? 1.0 : 0.0;
      card.material.uniforms.invertDepth.value = depthInverted ? 1.0 : 0.0;

      // Update specularColor which is a Vector3
      if (params.specularColor && card.material.uniforms.specularColor) {
        card.material.uniforms.specularColor.value = new THREE.Vector3(...params.specularColor);
      }
    }
  }
  // Make sure the controls panel is visible initially
  const controlsPanel = document.getElementById('controls-panel');
  if (controlsPanel) {
    controlsPanel.classList.add('visible');
  }

  // Initialize slider values according to current params
  const initializeSliders = () => {
    // Set all slider values to match current parameters
    const sliderConfigs = [
      { id: 'effect-strength', value: params.effectStrength, displayId: 'effect-strength-value' },
      { id: 'shine-strength', value: params.shineStrength, displayId: 'shine-strength-value' },
      { id: 'depth-contrast', value: params.depthContrast, displayId: 'depth-contrast-value' },
      { id: 'depth-smoothing', value: params.depthSmoothing, displayId: 'depth-smoothing-value' },
      { id: 'depth-threshold', value: params.depthThreshold, displayId: 'depth-threshold-value' },
      { id: 'zoom-level', value: params.zoom, displayId: 'zoom-level-value' },
      { id: 'background-distance', value: params.backgroundDistance, displayId: 'background-distance-value' },
      { id: 'specular-strength', value: params.specularStrength, displayId: 'specular-strength-value' },
      { id: 'specular-shininess', value: params.specularShininess, displayId: 'specular-shininess-value' },
      { id: 'light-top-left', value: params.lightTopLeft, displayId: 'light-top-left-value' },
      { id: 'light-top-right', value: params.lightTopRight, displayId: 'light-top-right-value' },
      { id: 'light-bottom-left', value: params.lightBottomLeft, displayId: 'light-bottom-left-value' },
      { id: 'light-bottom-right', value: params.lightBottomRight, displayId: 'light-bottom-right-value' },
      { id: 'vignette-strength', value: params.vignetteStrength, displayId: 'vignette-strength-value' },
      { id: 'cursor-light-strength', value: params.cursorLightStrength, displayId: 'cursor-light-strength-value' },
      { id: 'cursor-light-radius', value: params.cursorLightRadius, displayId: 'cursor-light-radius-value' },
      { id: 'clear-coat', value: params.clearCoat, displayId: 'clear-coat-value' },
      { id: 'clear-coat-roughness', value: params.clearCoatRoughness, displayId: 'clear-coat-roughness-value' },
      { id: 'clear-coat-normal-scale', value: params.clearCoatNormalScale, displayId: 'clear-coat-normal-scale-value' }
    ];

    sliderConfigs.forEach(config => {
      const slider = document.getElementById(config.id);
      const display = document.getElementById(config.displayId);

      if (slider) {
        slider.value = config.value;
      }

      if (display) {
        // Format to 2 decimal places for most values, whole number for shininess
        const formatted = config.id === 'specular-shininess'
          ? config.value.toFixed(0)
          : config.value.toFixed(2);
        display.textContent = formatted;
      }
    });

    // Set toggle switch states
    const toggleDepth = document.getElementById('toggle-depth');
    if (toggleDepth) {
      toggleDepth.checked = isShowingDepth;
    }

    const showDepthMap = document.getElementById('show-depth-map');
    if (showDepthMap) {
      showDepthMap.checked = isShowingDepthMap;
    }

    const showForeground = document.getElementById('show-foreground');
    if (showForeground) {
      showForeground.checked = isShowingForeground;
    }

    const invertDepth = document.getElementById('invert-depth');
    if (invertDepth) {
      invertDepth.checked = depthInverted;
    }
  };

  // Initialize sliders with current values
  initializeSliders();

  // Toggle controls panel
  document.getElementById('toggle-controls')?.addEventListener('click', () => {
    const controlsPanel = document.getElementById('controls-panel');

    if (controlsPanel) {
      controlsPanel.classList.toggle('visible');
    }
  });

  // Toggle depth effect
  document.getElementById('toggle-depth')?.addEventListener('change', (e) => {
    isShowingDepth = e.target.checked;
    if (card?.material?.uniforms) {
      card.material.uniforms.showDepth.value = isShowingDepth ? 1.0 : 0.0;
    }
    saveSettings(); // Save settings after change
  });

  // Show depth map for debugging
  document.getElementById('show-depth-map')?.addEventListener('change', (e) => {
    isShowingDepthMap = e.target.checked;
    if (card?.material?.uniforms) {
      card.material.uniforms.showDepthMap.value = isShowingDepthMap ? 1.0 : 0.0;
    }

    // Turn off foreground visualization if depth map is enabled
    if (isShowingDepthMap && isShowingForeground) {
      isShowingForeground = false;
      const foregroundToggle = document.getElementById('show-foreground');
      if (foregroundToggle) foregroundToggle.checked = false;
      if (card?.material?.uniforms) {
        card.material.uniforms.showForeground.value = 0.0;
      }
    }
    saveSettings(); // Save settings after change
  });

  // Add foreground visualization toggle
  const depthGroup = document.querySelector('.control-group');
  if (depthGroup) {
    const foregroundControl = document.createElement('div');
    foregroundControl.className = 'control-row';
    foregroundControl.innerHTML = `
      <label for="show-foreground">
        <input type="checkbox" id="show-foreground">
        Show Foreground Only
      </label>
    `;

    // Simply append the control to the group instead of trying to insert at a specific position
    // This fixes the "Failed to execute 'insertBefore'" error
    depthGroup.appendChild(foregroundControl);

    // Add event listener for foreground toggle
    document.getElementById('show-foreground')?.addEventListener('change', (e) => {
      isShowingForeground = e.target.checked;
      if (card?.material?.uniforms) {
        card.material.uniforms.showForeground.value = isShowingForeground ? 1.0 : 0.0;
      }

      // Turn off depth map visualization if foreground is enabled
      if (isShowingForeground && isShowingDepthMap) {
        isShowingDepthMap = false;
        const depthMapToggle = document.getElementById('show-depth-map');
        if (depthMapToggle) depthMapToggle.checked = false;
        if (card?.material?.uniforms) {
          card.material.uniforms.showDepthMap.value = 0.0;
        }
      }
      saveSettings(); // Save settings after change
    });
  }

  // Toggle invert depth (some models output inverted depth maps)
  document.getElementById('invert-depth')?.addEventListener('change', (e) => {
    depthInverted = e.target.checked;
    if (card?.material?.uniforms) {
      card.material.uniforms.invertDepth.value = depthInverted ? 1.0 : 0.0;
    }
    saveSettings(); // Save settings after change
  });

  // Effect strength slider
  document.getElementById('effect-strength')?.addEventListener('input', (e) => {
    params.effectStrength = Number.parseFloat(e.target.value);
    const strengthValueEl = document.getElementById('effect-strength-value');
    if (strengthValueEl) {
      strengthValueEl.textContent = params.effectStrength.toFixed(2);
    }
    if (card?.material?.uniforms) {
      card.material.uniforms.effectStrength.value = params.effectStrength;
    }
    saveSettings(); // Save settings after change
  });

  // Helper function to create slider event listeners with settings save
  const createSliderListener = (id, paramName, uniformName = paramName, formatDecimals = 2) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      params[paramName] = Number.parseFloat(e.target.value);
      const valueEl = document.getElementById(`${id}-value`);
      if (valueEl) {
        valueEl.textContent = params[paramName].toFixed(formatDecimals);
      }
      if (card?.material?.uniforms && card.material.uniforms[uniformName]) {
        card.material.uniforms[uniformName].value = params[paramName];
      }
      saveSettings(); // Save settings after change
    });
  };

  // Shine strength slider
  createSliderListener('shine-strength', 'shineStrength');

  // Depth contrast slider
  createSliderListener('depth-contrast', 'depthContrast');

  // Depth smoothing slider
  createSliderListener('depth-smoothing', 'depthSmoothing');

  // Add a zoom control
  const controlGroup = document.querySelector('.control-group');
  if (controlGroup) {
    // First add the depth threshold slider
    const thresholdControl = document.createElement('div');
    thresholdControl.className = 'control-row';
    thresholdControl.innerHTML = `
      <label for="depth-threshold">Depth Threshold</label>
      <div class="slider-container">
        <input type="range" id="depth-threshold" min="0" max="1" step="0.05" value="${params.depthThreshold}">
        <span class="value-display" id="depth-threshold-value">${params.depthThreshold.toFixed(2)}</span>
      </div>
    `;
    controlGroup.appendChild(thresholdControl);

    const zoomControl = document.createElement('div');
    zoomControl.className = 'control-row';
    zoomControl.innerHTML = `
      <label for="zoom-level">Zoom Level</label>
      <div class="slider-container">
        <input type="range" id="zoom-level" min="0.5" max="10" step="0.1" value="${params.zoom}">
        <span class="value-display" id="zoom-level-value">${params.zoom.toFixed(2)}</span>
      </div>
    `;
    controlGroup.appendChild(zoomControl);

    // Add background distance control
    const distanceControl = document.createElement('div');
    distanceControl.className = 'control-row';
    distanceControl.innerHTML = `
      <label for="background-distance">Depth Separation</label>
      <div class="slider-container">
        <input type="range" id="background-distance" min="0" max="1" step="0.01" value="${params.backgroundDistance}">
        <span class="value-display" id="background-distance-value">${params.backgroundDistance.toFixed(2)}</span>
      </div>
    `;
    controlGroup.appendChild(distanceControl);

    // Depth threshold slider
    createSliderListener('depth-threshold', 'depthThreshold');

    // Zoom level slider
    document.getElementById('zoom-level')?.addEventListener('input', (e) => {
      params.zoom = Number.parseFloat(e.target.value);
      const zoomValueEl = document.getElementById('zoom-level-value');
      if (zoomValueEl) {
        zoomValueEl.textContent = params.zoom.toFixed(2);
      }

      // Apply zoom to camera
      gsap.to(camera.position, {
        z: params.zoom,
        duration: 0.3,
        ease: "power2.out"
      });

      saveSettings(); // Save settings after change
    });

    // Background distance slider
    document.getElementById('background-distance')?.addEventListener('input', (e) => {
      params.backgroundDistance = Number.parseFloat(e.target.value);
      const distanceValueEl = document.getElementById('background-distance-value');
      if (distanceValueEl) {
        distanceValueEl.textContent = params.backgroundDistance.toFixed(2);
      }

      // Update card position
      if (card) {
        gsap.to(card.position, {
          z: params.backgroundDistance,
          duration: 0.3,
          ease: "power2.out"
        });
      }

      saveSettings(); // Save settings after change
    });
  }

  // Add event listeners for shine effects
  createSliderListener('specular-strength', 'specularStrength');

  // Specular shininess slider (uses 0 decimal places)
  createSliderListener('specular-shininess', 'specularShininess', 'specularShininess', 0);

  // Strategic lighting controls
  createSliderListener('light-top-left', 'lightTopLeft');
  createSliderListener('light-top-right', 'lightTopRight');
  createSliderListener('light-bottom-left', 'lightBottomLeft');
  createSliderListener('light-bottom-right', 'lightBottomRight');
  createSliderListener('vignette-strength', 'vignetteStrength');

  // Add cursor light controls
  createSliderListener('cursor-light-strength', 'cursorLightStrength');
  createSliderListener('cursor-light-radius', 'cursorLightRadius');

  // Support old controls as well
  document.querySelector('#controls #toggle-depth')?.addEventListener('click', () => {
    isShowingDepth = !isShowingDepth;
    if (card?.material?.uniforms) {
      card.material.uniforms.showDepth.value = isShowingDepth ? 1.0 : 0.0;
    }
  });

  document.querySelector('#controls #show-depth-map')?.addEventListener('click', () => {
    isShowingDepthMap = !isShowingDepthMap;
    if (card?.material?.uniforms) {
      card.material.uniforms.showDepthMap.value = isShowingDepthMap ? 1.0 : 0.0;
    }
  });

  document.querySelector('#controls #toggle-controls')?.addEventListener('click', () => {
    const controls = document.getElementById('controls');
    const params = document.getElementById('params');

    if (controls && params) {
      controls.classList.toggle('minimized');
      params.classList.toggle('hidden');
    }
  });

  // Add foreground toggle to old controls if they exist
  document.querySelector('#controls #show-foreground')?.addEventListener('click', () => {
    isShowingForeground = !isShowingForeground;
    if (card?.material?.uniforms) {
      card.material.uniforms.showForeground.value = isShowingForeground ? 1.0 : 0.0;
    }

    // Turn off depth map if foreground is enabled
    if (isShowingForeground && isShowingDepthMap) {
      isShowingDepthMap = false;
      if (card?.material?.uniforms) {
        card.material.uniforms.showDepthMap.value = 0.0;
      }
    }
  });

  // Hide loading screen when everything is ready
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    setTimeout(() => {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }, 1000);
  }
}

/**
 * Cleanup function to properly dispose of Three.js resources
 */
function cleanup() {
  // Stop animation loop
  if (window.cancelAnimationFrame) {
    window.cancelAnimationFrame(animationFrameId);
  }
  
  // Dispose of Three.js resources
  if (scene) {
    // Remove and dispose of card mesh
    if (card) {
      scene.remove(card);
      card.geometry.dispose();
      card.material.dispose();
    }
    
    // Remove and dispose of background plane
    if (backgroundPlane) {
      scene.remove(backgroundPlane);
      backgroundPlane.geometry.dispose();
      backgroundPlane.material.dispose();
    }
    
    // Dispose of textures
    if (videoTexture) {
      videoTexture.dispose();
    }
    if (depthTexture) {
      depthTexture.dispose();
    }
  }
  
  // Clear references
  scene = null;
  camera = null;
  renderer = null;
  videoTexture = null;
  depthTexture = null;
  card = null;
  backgroundPlane = null;
}

// Expose init and cleanup functions globally
window.init = init;
window.cleanup = cleanup;

// Initialize on load
init();

// Track cursor position
function updateCursorPosition(event) {
  cursorPosition.x = event.clientX / window.innerWidth;
  cursorPosition.y = 1.0 - (event.clientY / window.innerHeight); // Invert Y for WebGL coordinates
}

// Add event listeners for cursor tracking
window.addEventListener('mousemove', updateCursorPosition);
window.addEventListener('touchmove', (e) => {
  updateCursorPosition({
    clientX: e.touches[0].clientX,
    clientY: e.touches[0].clientY
  });
});