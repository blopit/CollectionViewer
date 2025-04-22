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
    this.detailedStatus = null;
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
      <div class="upload-options">
        <div class="option-group">
          <label for="model-select">Depth Model:</label>
          <select id="model-select">
            <option value="small">MiDaS Small (Fast)</option>
            <option value="large">MiDaS Large (Better Quality)</option>
            <option value="dav2-small">Depth Anything V2 Small</option>
            <option value="dav2-base">Depth Anything V2 Base</option>
            <option value="dav2-large">Depth Anything V2 Large</option>
          </select>
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

      .upload-options {
        margin-top: 15px;
      }

      .option-group {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
      }

      .option-group label {
        width: 120px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
      }

      .option-group select {
        flex: 1;
        padding: 8px;
        background: rgba(0, 0, 0, 0.2);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        outline: none;
      }

      .option-group select:focus {
        border-color: #4d9fff;
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
    controlsPanel?.insertBefore?.(this.uploadContainer, controlsPanel.firstChild);

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

      // Update progress bar based on stage
      let progress = 0;
      switch (data.stage) {
        case 'loading_model':
          progress = 30;
          break;
        case 'extracting_frames':
          progress = 40 + (data.progress / data.total) * 20;
          break;
        case 'processing':
        case 'generating_depth':
          progress = 60 + (data.progress / data.total) * 30;
          break;
        case 'creating_video':
        case 'encoding_video':
          progress = 90;
          break;
        case 'finished':
          progress = 100;
          break;
        default:
          progress = 50;
      }

      // Update UI elements
      this.progressBar.style.width = `${progress}%`;
      this.statusText.textContent = data.message || 'Processing...';
      
      // Extract frame info from message if available
      let framesInfo = {};
      if (data?.message?.includes('frame')) {
        const match = data.message.match(/frame (\d+)\/(\d+)/i);
        if (match) {
          framesInfo = {
            frames_processed: Number.parseInt(match[1], 10),
            total_frames: Number.parseInt(match[2], 10)
          };
        }
      }

      // Prepare detailed status data
      const statusData = {
        stage: data.stage,
        progress: data.progress,
        total: data.total,
        extra_info: {
          ...framesInfo,
          // Add any log information if available
          ...(data.log ? { processing_info: data.log } : {})
        },
        stats: data.stats || {}
      };

      // Update the detailed status
      this.updateDetailedStatus(statusData);

      if (data.status === 'completed') {
        // Show completion stats
        const completionStats = {
          stage: 'finished',
          progress: 100,
          total: 100,
          stats: {
            resolution: data.stats?.resolution || 'unknown',
            fps: data.stats?.fps || 'unknown',
            total_frames: data.stats?.total_frames || 'unknown',
            processing_time: data.stats?.processing_time ? `${data.stats.processing_time}s` : 'unknown'
          }
        };
        this.updateDetailedStatus(completionStats);

        // Keep detailed status visible for a few seconds after completion
        setTimeout(() => {
          this.detailedStatus.style.display = 'none';
          this.progressBar.style.display = 'none';
          this.statusText.style.display = 'none';
          this.filenameDisplay.style.display = 'none';
        }, 5000);

        // Show gallery
        const gallery = document.querySelector('.gallery-container');
        if (gallery) {
          gallery.style.display = 'block';
          this.uploadContainer.style.display = 'none';
        }
      } else if (data.status === 'error') {
        throw new Error(data.message || 'Processing failed');
      } else {
        // Continue polling
        setTimeout(() => this.pollStatus(jobId), 1000);
      }
    } catch (error) {
      console.error('Status polling error:', error);
      this.statusText.textContent = `Error: ${error.message}`;
      this.progressBar.style.width = '0%';
      this.detailedStatus.style.display = 'none';
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

      // Get model selection
      const modelSelect = this.uploadContainer.querySelector('#model-select');
      const selectedModel = modelSelect?.value || 'small';

      // Send to server
      const response = await fetch('/generate-depth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video: base64Video,
          model: selectedModel,
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