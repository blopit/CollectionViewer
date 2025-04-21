// Global variables
let camera;
let scene;
let renderer;
let controls;
let orientationControls;
let mesh;
let loadingElement;
let isLoading = true;
let zoomLevel = 5;
let isMobile = false;
let usingDeviceOrientation = false;
let currentModel = null;

// Initialize the viewer when the page loads
window.addEventListener('DOMContentLoaded', () => {
    loadingElement = document.getElementById('loading');
    init();
    animate();

    // Add event listeners for controls
    document.getElementById('reset-view').addEventListener('click', resetView);
    document.getElementById('zoom-slider').addEventListener('input', handleZoom);
    
    // Add model selection dropdown
    initModelSelector();
    
    // Check if device is mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Add device orientation toggle if on mobile
    if (isMobile) {
        const controlSection = document.querySelector('.control-section:first-child');
        const orientationToggle = document.createElement('button');
        orientationToggle.id = 'orientation-toggle';
        orientationToggle.textContent = 'Enable Gyroscope';
        orientationToggle.addEventListener('click', toggleOrientationControls);
        controlSection.appendChild(orientationToggle);
    }
    
    // Check for model parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const modelParam = urlParams.get('model');
    if (modelParam) {
        // Load the specified model
        loadModelFromUrl(modelParam);
    } else {
        // Load default models
        loadModel();
    }
});

// Initialize model selector dropdown
function initModelSelector() {
    // Create model selector container
    const controlSection = document.querySelector('.control-section');
    const selectorContainer = document.createElement('div');
    selectorContainer.className = 'model-selector';
    
    // Create dropdown label
    const label = document.createElement('label');
    label.textContent = 'Select Model:';
    label.htmlFor = 'model-dropdown';
    
    // Create dropdown
    const dropdown = document.createElement('select');
    dropdown.id = 'model-dropdown';
    
    // Add model options
    const modelOptions = [
        { value: 'test_shape.ply', label: 'Test Shape (PLY)' },
        { value: 'model.glb', label: 'Flight Helmet' },
        { value: 'drone.glb', label: 'Drone' },
        { value: 'duck.glb', label: 'Duck' },
        { value: 'sample.glb', label: 'Sample Model' }
    ];
    
    for (const option of modelOptions) {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        dropdown.appendChild(optionElement);
    }
    
    // Add event listener
    dropdown.addEventListener('change', (e) => {
        loadModelDirectly(e.target.value);
    });
    
    // Add elements to container
    selectorContainer.appendChild(label);
    selectorContainer.appendChild(dropdown);
    
    // Add container to control section
    controlSection.insertBefore(selectorContainer, controlSection.firstChild);
}

// Load a model directly when selected from dropdown
function loadModelDirectly(modelFileName) {
    if (currentModel === modelFileName) return;
    
    currentModel = modelFileName;
    
    // Clear current model if it exists
    if (mesh) {
        scene.remove(mesh);
        mesh = null;
    }
    
    const startTime = performance.now();
    isLoading = true;
    loadingElement.style.display = 'block';
    
    // Load the new model
    if (modelFileName.toLowerCase().endsWith('.ply')) {
        loadPLYModel(`models/${modelFileName}`, startTime);
    } else {
        loadGLTFModel(`models/${modelFileName}`, startTime);
    }
    
    // Update URL without reloading page
    const url = new URL(window.location.href);
    url.searchParams.set('model', modelFileName);
    window.history.pushState({}, '', url);
}

// Initialize the Three.js scene
function init() {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Create the camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = zoomLevel;

    // Create the renderer
    const container = document.getElementById('scene-container');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Load a specific model from URL
function loadModelFromUrl(modelParam) {
    isLoading = true;
    loadingElement.style.display = 'block';
    loadingElement.innerHTML = '<div>Loading model: ' + modelParam + '</div>';
    
    const startTime = performance.now();
    
    // Determine model type from file extension
    if (modelParam.toLowerCase().endsWith('.ply')) {
        loadPLYModel(`/models/${modelParam}`, startTime);
    } else if (modelParam.toLowerCase().endsWith('.glb') || modelParam.toLowerCase().endsWith('.gltf')) {
        loadGLTFModel(`/models/${modelParam}`, startTime);
    } else {
        console.error('Unsupported model format');
        loadingElement.innerHTML = `<div>Error: Unsupported model format</div>`;
        createFallbackModel();
    }
}

// Load a 3D model
function loadModel() {
    isLoading = true;
    loadingElement.style.display = 'block';
    loadingElement.innerHTML = 'Initializing loader...';
    
    // Track timing for better user feedback
    const startTime = performance.now();
    
    // Try multiple model formats in sequence if one fails
    const modelFiles = [
        'models/model.glb',  // Flight helmet - complex model
        'models/drone.glb',  // Drone model - medium complexity 
        'models/duck.glb',   // Duck model - simple model
        'models/sample.glb'  // Original sample model
    ];
    
    // Try loading the first model
    tryLoadModelSequence(modelFiles, 0, startTime);
}

// Try to load models in sequence
function tryLoadModelSequence(modelFiles, index, startTime) {
    // If we've tried all models, create a fallback
    if (index >= modelFiles.length) {
        console.log('All models failed to load, creating fallback');
        createFallbackModel();
        return;
    }
    
    const currentModel = modelFiles[index];
    console.log(`Attempting to load model: ${currentModel}`);
    loadingElement.innerHTML = `<div>Trying to load model: ${currentModel}</div>`;
    
    // Try to load this specific model
    if (currentModel.toLowerCase().endsWith('.ply')) {
        loadPLYModel(currentModel, startTime, (error) => {
            console.log(`Failed to load ${currentModel}:`, error);
            tryLoadModelSequence(modelFiles, index + 1, startTime);
        });
    } else {
        loadGLTFModel(currentModel, startTime, (error) => {
            console.log(`Failed to load ${currentModel}:`, error);
            tryLoadModelSequence(modelFiles, index + 1, startTime);
        });
    }
}

// Load a PLY model
function loadPLYModel(modelPath, startTime, onError) {
    const loader = new THREE.PLYLoader();
    loader.load(
        modelPath,
        (geometry) => {
            // Center the geometry
            geometry.center();
            
            // Compute vertex normals if they don't exist
            if (!geometry.hasAttribute('normal')) {
                geometry.computeVertexNormals();
            }
            
            // Create material
            const material = new THREE.MeshStandardMaterial({
                color: 0x808080,
                metalness: 0.5,
                roughness: 0.5,
                vertexColors: geometry.hasAttribute('color')
            });
            
            // Create mesh
            mesh = new THREE.Mesh(geometry, material);
            
            // Scale the mesh to fit in view
            const box = new THREE.Box3().setFromObject(mesh);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 5 / maxDim;
            mesh.scale.multiplyScalar(scale);
            
            // Add to scene
            scene.add(mesh);
            
            // Update loading info
            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            loadingElement.innerHTML = `Load time: ${loadTime}s`;
            loadingElement.style.display = 'none';
            isLoading = false;
            
            // Update model info
            updatePLYModelInfo(geometry);
            
            // Reset view
            resetView();
        },
        (xhr) => {
            const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
            loadingElement.innerHTML = `Loading PLY: ${percent}%`;
        },
        (error) => {
            console.error('Error loading PLY:', error);
            loadingElement.innerHTML = `<div>Error loading PLY model: ${error.message}</div>`;
            if (onError) onError();
        }
    );
}

// Load a GLTF/GLB model
function loadGLTFModel(modelPath, startTime, onError) {
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        modelPath,
        (gltf) => {
            loadingElement.innerHTML = 'Processing model geometry...';
            
            // Remove existing mesh if present
            if (mesh) {
                scene.remove(mesh);
            }
            
            mesh = gltf.scene;
            
            // Center the model
            const box = new THREE.Box3().setFromObject(mesh);
            const center = box.getCenter(new THREE.Vector3());
            mesh.position.x = -center.x;
            mesh.position.y = -center.y;
            mesh.position.z = -center.z;
            
            loadingElement.innerHTML = 'Adjusting model scale...';
            
            // Adjust scale if needed
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 5) {
                const scale = 5 / maxDim;
                mesh.scale.set(scale, scale, scale);
            }
            
            loadingElement.innerHTML = 'Adding model to scene...';
            scene.add(mesh);
            
            loadingElement.innerHTML = 'Calculating model statistics...';
            // Update model information
            updateGLTFModelInfo(gltf);
            
            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`Model loaded in ${loadTime} seconds`);
            
            // Track current model
            if (modelPath.includes('/')) {
                currentModel = modelPath.split('/').pop();
                
                // Update dropdown if it exists
                const dropdown = document.getElementById('model-dropdown');
                if (dropdown) {
                    dropdown.value = currentModel;
                }
            }
            
            isLoading = false;
            loadingElement.style.display = 'none';
        },
        (xhr) => {
            // Loading progress with detailed information
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            const loadedMB = (xhr.loaded / (1024 * 1024)).toFixed(2);
            const totalMB = (xhr.total / (1024 * 1024)).toFixed(2);
            const timeElapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            
            // Calculate estimated time remaining
            let timeRemaining = "calculating...";
            if (xhr.loaded > 0 && percentComplete > 0) {
                const bytesPerSecond = xhr.loaded / timeElapsed;
                const secondsRemaining = (xhr.total - xhr.loaded) / bytesPerSecond;
                timeRemaining = secondsRemaining > 60 
                    ? `${(secondsRemaining / 60).toFixed(1)} minutes`
                    : `${secondsRemaining.toFixed(0)} seconds`;
            }
            
            loadingElement.innerHTML = `
                <div>Loading GLTF/GLB model: ${Math.round(percentComplete)}%</div>
                <div>${loadedMB} MB / ${totalMB} MB</div>
                <div>Time elapsed: ${timeElapsed}s</div>
                <div>Est. remaining: ${timeRemaining}</div>
            `;
        },
        onError
    );
}

// Update model information for PLY models
function updatePLYModelInfo(geometry) {
    const modelInfo = document.getElementById('model-info');
    if (!modelInfo) return;
    
    const vertices = geometry.getAttribute('position').count;
    const faces = geometry.index ? geometry.index.count / 3 : vertices / 3;
    const hasColors = geometry.hasAttribute('color');
    const hasNormals = geometry.hasAttribute('normal');
    
    modelInfo.innerHTML = `
        <div>Vertices: ${vertices.toLocaleString()}</div>
        <div>Faces: ${faces.toLocaleString()}</div>
        <div>Vertex Colors: ${hasColors ? 'Yes' : 'No'}</div>
        <div>Vertex Normals: ${hasNormals ? 'Yes' : 'No'}</div>
    `;
}

// Update model information for GLTF models
function updateGLTFModelInfo(gltf) {
    const modelInfo = document.querySelector('#model-info');
    
    if (!modelInfo) return;
    
    // Calculate vertices and faces
    let vertexCount = 0;
    let faceCount = 0;
    
    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            const geometry = child.geometry;
            
            if (geometry.isBufferGeometry) {
                vertexCount += geometry.attributes.position.count;
                if (geometry.index) {
                    faceCount += geometry.index.count / 3;
                } else {
                    faceCount += geometry.attributes.position.count / 3;
                }
            }
        }
    });
    
    // Update info box
    modelInfo.innerHTML = `
        <p><strong>Model Type:</strong> GLTF/GLB</p>
        <p><strong>Vertices:</strong> ${vertexCount.toLocaleString()}</p>
        <p><strong>Faces:</strong> ${Math.round(faceCount).toLocaleString()}</p>
        <p><strong>Materials:</strong> ${countMaterials(gltf.scene)}</p>
    `;
}

// Count unique materials in the model
function countMaterials(object) {
    const materials = new Set();
    
    object.traverse((child) => {
        if (child.isMesh) {
            if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    materials.add(material);
                }
            } else {
                materials.add(child.material);
            }
        }
    });
    
    return materials.size;
}

// Create a fallback model if loading fails
function createFallbackModel() {
    loadingElement.innerHTML = 'Creating fallback model...';
    
    // Create a simple colorful cube as fallback
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const materials = [
        new THREE.MeshBasicMaterial({color: 0xff0000}),
        new THREE.MeshBasicMaterial({color: 0x00ff00}),
        new THREE.MeshBasicMaterial({color: 0x0000ff}),
        new THREE.MeshBasicMaterial({color: 0xffff00}),
        new THREE.MeshBasicMaterial({color: 0xff00ff}),
        new THREE.MeshBasicMaterial({color: 0x00ffff})
    ];
    
    mesh = new THREE.Mesh(geometry, materials);
    scene.add(mesh);
    
    // Update info for fallback model
    const infoBox = document.querySelector('#model-info');
    if (infoBox) {
        infoBox.innerHTML = `
            <p><strong>Fallback model created</strong></p>
            <p><strong>Original model could not be loaded</strong></p>
            <p><strong>Vertices:</strong> 8</p>
            <p><strong>Faces:</strong> 6</p>
            <p><strong>Materials:</strong> 6</p>
        `;
    }
    
    // Start a simple animation for the cube
    const animate = () => {
        if (mesh) {
            mesh.rotation.x += 0.01;
            mesh.rotation.y += 0.01;
        }
    };
    
    // Add animation to the render loop
    const originalAnimate = window.animate;
    window.animate = () => {
        requestAnimationFrame(window.animate);
        animate();
        // Update controls based on what's active
        if (usingDeviceOrientation && orientationControls) {
            orientationControls.update();
        } else {
            controls.update();
        }
        // Render scene
        renderer.render(scene, camera);
    };
    
    window.animate();
    
    isLoading = false;
    loadingElement.style.display = 'none';
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('scene-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Toggle device orientation controls
function toggleOrientationControls() {
    const button = document.getElementById('orientation-toggle');
    
    if (!usingDeviceOrientation) {
        // Request permission and enable device orientation
        if (DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ requires permission
            DeviceOrientationEvent.requestPermission()
                .then(response => {
                    if (response === 'granted') {
                        enableOrientationControls();
                        button.textContent = 'Disable Gyroscope';
                        usingDeviceOrientation = true;
                    }
                })
                .catch(console.error);
        } else {
            // Other devices
            enableOrientationControls();
            button.textContent = 'Disable Gyroscope';
            usingDeviceOrientation = true;
        }
    } else {
        // Disable device orientation controls
        orientationControls = null;
        
        // Re-enable orbit controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 1;
        controls.maxDistance = 15;
        controls.maxPolarAngle = Math.PI;
        
        button.textContent = 'Enable Gyroscope';
        usingDeviceOrientation = false;
    }
}

// Enable orientation controls
function enableOrientationControls() {
    // Store current camera position
    const currentPosition = camera.position.clone();
    
    // Disable orbit controls
    controls.enabled = false;
    
    // Setup device orientation controls
    orientationControls = new THREE.DeviceOrientationControls(camera);
    orientationControls.update();
    
    // Set camera back to its position
    camera.position.copy(currentPosition);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls based on what's active
    if (usingDeviceOrientation && orientationControls) {
        orientationControls.update();
    } else {
        controls.update();
    }
    
    // Render scene
    renderer.render(scene, camera);
}

// Reset the camera view
function resetView() {
    controls.reset();
    zoomLevel = 5;
    camera.position.z = zoomLevel;
    document.getElementById('zoom-slider').value = 5;
}

// Handle zoom slider changes
function handleZoom(event) {
    zoomLevel = Number.parseFloat(event.target.value);
    camera.position.set(0, 0, zoomLevel);
} 