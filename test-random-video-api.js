// Test configuration
const config = {
  apiEndpoint: 'https://shrenp.com/fp17545703/random_video_api.php',
  proxyEndpoint: 'https://api.allorigins.win/raw',
  localVideoUrl: 'http://localhost:5678/video.mp4',
  localDepthUrl: 'http://localhost:5678/depth_video.mp4',
  maxConcurrentProcessing: 3, // Maximum number of videos to process simultaneously
  processingTimeout: 300000, // 5 minutes timeout for depth map generation
  debug: true // Enable debug logging
};

// Queue for managing depth map processing
class ProcessingQueue {
  constructor() {
    this.queue = [];
    this.processing = new Set();
    this.results = new Map();
    if (config.debug) console.log('ProcessingQueue initialized');
  }

  async add(videoData) {
    const id = crypto.randomUUID();
    this.queue.push({ id, videoData });
    if (config.debug) console.log(`Added to queue - ID: ${id}`, videoData);
    this.processNext();
    return id;
  }

  async processNext() {
    if (this.processing.size >= config.maxConcurrentProcessing || this.queue.length === 0) {
      if (config.debug) console.log(`Queue status - Processing: ${this.processing.size}, Queued: ${this.queue.length}`);
      return;
    }

    const { id, videoData } = this.queue.shift();
    this.processing.add(id);
    if (config.debug) console.log(`Starting processing - ID: ${id}`);

    try {
      const result = await processVideo(videoData);
      this.results.set(id, { status: 'completed', result });
      if (config.debug) console.log(`Processing completed - ID: ${id}`, result);
    } catch (error) {
      this.results.set(id, { status: 'failed', error: error.message });
      if (config.debug) console.error(`Processing failed - ID: ${id}`, error);
    }

    this.processing.delete(id);
    this.processNext();
  }

  getStatus(id) {
    const status = this.processing.has(id) 
      ? { status: 'processing' }
      : this.results.get(id) || { status: 'queued' };
    
    if (config.debug) console.log(`Status check - ID: ${id}`, status);
    return status;
  }
}

// Create processing queue instance
const processingQueue = new ProcessingQueue();

// Helper function to check if running locally
function isLocalDevelopment() {
  return window.location.hostname === 'localhost';
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Function to process a single video
async function processVideo(videoData) {
  const startTime = Date.now();
  console.log('Processing video:', videoData);

  // Validate video accessibility
  const videoUrl = videoData.url || videoData.file && `https://shrenp.com/files/${videoData.file}`;
  if (!videoUrl) {
    throw new Error('Invalid video URL');
  }

  // Check if video is accessible
  try {
    const videoCheck = await fetchWithTimeout(videoUrl, { method: 'HEAD' });
    if (!videoCheck.ok) {
      throw new Error(`Video not accessible: ${videoCheck.status}`);
    }
  } catch (error) {
    if (!isLocalDevelopment()) {
      throw new Error(`Video accessibility check failed: ${error.message}`);
    }
  }

  // Generate or fetch depth map URL
  const depthUrl = videoData.depth_url || (() => {
    const videoPath = videoUrl.substring(0, videoUrl.lastIndexOf('.'));
    const videoExt = videoUrl.substring(videoUrl.lastIndexOf('.'));
    return `${videoPath}_depth${videoExt}`;
  })();

  // Check if depth map exists
  let depthMapExists = false;
  try {
    if (videoData.depth_url) {
      depthMapExists = true;
    } else {
      const depthResponse = await fetchWithTimeout(depthUrl, { method: 'HEAD' });
      depthMapExists = depthResponse.ok;
    }
  } catch (error) {
    console.log('Depth map not found, will need to generate:', error);
  }

  if (!depthMapExists && !isLocalDevelopment()) {
    // Here you would implement the depth map generation
    // For now, we'll simulate it with a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Depth map generation simulated');
  }

  const processingTime = Date.now() - startTime;
  return {
    videoUrl,
    depthUrl,
    depthMapExists,
    processingTime,
    timestamp: new Date().toISOString()
  };
}

// Main test function
async function testRandomVideoAPI(count = 1) {
  const results = [];
  const processingIds = [];

  try {
    for (let i = 0; i < count; i++) {
      let response;

      if (isLocalDevelopment()) {
        response = {
          ok: true,
          json: async () => ({
            url: config.localVideoUrl,
            depth_url: config.localDepthUrl
          })
        };
      } else {
        try {
          response = await fetchWithTimeout(config.apiEndpoint, {
            mode: 'cors',
            headers: { 'Accept': 'application/json' }
          });
        } catch (error) {
          console.log('Direct CORS request failed, trying proxy:', error);
          const proxyUrl = `${config.proxyEndpoint}?url=${encodeURIComponent(config.apiEndpoint)}`;
          response = await fetchWithTimeout(proxyUrl);
        }
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const processingId = await processingQueue.add(data);
      processingIds.push(processingId);
      console.log(`Added video ${i + 1}/${count} to processing queue. ID: ${processingId}`);
    }

    // Monitor processing status
    const checkResults = async () => {
      const allComplete = processingIds.every(id => {
        const status = processingQueue.getStatus(id);
        return status.status === 'completed' || status.status === 'failed';
      });

      if (allComplete) {
        for (const id of processingIds) {
          const status = processingQueue.getStatus(id);
          results.push(status);
        }
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      return checkResults();
    };

    await checkResults();
    return results;

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Export test functions with enhanced logging
window.testAPI = {
  runTest: async (count = 1) => {
    console.log(`Starting test with ${count} video(s)`);
    const results = await testRandomVideoAPI(count);
    console.log('Test completed:', results);
    return results;
  },
  getQueueStatus: () => {
    const status = {
      queueLength: processingQueue.queue.length,
      processing: Array.from(processingQueue.processing),
      results: Array.from(processingQueue.results.entries())
    };
    console.log('Current queue status:', status);
    return status;
  }
};

// Add a helper function to clear results for fresh tests
window.testAPI.clearResults = () => {
  processingQueue.queue = [];
  processingQueue.processing.clear();
  processingQueue.results.clear();
  console.log('Test results cleared');
};

// Example usage in console:
// await testAPI.runTest(3) // Process 3 videos simultaneously
// testAPI.getQueueStatus() // Check queue status 