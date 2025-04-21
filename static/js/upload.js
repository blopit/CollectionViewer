/**
 * Video Upload and Depth/Normal Map Generation
 * This module handles video file upload and processing using the depth map generator.
 */

import { VideoGallery } from './gallery.js';
import { GyroControls } from './gyro-controls.js';

export class VideoUploader {
  constructor() {
    this.uploadContainer = null;
    this.filenameDisplay = null;
    this.progressBar = null;
    this.statusText = null;
    this.detailedStatus = null;
    this.uploadButton = null;
    this.gallery = new VideoGallery();
    this.gyroControls = new GyroControls(null);
    this.init();
  }

  init() {
    // Create upload container
    this.uploadContainer = document.createElement('div');
    this.uploadContainer.className = 'upload-container';

    // Create filename display
    this.filenameDisplay = document.createElement('div');
    this.filenameDisplay.className = 'filename-display';
    this.filenameDisplay.style.display = 'none';
    this.uploadContainer.appendChild(this.filenameDisplay);

    // Create progress elements
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    this.progressBar.style.display = 'none';
    progressContainer.appendChild(this.progressBar);

    this.statusText = document.createElement('div');
    this.statusText.className = 'status-text';
    this.statusText.style.display = 'none';
    progressContainer.appendChild(this.statusText);

    // Create detailed status container
    this.detailedStatus = document.createElement('div');
    this.detailedStatus.className = 'detailed-status';
    this.detailedStatus.style.display = 'none';
    progressContainer.appendChild(this.detailedStatus);

    this.uploadContainer.appendChild(progressContainer);

    // Create upload header with view toggle
    const header = document.createElement('div');
    header.className = 'upload-header';
    header.innerHTML = `
      <h2>Upload Video</h2>
      <button class="view-gallery">View Gallery</button>
    `;
    this.uploadContainer.appendChild(header);

    // Create upload form
    const form = document.createElement('div');
    form.className = 'upload-form';
    form.innerHTML = `
      <div class="upload-zone" id="upload-zone">
        <input type="file" id="file-input" accept="video/*" style="display: none;">
        <div class="upload-prompt">
          <svg width="50" height="50" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
          </svg>
          <p>Drop your video here or click to browse</p>
        </div>
      </div>
    `;
    this.uploadContainer.appendChild(form);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .upload-container {
        margin-bottom: 20px;
        padding: 15px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
      }

      .upload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
      }

      .upload-header h2 {
        margin: 0;
        font-size: 18px;
        color: #4d9fff;
      }

      .view-gallery {
        padding: 8px 12px;
        background: #4d9fff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
      }

      .view-gallery:hover {
        background: #83beff;
      }

      .upload-zone {
        border: 2px dashed rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 30px;
        text-align: center;
        cursor: pointer;
        transition: border-color 0.2s, background-color 0.2s;
      }

      .upload-zone:hover {
        border-color: #4d9fff;
        background: rgba(77, 159, 255, 0.05);
      }

      .upload-prompt {
        color: rgba(255, 255, 255, 0.7);
      }

      .upload-prompt svg {
        margin-bottom: 10px;
      }

      .progress-bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        margin: 15px 0;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        width: 0;
        background: #4d9fff;
        transition: width 0.3s ease;
      }

      .status-text {
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 10px;
      }

      .detailed-status {
        font-family: monospace;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        background: rgba(0, 0, 0, 0.2);
        padding: 10px;
        border-radius: 4px;
        margin-top: 10px;
        white-space: pre-wrap;
      }
    `;
    document.head.appendChild(style);

    // Add to page
    const controlsPanel = document.querySelector('.controls-panel');
    if (controlsPanel?.firstChild) {
      controlsPanel.insertBefore(this.uploadContainer, controlsPanel.firstChild);
    } else if (controlsPanel) {
      controlsPanel.appendChild(this.uploadContainer);
    }

    // Store elements
    this.progressBar = this.uploadContainer.querySelector('.progress-bar');
    this.statusText = this.uploadContainer.querySelector('.status-text');
    this.uploadButton = this.uploadContainer.querySelector('.upload-button');

    // Add event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    const uploadZone = this.uploadContainer.querySelector('#upload-zone');
    const fileInput = this.uploadContainer.querySelector('#file-input');
    const viewGalleryBtn = this.uploadContainer.querySelector('.view-gallery');

    // File input change handler
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFileSelect(file);
      }
    });

    // Drag and drop handlers
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = '#4d9fff';
      uploadZone.style.background = 'rgba(77, 159, 255, 0.05)';
    });

    uploadZone.addEventListener('dragleave', () => {
      uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      uploadZone.style.background = 'none';
    });

    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      uploadZone.style.background = 'none';
      
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        this.handleFileSelect(file);
      }
    });

    // Gallery view toggle
    viewGalleryBtn.addEventListener('click', () => {
      this.uploadContainer.style.display = 'none';
      this.gallery.show();
    });
  }

  setUploadButtonState(isDisabled, shouldShow = true) {
    const button = this.uploadButton;
    if (button) {
      button.disabled = isDisabled;
      button.style.display = shouldShow ? 'block' : 'none';
    }
  }

  updateDetailedStatus(data) {
    // Show detailed status container
    this.detailedStatus.style.display = 'block';

    let details = '';

    // Add stage information
    if (data.stage) {
      details += `Stage: ${data.stage}\n`;
    }

    // Add progress information
    if (data.progress !== undefined && data.total !== undefined) {
      const percent = Math.round((data.progress / data.total) * 100);
      details += `Progress: ${percent}%\n`;
    }

    // Add extra information based on stage
    if (data.extra_info) {
      if (data.extra_info.frames_processed !== undefined && data.extra_info.total_frames !== undefined) {
        details += `Frames: ${data.extra_info.frames_processed}/${data.extra_info.total_frames}\n`;
      }
      if (data.extra_info.processing_info) {
        details += `Info: ${data.extra_info.processing_info}\n`;
      }
    }

    // Add completion stats
    if (data.stats) {
      if (data.stats.resolution) {
        details += `Resolution: ${data.stats.resolution}\n`;
      }
      if (data.stats.fps) {
        details += `FPS: ${data.stats.fps}\n`;
      }
      if (data.stats.total_frames) {
        details += `Total Frames: ${data.stats.total_frames}\n`;
      }
      if (data.stats.processing_time) {
        details += `Processing Time: ${data.stats.processing_time}s\n`;
      }
    }

    this.detailedStatus.textContent = details;
  }

  async pollStatus(jobId) {
    try {
      const response = await fetch(`/status/${jobId}`);
      const data = await response.json();

      // Update progress bar
      if (data.progress !== undefined && data.total !== undefined) {
        const percent = Math.round((data.progress / data.total) * 100);
        this.progressBar.innerHTML = `<div class="progress-fill" style="width: ${percent}%"></div>`;
      }

      // Update status text
      if (data.message) {
        this.statusText.textContent = data.message;
      }

      // Update detailed status
      let details = '';
      if (data.stage) {
        details += `Stage: ${data.stage}\n`;
      }
      if (data.progress !== undefined && data.total !== undefined) {
        const percent = Math.round((data.progress / data.total) * 100);
        details += `Progress: ${percent}%\n`;
      }
      if (data.stats) {
        details += '\nStats:\n';
        for (const [key, value] of Object.entries(data.stats)) {
          details += `${key}: ${value}\n`;
        }
      }
      this.detailedStatus.textContent = details;

      // Check if processing is complete
      if (data.status === 'completed') {
        this.progressBar.innerHTML = '<div class="progress-fill" style="width: 100%"></div>';
        this.statusText.textContent = 'Processing complete!';
        
        // Add video preview with gyroscope controls
        const previewContainer = document.createElement('div');
        previewContainer.className = 'video-preview';

        // Create video grid container
        const videoGrid = document.createElement('div');
        videoGrid.className = 'video-grid';

        // Add each video with its container
        const videos = [
          { title: 'Original Video', url: data.original_video_url },
          { title: 'Depth Map', url: data.depth_video_url },
          { title: 'Normal Map', url: data.normal_video_url }
        ];

        for (const { title, url } of videos) {
          const videoItem = document.createElement('div');
          videoItem.className = 'video-item';
          
          const heading = document.createElement('h3');
          heading.textContent = title;
          
          const videoContainer = document.createElement('div');
          videoContainer.className = 'video-container';
          
          const video = document.createElement('video');
          video.src = url;
          video.controls = true;
          
          videoContainer.appendChild(video);
          videoItem.appendChild(heading);
          videoItem.appendChild(videoContainer);
          videoGrid?.appendChild(videoItem);

          // Enable gyro controls for this video container if on mobile
          if (this.gyroControls.isMobileDevice() && this.gyroControls.hasGyroscope()) {
            // Add gyro toggle button
            const gyroButton = document.createElement('button');
            gyroButton.className = 'gyro-toggle';
            gyroButton.innerHTML = `
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12,2L7,7H11V13H13V7H17L12,2M17,17H7V15H17V17Z"/>
              </svg>
              Enable Gyro
            `;
            videoItem.appendChild(gyroButton);

            let isGyroEnabled = false;
            gyroButton.addEventListener('click', async () => {
              if (!isGyroEnabled) {
                const enabled = await this.gyroControls.enable();
                if (enabled) {
                  this.gyroControls.setVideoContainer(videoContainer);
                  gyroButton.classList.add('active');
                  gyroButton.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path fill="currentColor" d="M12,2L7,7H11V13H13V7H17L12,2M17,17H7V15H17V17Z"/>
                    </svg>
                    Disable Gyro
                  `;
                  isGyroEnabled = true;
                }
              } else {
                this.gyroControls.disable();
                gyroButton.classList.remove('active');
                gyroButton.innerHTML = `
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12,2L7,7H11V13H13V7H17L12,2M17,17H7V15H17V17Z"/>
                  </svg>
                  Enable Gyro
                `;
                isGyroEnabled = false;
              }
            });
          }
        }

        previewContainer?.appendChild(videoGrid);

        // Add styles for the video grid and gyro controls
        const style = document.createElement('style');
        style.textContent = `
          .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }

          .video-item {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            padding: 15px;
          }

          .video-item h3 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #4d9fff;
          }

          .video-container {
            position: relative;
            width: 100%;
            transform-style: preserve-3d;
            transition: transform 0.1s ease-out;
          }

          .video-container video {
            width: 100%;
            border-radius: 4px;
          }

          .gyro-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 10px;
            padding: 8px 12px;
            background: rgba(77, 159, 255, 0.1);
            border: 1px solid rgba(77, 159, 255, 0.2);
            border-radius: 4px;
            color: #4d9fff;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .gyro-toggle:hover {
            background: rgba(77, 159, 255, 0.2);
          }

          .gyro-toggle.active {
            background: #4d9fff;
            color: white;
          }

          .gyro-toggle svg {
            width: 20px;
            height: 20px;
          }

          @media (max-width: 768px) {
            .video-grid {
              grid-template-columns: 1fr;
            }
          }
        `;
        document.head.appendChild(style);

        this.uploadContainer.appendChild(previewContainer);
        return true;
      }

      // Continue polling
      setTimeout(() => this.pollStatus(jobId), 1000);
      return false;
    } catch (error) {
      console.error('Error polling status:', error);
      this.statusText.textContent = 'Error checking processing status';
      return true;
    }
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async handleFileSelect(file) {
    if (!file) return;

    // Show filename
    this.filenameDisplay.textContent = file.name;
    this.filenameDisplay.style.display = 'block';

    // Show progress elements
    this.progressBar.style.display = 'block';
    this.statusText.style.display = 'block';

    // Initial status
    this.statusText.textContent = 'Converting video...';
    this.progressBar.style.width = '10%';

    try {
      // Convert video to base64
      const base64Video = await this.fileToBase64(file);

      // Update status for upload
      this.statusText.textContent = 'Uploading video...';
      this.progressBar.style.width = '30%';

      // Send to server
      const response = await fetch('/generate-depth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video: base64Video,
          model: 'small', // Use small model for faster processing
          foreground_method: 'bgsubtract',
          threshold: '0.2'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to upload video');
      }

      const data = await response.json();
      
      // Update status for processing
      this.statusText.textContent = 'Processing video...';
      this.progressBar.style.width = '50%';
      
      // Start polling for status
      this.pollStatus(data.job_id);

    } catch (error) {
      console.error('Upload error:', error);
      this.statusText.textContent = `Error: ${error.message}`;
      this.progressBar.style.width = '0%';
      this.detailedStatus.style.display = 'none';
      
      // Hide filename on error
      this.filenameDisplay.style.display = 'none';
    }
  }
}