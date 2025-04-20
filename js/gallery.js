/**
 * Gallery component for displaying previously processed videos
 */
export class VideoGallery {
  constructor() {
    this.galleryContainer = null;
    this.videos = [];
    this.init();
  }

  init() {
    // Create gallery container
    this.galleryContainer = document.createElement('div');
    this.galleryContainer.className = 'gallery-container';
    this.galleryContainer.style.display = 'none';

    // Create gallery header
    const header = document.createElement('div');
    header.className = 'gallery-header';
    header.innerHTML = `
      <h2>Processed Videos</h2>
      <button class="back-to-upload">Back to Upload</button>
    `;
    this.galleryContainer.appendChild(header);

    // Create videos grid
    const grid = document.createElement('div');
    grid.className = 'gallery-grid';
    this.galleryContainer.appendChild(grid);

    // Add to page
    const controlsPanel = document.querySelector('.controls-panel');
    if (controlsPanel) {
      controlsPanel.insertBefore(this.galleryContainer, controlsPanel.firstChild);
    }

    // Add event listener for back button
    this.galleryContainer.querySelector('.back-to-upload').addEventListener('click', () => {
      this.hide();
      document.querySelector('.upload-container').style.display = 'block';
    });

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .gallery-container {
        margin-bottom: 20px;
        padding: 15px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
      }

      .gallery-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }

      .gallery-header h2 {
        margin: 0;
        font-size: 18px;
        color: #4d9fff;
      }

      .back-to-upload {
        padding: 8px 12px;
        background: #4d9fff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      }

      .back-to-upload:hover {
        background: #83beff;
      }

      .gallery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
        max-height: 70vh;
        overflow-y: auto;
        padding: 10px;
      }

      .video-pair {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        overflow: hidden;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        cursor: pointer;
      }

      .video-pair:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      }

      .video-info {
        padding: 15px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .video-info h3 {
        margin: 0 0 10px 0;
        color: #4d9fff;
        font-size: 16px;
      }

      .video-info p {
        margin: 5px 0;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
      }

      .video-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 15px;
      }

      .video-wrapper {
        position: relative;
      }

      .video-wrapper video {
        width: 100%;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
      }

      .video-wrapper p {
        margin: 5px 0 0 0;
        text-align: center;
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
      }

      .thumbnail {
        width: 100%;
        height: 180px;
        object-fit: cover;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
      }

      .no-videos {
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 16px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
      }

      .error-message {
        color: #ff4444;
        background: rgba(255, 68, 68, 0.1);
        padding: 15px;
        border-radius: 4px;
        margin: 10px 0;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  async loadVideos() {
    try {
      const response = await fetch('/list-processed-videos');
      const data = await response.json();
      
      console.log('Received video data:', data);
      
      if (data.status === 'error') {
        console.error('Error loading videos:', data.message);
        this.showError(`Error loading videos: ${data.message}`);
        return;
      }

      const grid = this.galleryContainer.querySelector('.gallery-grid');
      grid.innerHTML = '';
      
      if (!data.videos || data.videos.length === 0) {
        grid.innerHTML = '<div class="no-videos">No processed videos found</div>';
        return;
      }
      
      console.log(`Processing ${data.videos.length} videos`);
      
      // Group videos by pairs (original and depth)
      const videoMap = new Map();
      for (const video of data.videos) {
        const baseName = video.name.replace(/^(depth_)?/, '');
        if (!videoMap.has(baseName)) {
          videoMap.set(baseName, {});
        }
        if (video.is_depth) {
          videoMap.get(baseName).depth = video;
        } else {
          videoMap.get(baseName).original = video;
        }
      }

      console.log('Grouped videos:', Array.from(videoMap.entries()));

      // Create video elements for each pair
      for (const [baseName, pair] of videoMap) {
        if (pair.original && pair.depth) {
          const videoElement = document.createElement('div');
          videoElement.className = 'video-pair';
          
          const timestamp = new Date(pair.original.timestamp * 1000);
          const formattedDate = timestamp.toLocaleString();
          
          // Use thumbnail if available, otherwise show video preview
          const thumbnailHtml = pair.original.thumbnail_url ? 
            `<img src="${pair.original.thumbnail_url}" class="thumbnail" alt="Video thumbnail">` :
            `<video src="${pair.original.url}" class="thumbnail" preload="metadata"></video>`;
          
          videoElement.innerHTML = `
            <div class="video-info">
              <h3>${baseName}</h3>
              <p>Processed: ${formattedDate}</p>
              <p>Size: ${Math.round(pair.original.size / 1024 / 1024 * 100) / 100} MB</p>
            </div>
            ${thumbnailHtml}
            <div class="video-container">
              <div class="video-wrapper">
                <video src="${pair.original.url}" controls preload="none"></video>
                <p>Original Video</p>
              </div>
              <div class="video-wrapper">
                <video src="${pair.depth.url}" controls preload="none"></video>
                <p>Depth Map</p>
              </div>
            </div>
          `;

          // Add click handler to the video element
          videoElement.addEventListener('click', () => {
            this.loadVideo({
              original_url: pair.original.url,
              depth_url: pair.depth.url
            });
          });
          
          grid.appendChild(videoElement);
        }
      }
    } catch (error) {
      console.error('Failed to load videos:', error);
      this.showError(`Failed to load videos: ${error.message}`);
    }
  }

  loadVideo(video) {
    // Find video elements
    const originalVideo = document.querySelector('#original-video');
    const depthVideo = document.querySelector('#depth-video');
    
    // Update video sources
    if (originalVideo) {
      originalVideo.pause();  // Pause any existing playback
      originalVideo.currentTime = 0;  // Reset to beginning
      originalVideo.src = video.original_url;
      originalVideo.load();
    }
    
    if (depthVideo) {
      depthVideo.pause();  // Pause any existing playback
      depthVideo.currentTime = 0;  // Reset to beginning
      depthVideo.src = video.depth_url;
      depthVideo.load();
    }

    // Hide gallery and show controls
    this.hide();
    document.querySelector('.upload-container').style.display = 'none';

    // Clean up existing 3D effect before reinitializing
    if (window.cleanup) {
      window.cleanup();
    }

    // Wait for both videos to be ready before initializing 3D effect
    Promise.all([
      new Promise(resolve => {
        if (originalVideo.readyState >= 2) {
          resolve();
        } else {
          originalVideo.addEventListener('canplay', resolve, { once: true });
        }
      }),
      new Promise(resolve => {
        if (depthVideo.readyState >= 2) {
          resolve();
        } else {
          depthVideo.addEventListener('canplay', resolve, { once: true });
        }
      })
    ]).then(() => {
      // Initialize 3D effect
      if (window.init) {
        window.init();
      }
      // Start playback
      originalVideo.play().catch(console.error);
      depthVideo.play().catch(console.error);
    }).catch(console.error);
  }

  show() {
    this.galleryContainer.style.display = 'block';
    this.loadVideos();
  }

  hide() {
    this.galleryContainer.style.display = 'none';
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    this.galleryContainer.insertBefore(errorDiv, this.galleryContainer.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
  }
} 