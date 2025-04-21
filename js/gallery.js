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
    this.galleryContainer.innerHTML = `
      <style>
        .gallery-container {
          padding: 20px;
          background: #f5f5f5;
          min-height: 100vh;
        }
        
        .gallery-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .back-button {
          padding: 10px 20px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .back-button:hover {
          background: #1976D2;
        }
        
        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        
        .video-pair {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: transform 0.2s;
        }
        
        .video-pair:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .video-info {
          padding: 15px;
        }
        
        .video-info h3 {
          margin: 0 0 10px 0;
          font-size: 18px;
          color: #333;
        }
        
        .video-info p {
          margin: 5px 0;
          color: #666;
          font-size: 14px;
        }
        
        .thumbnail {
          width: 100%;
          height: 200px;
          object-fit: cover;
          border-bottom: 1px solid #eee;
        }
        
        .video-container {
          display: none;
        }
        
        .video-wrapper {
          margin: 10px;
        }
        
        .video-wrapper video {
          width: 100%;
          border-radius: 4px;
        }
        
        .video-wrapper p {
          text-align: center;
          margin: 5px 0;
          color: #666;
        }
        
        .no-videos {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 18px;
          grid-column: 1 / -1;
        }
        
        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 10px 20px;
          border-radius: 4px;
          margin-bottom: 20px;
          animation: fadeIn 0.3s;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="gallery-header">
        <button class="back-button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z" fill="currentColor"/>
          </svg>
          Back to Upload
        </button>
      </div>
      <div class="gallery-grid"></div>
    `;

    // Add back button handler
    const backButton = this.galleryContainer.querySelector('.back-button');
    backButton.addEventListener('click', () => {
      document.querySelector('.upload-container').style.display = 'block';
      this.hide();
      
      // Reset any active videos
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        video.pause();
        video.currentTime = 0;
      }
    });

    // Add gallery container to page
    document.body.appendChild(this.galleryContainer);
    this.hide();
  }

  async loadVideos() {
    try {
      const response = await fetch('/api/videos');
      const data = await response.json();
      
      console.log('Attempting to load gallery...');
      
      // Check if response is valid
      if (!response.ok) {
        console.error('Server error:', data.message || response.statusText);
        this.showError(`Server error: ${data.message || response.statusText}`);
        return;
      }
      
      console.log('Received video data:', data);
      
      // Check if we received a server status message instead of video data
      if (data.status && !data.videos) {
        console.log('Server is running but no videos data received');
        this.showError('No videos available. The server is running but no processed videos were found.');
        
        const grid = this.galleryContainer.querySelector('.gallery-grid');
        grid.innerHTML = '<div class="no-videos">No processed videos found. Try uploading a video first!</div>';
        return;
      }

      if (data.status === 'error') {
        console.error('Error loading videos:', data.message);
        this.showError(`Error loading videos: ${data.message}`);
        return;
      }

      const grid = this.galleryContainer.querySelector('.gallery-grid');
      grid.innerHTML = '';
      
      if (!data.videos || data.videos.length === 0) {
        console.log('No videos found in the gallery');
        grid.innerHTML = '<div class="no-videos">No processed videos found. Try uploading a video first!</div>';
        return;
      }
      
      console.log(`Found ${data.videos.length} videos to process`);
      
      // Group videos by base name (original, depth, and normal)
      const videoMap = new Map();
      for (const video of data.videos) {
        // Remove any prefix and extension to get base name
        const baseName = video.name.replace(/^(depth_|normal_)?/, '').replace(/\.mp4$/, '');
        if (!videoMap.has(baseName)) {
          videoMap.set(baseName, {});
        }
        if (video.name.startsWith('depth_')) {
          videoMap.get(baseName).depth = video;
        } else if (video.name.startsWith('normal_')) {
          videoMap.get(baseName).normal = video;
        } else {
          videoMap.get(baseName).original = video;
        }
      }

      console.log('Successfully grouped videos:', Array.from(videoMap.entries()));

      let videosAdded = 0;
      // Create video elements for each group
      for (const [baseName, group] of videoMap) {
        // Only require the original video to display the group
        if (group.original) {
          videosAdded++;
          const videoElement = document.createElement('div');
          videoElement.className = 'video-pair';
          
          const timestamp = new Date(group.original.timestamp * 1000);
          const formattedDate = timestamp.toLocaleString();
          
          // Use thumbnail if available, otherwise show video preview
          const thumbnailHtml = group.original.thumbnail_url ? 
            `<img src="${group.original.thumbnail_url}" class="thumbnail" alt="Video thumbnail">` :
            `<video src="${group.original.url}" class="thumbnail" preload="metadata"></video>`;
          
          let videoContainerHtml = `
            <div class="video-wrapper">
              <video src="${group.original.url}" controls preload="none"></video>
              <p>Original Video</p>
            </div>`;
            
          if (group.depth) {
            videoContainerHtml += `
              <div class="video-wrapper">
                <video src="${group.depth.url}" controls preload="none"></video>
                <p>Depth Map</p>
              </div>`;
          }
          
          if (group.normal) {
            videoContainerHtml += `
              <div class="video-wrapper">
                <video src="${group.normal.url}" controls preload="none"></video>
                <p>Normal Map</p>
              </div>`;
          }
          
          videoElement.innerHTML = `
            <div class="video-info">
              <h3>${baseName}</h3>
              <p>Processed: ${formattedDate}</p>
              <p>Size: ${Math.round(group.original.size / 1024 / 1024 * 100) / 100} MB</p>
            </div>
            ${thumbnailHtml}
            <div class="video-container">
              ${videoContainerHtml}
            </div>
          `;

          // Add click handler to the video element
          videoElement.addEventListener('click', () => {
            this.loadVideo({
              original_url: group.original.url,
              depth_url: group.depth?.url,
              normal_url: group.normal?.url
            });
          });
          
          grid.appendChild(videoElement);
        }
      }

      console.log(`Gallery loaded successfully: ${videosAdded} videos displayed`);
      if (videosAdded === 0) {
        grid.innerHTML = '<div class="no-videos">No viewable videos found. Make sure videos are properly processed!</div>';
      }
    } catch (error) {
      console.error('Failed to load gallery:', error);
      this.showError(`Failed to load gallery: ${error.message}`);
    }
  }

  loadVideo(video) {
    // Find video elements
    const originalVideo = document.querySelector('#original-video');
    const depthVideo = document.querySelector('#depth-video');
    const normalVideo = document.querySelector('#normal-video');
    
    // Update video sources
    if (originalVideo) {
      originalVideo.pause();  // Pause any existing playback
      originalVideo.currentTime = 0;  // Reset to beginning
      originalVideo.src = video.original_url;
      originalVideo.load();
    }
    
    if (depthVideo && video.depth_url) {
      depthVideo.pause();  // Pause any existing playback
      depthVideo.currentTime = 0;  // Reset to beginning
      depthVideo.src = video.depth_url;
      depthVideo.load();
    }
    
    if (normalVideo && video.normal_url) {
      normalVideo.pause();  // Pause any existing playback
      normalVideo.currentTime = 0;  // Reset to beginning
      normalVideo.src = video.normal_url;
      normalVideo.load();
    }

    // Hide gallery and show controls
    this.hide();
    document.querySelector('.upload-container').style.display = 'none';

    // Clean up existing 3D effect before reinitializing
    if (window.cleanup) {
      window.cleanup();
    }

    // Add error handlers for videos
    const handleVideoError = (videoEl, type, url) => {
      console.error(`${type} video loading error:`, videoEl.error);
      
      // Try with alternate URL for depth/normal videos (some mobile browsers have issues with the prefix)
      if ((type === 'Depth' && url.includes('/depth_')) || 
          (type === 'Normal' && url.includes('/normal_'))) {
        const altUrl = url.replace(/\/(depth_|normal_)/, '/');
        console.log(`Trying alternate URL for ${type.toLowerCase()} video: ${altUrl}`);
        videoEl.src = altUrl;
        videoEl.load();
        return true;
      }
      return false;
    };

    // Handle potential errors
    originalVideo.onerror = () => {
      handleVideoError(originalVideo, 'Original', video.original_url);
    };
    
    if (depthVideo && video.depth_url) {
      depthVideo.onerror = () => {
        handleVideoError(depthVideo, 'Depth', video.depth_url);
      };
    }
    
    if (normalVideo && video.normal_url) {
      normalVideo.onerror = () => {
        handleVideoError(normalVideo, 'Normal', video.normal_url);
      };
    }

    // Wait for all available videos to be ready before initializing 3D effect
    const videoPromises = [
      new Promise((resolve, reject) => {
        if (originalVideo.readyState >= 2) {
          resolve();
        } else {
          originalVideo.addEventListener('canplay', resolve, { once: true });
          originalVideo.addEventListener('error', () => {
            const retried = handleVideoError(originalVideo, 'Original', video.original_url);
            if (!retried) reject(new Error('Failed to load original video'));
          }, { once: true });
        }
      })
    ];

    if (depthVideo && video.depth_url) {
      videoPromises.push(new Promise((resolve, reject) => {
        if (depthVideo.readyState >= 2) {
          resolve();
        } else {
          depthVideo.addEventListener('canplay', resolve, { once: true });
          depthVideo.addEventListener('error', () => {
            const retried = handleVideoError(depthVideo, 'Depth', video.depth_url);
            if (!retried) reject(new Error('Failed to load depth video'));
          }, { once: true });
        }
      }));
    }

    if (normalVideo && video.normal_url) {
      videoPromises.push(new Promise((resolve, reject) => {
        if (normalVideo.readyState >= 2) {
          resolve();
        } else {
          normalVideo.addEventListener('canplay', resolve, { once: true });
          normalVideo.addEventListener('error', () => {
            const retried = handleVideoError(normalVideo, 'Normal', video.normal_url);
            if (!retried) reject(new Error('Failed to load normal video'));
          }, { once: true });
        }
      }));
    }

    Promise.all(videoPromises).then(() => {
      // Initialize 3D effect
      if (window.init) {
        window.init();
      }
      // Start playback
      originalVideo.play().catch(err => {
        console.error('Error playing original video:', err);
        // Show user-friendly error message
        this.showError('Could not play video. Try tapping on the screen (mobile) or check console for errors.');
      });
      if (depthVideo && video.depth_url) {
        depthVideo.play().catch(err => {
          console.error('Error playing depth video:', err);
        });
      }
      if (normalVideo && video.normal_url) {
        normalVideo.play().catch(err => {
          console.error('Error playing normal video:', err);
        });
      }
    }).catch(error => {
      console.error('Error loading videos:', error);
      this.showError('Error loading videos. Please try another video or refresh the page.');
    });
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