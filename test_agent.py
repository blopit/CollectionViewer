#!/usr/bin/env python3

from process_random_video import VideoProcessingManager
import logging
import time
from transformers import pipeline
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
import requests
from tqdm import tqdm
import json
import torch

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(processName)s: %(message)s'
)
logger = logging.getLogger(__name__)

class SimpleVideoProcessor:
    def __init__(self, output_dir="videos"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.max_retries = 3
        
        # Use DPT model instead which is available in transformers
        logger.info("Initializing DPT depth estimation model...")
        self.depth_estimator = pipeline(
            task="depth-estimation",
            model="Intel/dpt-large"
        )
        logger.info("Model initialized successfully")
    
    def fetch_random_video(self):
        """Fetch random video URL from API"""
        api_url = "https://shrenp.com/fp17545703/random_video_api.php"
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Fetching random video (attempt {attempt + 1}/{self.max_retries})")
                response = requests.get(api_url)
                response.raise_for_status()
                
                try:
                    data = response.json()
                except json.JSONDecodeError:
                    data = {'file': response.text.strip()}
                
                filename = data.get('file', '')
                if not filename:
                    continue
                
                video_url = f"https://shrenp.com/fp17545703/files/{filename}"
                
                # Validate URL
                head_response = requests.head(video_url, allow_redirects=True)
                if head_response.status_code == 200:
                    logger.info(f"Found valid video URL: {video_url}")
                    return video_url
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"API request failed: {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
        
        raise Exception(f"Failed to fetch valid video after {self.max_retries} attempts")
    
    def download_video(self, url):
        """Download video from URL"""
        logger.info(f"Downloading video from: {url}")
        
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        filename = url.split('/')[-1]
        if not filename.endswith('.mp4'):
            filename = f"video_{int(time.time())}.mp4"
            
        output_path = self.output_dir / filename
        
        total_size = int(response.headers.get('content-length', 0))
        block_size = 8192
        
        with open(output_path, 'wb') as f:
            with tqdm(total=total_size, unit='B', unit_scale=True, desc="Downloading") as pbar:
                for chunk in response.iter_content(chunk_size=block_size):
                    if chunk:
                        f.write(chunk)
                        pbar.update(len(chunk))
        
        return output_path
    
    def process_video(self, video_path):
        """Process video with depth estimation"""
        logger.info(f"Processing video: {video_path}")
        
        video_path = Path(video_path)
        output_path = video_path.parent / f"{video_path.stem}_depth.mp4"
        
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise Exception("Failed to open video file")
        
        # Get video properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Create video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        
        try:
            # Process first 10 frames
            frames_to_process = min(10, total_frames)
            with tqdm(total=frames_to_process, desc="Processing frames") as pbar:
                for frame_idx in range(frames_to_process):
                    ret, frame = cap.read()
                    if not ret:
                        break
                    
                    # Convert BGR to RGB
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    pil_image = Image.fromarray(frame_rgb)
                    
                    # Get depth map
                    depth_result = self.depth_estimator(pil_image)
                    depth_map = depth_result['predicted_depth']
                    
                    # Convert tensor to numpy array
                    depth_map = depth_map.cpu().numpy()
                    
                    # Normalize depth map
                    depth_min = np.percentile(depth_map, 2)
                    depth_max = np.percentile(depth_map, 98)
                    depth_map = np.clip(depth_map, depth_min, depth_max)
                    depth_map = ((depth_map - depth_min) / (depth_max - depth_min) * 255).astype(np.uint8)
                    
                    # Resize depth map to match input frame size
                    depth_map = cv2.resize(depth_map, (width, height))
                    
                    # Convert to 3-channel image
                    depth_map_colored = cv2.applyColorMap(depth_map, cv2.COLORMAP_INFERNO)
                    
                    # Write frame
                    out.write(depth_map_colored)
                    pbar.update(1)
        
        finally:
            cap.release()
            out.release()
            cv2.destroyAllWindows()
        
        logger.info(f"Processed video saved to: {output_path}")
        return output_path

def main():
    # Create processing manager with 1 concurrent process
    manager = VideoProcessingManager(max_concurrent=1)
    processor = SimpleVideoProcessor()
    
    try:
        # Get random video URL
        video_url = processor.fetch_random_video()
        
        # Download and process video
        logger.info("Starting video processing...")
        video_path = processor.download_video(video_url)
        logger.info(f"Video downloaded to: {video_path}")
        
        output_path = processor.process_video(video_path)
        logger.info(f"Processing complete! Output saved to: {output_path}")
            
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")

if __name__ == "__main__":
    main() 