/**
 * Gyroscope Controls for Mobile Video Viewing
 * This module handles device orientation for interactive video viewing on mobile.
 */

export class GyroControls {
  constructor(videoContainer) {
    this.videoContainer = videoContainer;
    this.isEnabled = false;
    this.initialOrientation = null;
    this.lastGamma = 0;
    this.lastBeta = 0;
    this.smoothingFactor = 0.2; // Adjust for smoother/faster response
    this.maxTilt = 30; // Maximum tilt angle in degrees

    // Bind methods
    this.handleOrientation = this.handleOrientation.bind(this);
    this.enable = this.enable.bind(this);
    this.disable = this.disable.bind(this);
  }

  async requestPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.error('Error requesting device orientation permission:', error);
        return false;
      }
    }
    // If requestPermission is not available, assume it's allowed
    return true;
  }

  async enable() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      console.warn('Device orientation permission denied');
      return false;
    }

    window.addEventListener('deviceorientation', this.handleOrientation);
    this.isEnabled = true;
    this.initialOrientation = null;
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.isEnabled = false;
    this.initialOrientation = null;
    
    // Reset video container transform
    if (this.videoContainer) {
      this.videoContainer.style.transform = 'none';
    }
  }

  handleOrientation(event) {
    if (!this.isEnabled || !this.videoContainer) return;

    // Get orientation values
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;

    // Set initial orientation on first reading
    if (this.initialOrientation === null) {
      this.initialOrientation = { beta, gamma };
      return;
    }

    // Calculate relative orientation
    const relativeBeta = beta - this.initialOrientation.beta;
    const relativeGamma = gamma - this.initialOrientation.gamma;

    // Apply smoothing
    this.lastBeta = this.lastBeta + (relativeBeta - this.lastBeta) * this.smoothingFactor;
    this.lastGamma = this.lastGamma + (relativeGamma - this.lastGamma) * this.smoothingFactor;

    // Clamp values
    const clampedBeta = Math.max(-this.maxTilt, Math.min(this.maxTilt, this.lastBeta));
    const clampedGamma = Math.max(-this.maxTilt, Math.min(this.maxTilt, this.lastGamma));

    // Apply transform
    this.videoContainer.style.transform = `
      perspective(1000px)
      rotateX(${-clampedBeta}deg)
      rotateY(${clampedGamma}deg)
    `;
  }

  setVideoContainer(container) {
    this.videoContainer = container;
    if (this.videoContainer) {
      this.videoContainer.style.transition = 'transform 0.1s ease-out';
    }
  }

  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  hasGyroscope() {
    return window.DeviceOrientationEvent !== undefined;
  }
} 