#!/usr/bin/env python3
"""
Random Video Depth Map Generator using Depth Anything V2

This script:
1. Fetches a random video from the API
2. Downloads it
3. Processes it with Depth Anything V2 Small model
4. Saves both the original and depth videos
"""

import os
import requests
import json
import torch
from pathlib import Path
from transformers import pipeline
import cv2
import numpy as np
from tqdm import tqdm
import time
import urllib.parse
import logging
import sys
from datetime import datetime
from PIL import Image
import imageio
import subprocess
import shutil
import multiprocessing
from queue import Empty
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import threading
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(processName)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('depth_processing.log')
    ]
)
logger = logging.getLogger(__name__)

class VideoProcessingManager:
    def __init__(self, max_concurrent=2):
        self.max_concurrent = max_concurrent
        self.active_processes = {}
        self.lock = threading.Lock()
        self.output_dir = Path("videos")
        self.output_dir.mkdir(exist_ok=True)
        
    def start_processing(self, video_path):
        """Start processing a new video"""
        process_id = str(uuid.uuid4())
        
        with self.lock:
            # Clean up completed processes
            self._cleanup_completed()
            
            # Check if we can start a new process
            if len(self.active_processes) >= self.max_concurrent:
                raise RuntimeError(f"Maximum concurrent processes ({self.max_concurrent}) reached")
            
            # Create process-specific output directory
            process_dir = self.output_dir / process_id
            process_dir.mkdir(exist_ok=True)
            
            # Start new process
            process = multiprocessing.Process(
                target=self._process_video_wrapper,
                args=(video_path, process_dir, process_id)
            )
            
            self.active_processes[process_id] = {
                'process': process,
                'status': 'starting',
                'start_time': time.time(),
                'output_dir': process_dir,
                'video_path': video_path
            }
            
            process.start()
            logger.info(f"Started processing video {video_path} with ID {process_id}")
            
            return process_id
    
    def get_status(self, process_id):
        """Get status of a specific process"""
        with self.lock:
            if process_id not in self.active_processes:
                return {'status': 'not_found'}
            
            process_info = self.active_processes[process_id]
            status_file = process_info['output_dir'] / 'status.json'
            
            if status_file.exists():
                try:
                    with open(status_file, 'r') as f:
                        return json.load(f)
                except:
                    pass
            
            return {
                'status': 'running' if process_info['process'].is_alive() else 'completed',
                'start_time': process_info['start_time'],
                'elapsed_time': time.time() - process_info['start_time']
            }
    
    def get_all_statuses(self):
        """Get status of all processes"""
        with self.lock:
            return {
                pid: self.get_status(pid)
                for pid in self.active_processes.keys()
            }
    
    def _cleanup_completed(self):
        """Clean up completed processes"""
        completed = []
        for pid, info in self.active_processes.items():
            if not info['process'].is_alive():
                info['process'].join()
                completed.append(pid)
        
        for pid in completed:
            del self.active_processes[pid]
    
    def _process_video_wrapper(self, video_path, output_dir, process_id):
        """Wrapper to handle video processing in separate process"""
        try:
            processor = RandomVideoProcessor(output_dir=output_dir)
            
            # Create and update status file
            status_file = output_dir / 'status.json'
            def update_status(status_data):
                with open(status_file, 'w') as f:
                    json.dump(status_data, f)
            
            update_status({
                'status': 'initializing',
                'process_id': process_id,
                'start_time': time.time()
            })
            
            # Process the video
            result = processor.process_video(video_path)
            
            update_status({
                'status': 'completed',
                'process_id': process_id,
                'output_path': str(result),
                'completion_time': time.time()
            })
            
        except Exception as e:
            logger.error(f"Error in process {process_id}: {str(e)}")
            update_status({
                'status': 'error',
                'process_id': process_id,
                'error': str(e),
                'error_time': time.time()
            })

class RandomVideoProcessor:
    def __init__(self, output_dir="videos", max_retries=3):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.max_retries = max_retries
        
        # Log system info
        logger.info("=== System Information ===")
        logger.info(f"Python version: {sys.version}")
        logger.info(f"PyTorch version: {torch.__version__}")
        logger.info(f"CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            logger.info(f"CUDA device: {torch.cuda.get_device_name(0)}")
        logger.info(f"OpenCV version: {cv2.__version__}")
        logger.info("=======================")
        
        # Initialize depth estimation model
        logger.info("Initializing Video-Depth-Anything Small...")
        start_time = time.time()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Use Video-Depth-Anything Small model
        MODEL_ID = "depth-anything/Video-Depth-Anything-Small"
        logger.info(f"Using model: {MODEL_ID}")
        
        try:
            self.depth_estimator = pipeline(
                task="depth-estimation",
                model=MODEL_ID,
                device=self.device
            )
            
            # Verify we got the correct model
            model_config = self.depth_estimator.model.config
            if not any(x in model_config.name_or_path.lower() for x in ["video-depth-anything", "small"]):
                raise ValueError("Incorrect model loaded - expected Video-Depth-Anything-Small")
                
            logger.info("✓ Successfully loaded Video-Depth-Anything-Small model")
            logger.info(f"Model config: {model_config.name_or_path}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Video-Depth-Anything-Small model: {str(e)}")
            raise
            
        load_time = time.time() - start_time
        logger.info(f"Model initialized on {self.device} (took {load_time:.2f}s)")
        
        # Log output directory
        logger.info(f"Output directory: {self.output_dir.absolute()}")

    def fetch_random_video(self):
        """Fetch random video URL from API with retries"""
        api_url = "https://shrenp.com/fp17545703/random_video_api.php"
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Fetching random video from API (attempt {attempt + 1}/{self.max_retries})")
                
                # First try direct access
                start_time = time.time()
                response = requests.get(api_url)
                response.raise_for_status()
                logger.info(f"Direct API access successful (took {time.time() - start_time:.2f}s)")
                
                # Log raw response for debugging
                logger.info(f"Raw API response: {response.text}")
                
                try:
                    data = response.json()
                    logger.info(f"Parsed JSON data: {data}")
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse JSON response: {str(e)}")
                    # If not JSON, try using the response text directly
                    data = {'url': response.text.strip()}
                
                # Get the filename from the response
                filename = data.get('file', '')
                if not filename:
                    logger.warning("No filename in response")
                    continue
                
                # Construct the correct URL
                video_url = f"https://shrenp.com/fp17545703/files/{filename}"
                logger.info(f"Constructed video URL: {video_url}")
                
                # Try to validate video URL exists
                logger.info(f"Validating URL: {video_url}")
                head_response = requests.head(video_url, allow_redirects=True)
                if head_response.status_code == 200:
                    logger.info(f"Found valid video URL: {video_url}")
                    return video_url
                else:
                    logger.warning(f"Video URL returned {head_response.status_code} for {video_url}, retrying...")
                    continue
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"API request failed (attempt {attempt + 1}): {str(e)}")
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.info(f"Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception(f"Failed to fetch valid video after {self.max_retries} attempts")

    def download_video(self, url):
        """Download video from URL with retries"""
        logger.info(f"Starting video download from: {url}")
        start_time = time.time()
        
        for attempt in range(self.max_retries):
            try:
                response = requests.get(url, stream=True)
                response.raise_for_status()
                
                # Extract filename from URL or generate timestamp-based name
                filename = url.split('/')[-1]
                if not filename.endswith('.mp4'):
                    filename = f"video_{int(time.time())}.mp4"
                    
                output_path = self.output_dir / filename
                logger.info(f"Will save video to: {output_path}")
                
                # Download with progress bar
                total_size = int(response.headers.get('content-length', 0))
                block_size = 8192
                downloaded_size = 0
                
                with open(output_path, 'wb') as f:
                    with tqdm(total=total_size, unit='B', unit_scale=True, desc=f"Downloading (attempt {attempt + 1})") as pbar:
                        for chunk in response.iter_content(chunk_size=block_size):
                            if chunk:
                                f.write(chunk)
                                downloaded_size += len(chunk)
                                pbar.update(len(chunk))
                
                # Verify the downloaded file
                if downloaded_size == 0:
                    raise Exception("Downloaded file is empty")
                
                download_time = time.time() - start_time
                download_speed = downloaded_size / (1024 * 1024 * download_time)  # MB/s
                
                logger.info(f"Download completed:")
                logger.info(f"- Time taken: {download_time:.2f}s")
                logger.info(f"- Average speed: {download_speed:.2f} MB/s")
                logger.info(f"- File size: {downloaded_size / (1024 * 1024):.2f} MB")
                
                return output_path
                
            except Exception as e:
                logger.warning(f"Download failed (attempt {attempt + 1}): {str(e)}")
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.info(f"Waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception(f"Failed to download video after {self.max_retries} attempts")

    def process_video(self, input_path):
        """Process video with Depth Anything V2 frame by frame"""
        logger.info("Starting video processing...")
        start_time = time.time()
        
        input_path = Path(input_path)
        output_path = input_path.parent / f"{input_path.stem}_depth.mp4"
        depth_frames_dir = input_path.parent / f"depth_frames_{input_path.stem}_{int(time.time())}"
        depth_frames_dir.mkdir(exist_ok=True)
        logger.info(f"Created depth frames directory: {depth_frames_dir}")
        
        cap = cv2.VideoCapture(str(input_path))
        if not cap.isOpened():
            raise Exception("Failed to open input video")
            
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        logger.info("Video information:")
        logger.info(f"- Resolution: {width}x{height}")
        logger.info(f"- FPS: {fps}")
        logger.info(f"- Total frames: {total_frames}")
        logger.info(f"- Duration: {total_frames/fps:.2f}s")
        
        # Process all frames
        frames_to_process = min(10, total_frames)  # Limit to 10 frames
        logger.info(f"Processing first {frames_to_process} frames out of {total_frames} total frames")
        frame_count = 0
        
        try:
            with tqdm(total=frames_to_process, desc="Generating depth maps") as pbar:
                while frame_count < frames_to_process:
                    try:
                        # Read frame
                        ret, frame = cap.read()
                        if not ret:
                            logger.warning(f"Failed to read frame {frame_count}, stopping")
                            break
                        
                        logger.info(f"\nProcessing frame {frame_count + 1}/{frames_to_process}")
                        
                        # Save original frame
                        orig_frame_path = depth_frames_dir / f"original_{frame_count:06d}.jpg"
                        cv2.imwrite(str(orig_frame_path), frame)
                        logger.info(f"Saved original frame: {orig_frame_path}")
                        
                        # Convert BGR to RGB
                        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        logger.info("Converted frame to RGB")
                        
                        # Convert to PIL Image
                        pil_image = Image.fromarray(frame_rgb)
                        logger.info(f"Converted to PIL Image: size={pil_image.size}, mode={pil_image.mode}")
                        
                        # Process frame with depth estimator
                        logger.info("Running depth estimation...")
                        try:
                            depth_result = self.depth_estimator(pil_image)
                            logger.info("Depth estimation completed")
                            logger.info(f"Depth result type: {type(depth_result)}")
                            
                            # Get depth map from result
                            if isinstance(depth_result, list) and len(depth_result) > 0:
                                depth_result = depth_result[0]
                            
                            if not isinstance(depth_result, dict):
                                raise ValueError(f"Unexpected depth result type: {type(depth_result)}")
                                
                            if "predicted_depth" not in depth_result:
                                raise ValueError(f"No predicted_depth in result. Keys: {depth_result.keys()}")
                                
                            depth_map = depth_result["predicted_depth"]
                            logger.info(f"Got depth map tensor: shape={depth_map.shape}, device={depth_map.device}")
                            
                            # Convert to numpy
                            depth_map = depth_map.cpu().numpy()
                            logger.info(f"Converted to numpy: shape={depth_map.shape}, dtype={depth_map.dtype}")
                            
                            # Save raw depth visualization
                            raw_depth_path = depth_frames_dir / f"raw_depth_{frame_count:06d}.png"
                            raw_depth_viz = ((depth_map - depth_map.min()) / (depth_map.max() - depth_map.min()) * 255).astype(np.uint8)
                            cv2.imwrite(str(raw_depth_path), raw_depth_viz)
                            logger.info(f"Saved raw depth visualization: {raw_depth_path}")
                            
                            # Normalize depth map
                            depth_min = np.percentile(depth_map, 2)
                            depth_max = np.percentile(depth_map, 98)
                            logger.info(f"Depth range: [{depth_min:.2f}, {depth_max:.2f}]")
                            
                            depth_map_normalized = np.clip(depth_map, depth_min, depth_max)
                            depth_map_normalized = ((depth_map_normalized - depth_min) / (depth_max - depth_min) * 255).astype(np.uint8)
                            logger.info(f"Normalized depth map: shape={depth_map_normalized.shape}, range=[{depth_map_normalized.min()}, {depth_map_normalized.max()}]")
                            
                            # Resize depth map
                            if depth_map_normalized.shape[:2] != (height, width):
                                depth_map_resized = cv2.resize(depth_map_normalized, (width, height), interpolation=cv2.INTER_LINEAR)
                                logger.info(f"Resized depth map to {depth_map_resized.shape}")
                            else:
                                depth_map_resized = depth_map_normalized
                            
                            # Save final depth frame
                            depth_frame_path = depth_frames_dir / f"depth_{frame_count:06d}.png"
                            cv2.imwrite(str(depth_frame_path), depth_map_resized)
                            logger.info(f"Saved depth frame: {depth_frame_path}")
                            
                        except Exception as e:
                            logger.error(f"Depth estimation failed: {str(e)}")
                            raise
                        
                        # Verify saved files
                        if not orig_frame_path.exists() or not depth_frame_path.exists():
                            raise Exception(f"Failed to save frames for frame {frame_count}")
                        
                        frame_count += 1
                        pbar.update(1)
                        
                    except Exception as e:
                        logger.error(f"Error processing frame {frame_count}: {str(e)}")
                        if frame_count == 0:  # If first frame fails, stop processing
                            raise
                        continue
            
            # List all generated files
            logger.info("\nGenerated files:")
            for f in depth_frames_dir.glob("*"):
                logger.info(f"- {f.name} ({f.stat().st_size / 1024:.1f}KB)")
            
            # Create video from depth frames if we have any
            depth_frames = list(depth_frames_dir.glob("depth_*.png"))
            if depth_frames:
                try:
                    cmd = [
                        "ffmpeg", "-y",
                        "-framerate", str(fps),
                        "-i", str(depth_frames_dir / "depth_%06d.png"),
                        "-c:v", "libx264",
                        "-preset", "medium",
                        "-crf", "23",
                        "-pix_fmt", "yuv420p",
                        str(output_path)
                    ]
                    
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode != 0:
                        raise Exception(f"FFmpeg error: {result.stderr}")
                    
                    logger.info("Video creation completed successfully")
                    
                except Exception as e:
                    logger.error(f"Error during video creation: {str(e)}")
                    raise
            else:
                logger.error("No depth frames were generated, skipping video creation")
            
        except Exception as e:
            logger.error(f"Error during video processing: {str(e)}")
            raise
        finally:
            # Clean up video capture
            cap.release()
            cv2.destroyAllWindows()
        
        total_time = time.time() - start_time
        logger.info("\nProcessing complete!")
        logger.info(f"Total time: {total_time:.2f}s")
        logger.info(f"Output saved to: {output_path}")
        
        return output_path

    def process_random_video(self):
        """Main function to process a random video with retries"""
        logger.info("\n=== Starting new processing session ===")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        start_time = time.time()
        for attempt in range(self.max_retries):
            try:
                logger.info(f"\nAttempting to process random video (attempt {attempt + 1}/{self.max_retries})")
                
                # Fetch and download video
                video_url = self.fetch_random_video()
                input_path = self.download_video(video_url)
                logger.info(f"Video downloaded to: {input_path}")
                
                # Process video
                output_path = self.process_video(input_path)
                logger.info(f"Depth map video saved to: {output_path}")
                
                return {
                    'status': 'success',
                    'input_video': str(input_path),
                    'depth_video': str(output_path),
                    'processing_time': time.time() - start_time,
                    'attempts': attempt + 1
                }
                
            except Exception as e:
                logger.error(f"Error during processing (attempt {attempt + 1}): {str(e)}", exc_info=True)
                if attempt < self.max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.info(f"Waiting {wait_time}s before retry with a different video...")
                    time.sleep(wait_time)
                    continue
                else:
                    return {
                        'status': 'error',
                        'error': str(e),
                        'attempts': attempt + 1
                    }

def main():
    # Create processing manager
    manager = VideoProcessingManager(max_concurrent=2)  # Allow 2 concurrent processes
    
    try:
        # Example: Process multiple videos
        video_paths = [
            # Add your video paths here
        ]
        
        process_ids = []
        for video_path in video_paths:
            try:
                process_id = manager.start_processing(video_path)
                process_ids.append(process_id)
                logger.info(f"Started processing {video_path} with ID {process_id}")
            except RuntimeError as e:
                logger.warning(f"Couldn't start processing {video_path}: {str(e)}")
        
        # Monitor progress
        while process_ids:
            statuses = manager.get_all_statuses()
            completed = []
            
            for pid in process_ids:
                if pid in statuses:
                    status = statuses[pid]
                    if status['status'] in ['completed', 'error']:
                        completed.append(pid)
                        logger.info(f"Process {pid} finished with status: {status['status']}")
                
            process_ids = [pid for pid in process_ids if pid not in completed]
            
            if process_ids:
                time.sleep(5)  # Wait before next check
    
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")

if __name__ == "__main__":
    main() 