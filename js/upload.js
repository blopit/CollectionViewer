/**
 * Video Upload and Depth Map Generation
 * This module handles video file upload and processing using the depth map generator.
 */

import { VideoGallery } from './gallery.js';

export class VideoUploader {
  constructor() {
    this.uploadContainer = null;
    this.filenameDisplay = null;
    this.progressBar = null;
    this.statusText = null;
    this.detailsContainer = null;
    this.uploadButton = null;
    this.gallery = new VideoGallery();
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

    // Create details container for processing info
    this.detailsContainer = document.createElement('div');
    this.detailsContainer.className = 'details-container';
    this.detailsContainer.style.display = 'none';
    progressContainer.appendChild(this.detailsContainer);

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
      <div class="upload-progress" style="display: none;">
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
        <div class="status-text">Uploading...</div>
        <div class="details-container"></div>
      </div>
      <button class="upload-button" disabled style="display: none;">Upload</button>
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

      .details-container {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }

      .upload-button {
        margin-top: 10px;
        padding: 8px 16px;
        background: #4d9fff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
        width: 100%;
      }

      .upload-button:hover:not(:disabled) {
        background: #83beff;
      }

      .upload-button:disabled {
        background: rgba(77, 159, 255, 0.3);
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);

    // Add to page
    const controlsPanel = document.querySelector('.controls-panel');
    controlsPanel?.insertBefore?.(this.uploadContainer, controlsPanel.firstChild);

    // Store elements
    this.progressBar = this.uploadContainer.querySelector('.progress-fill');
    this.statusText = this.uploadContainer.querySelector('.status-text');
    this.detailsContainer = this.uploadContainer.querySelector('.details-container');
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

  async handleFileSelect(file) {
    if (!file) return;

    // Show filename
    this.filenameDisplay.textContent = file.name;
    this.filenameDisplay.style.display = 'block';

    // Show progress elements
    this.progressBar.style.display = 'block';
    this.statusText.style.display = 'block';
    
    // Disable upload button
    this.setUploadButtonState(true);

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
      this.setUploadButtonState(false);
      
      // Hide filename on error
      this.filenameDisplay.style.display = 'none';
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

  async pollStatus(jobId) {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/status/${jobId}`);
        const data = await response.json();

        if (data.status === 'error') {
          clearInterval(pollInterval);
          this.statusText.textContent = `Error: ${data.message || 'Unknown error'}`;
          this.progressBar.style.width = '0%';
          this.setUploadButtonState(false);
          this.filenameDisplay.style.display = 'none';
          this.detailsContainer.style.display = 'none';
          return;
        }

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          this.progressBar.style.width = '100%';
          
          // Check if this was a cached result
          const isCached = data?.stats?.cached === true;
          this.statusText.textContent = isCached ? 'Using cached version!' : 'Processing complete!';
          
          // Reset UI after a delay
          const resetDelay = 5000; // 5 seconds to show final status
          setTimeout(() => {
            this.progressBar.style.width = '0%';
            this.progressBar.style.display = 'none';
            this.statusText.style.display = 'none';
            this.detailsContainer.style.display = 'none';
            this.filenameDisplay.style.display = 'none';
            this.setUploadButtonState(false);
          }, resetDelay);
          
          // Update video sources if available
          if (data.depth_video_url) {
            // Handle video source updates...
          }
        }
      } catch (error) {
        console.error('Status check error:', error);
        clearInterval(pollInterval);
        this.statusText.textContent = 'Error checking status';
        this.progressBar.style.width = '0%';
        this.setUploadButtonState(false);
        this.filenameDisplay.style.display = 'none';
        this.detailsContainer.style.display = 'none';
      }
    }, 1000);
  }
}