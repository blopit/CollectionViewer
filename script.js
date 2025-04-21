// Get video elements
const originalVideo = document.getElementById('original-video');
const depthVideo = document.getElementById('depth-video');
const normalVideo = document.getElementById('normal-video');

// Get range control elements
const originalRange = document.getElementById('original-range');
const depthRange = document.getElementById('depth-range');
const normalRange = document.getElementById('normal-range');

// Function to update video opacity based on range values
function updateVideoOpacity() {
    originalVideo.style.opacity = originalRange.value / 100;
    depthVideo.style.opacity = depthRange.value / 100;
    normalVideo.style.opacity = normalRange.value / 100;
}

// Add event listeners for range controls
originalRange.addEventListener('input', updateVideoOpacity);
depthRange.addEventListener('input', updateVideoOpacity);
normalRange.addEventListener('input', updateVideoOpacity); 