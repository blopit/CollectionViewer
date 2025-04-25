#!/usr/bin/env python3
"""
Random Video Depth Map Generator using Video Depth Anything

This script:
1. Fetches a random video from the API
2. Downloads it
3. Processes it with Video Depth Anything Small model (limited to 10 frames)
4. Saves both the original and depth videos
"""

import os
import requests
import json
import torch
import cv2
import numpy as np
from tqdm import tqdm
import time
import logging
import sys
from pathlib import Path
from datetime import datetime
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('depth_processing.log')
    ]
)
logger = logging.getLogger(__name__)

# Import Video Depth Anything
from video_depth_anything.video_depth import VideoDepthAnything
from utils.dc_utils import read_video_frames, save_video

class RandomVideoProcessor:
    def __init__(self, output_dir="outputs", max_retries=3, encoder="vits", input_size=518, max_res=1280, fp32=False, grayscale=False):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        self.max_retries = max_retries
        self.input_size = input_size
        self.max_res = max_res
        self.fp32 = fp32
        self.grayscale = grayscale
        
        # Initialize Video Depth Anything model
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"Using device: {self.device}")
        
        # Model configuration based on encoder type
        if encoder == "vits":
            checkpoint_path = 'checkpoints/video_depth_anything_vits.pth'
            self.model_config = {
                'encoder': 'vits',
                'features': 64,
                'out_channels': [48, 96, 192, 384]
            }
        else:  # vitl
            checkpoint_path = 'checkpoints/video_depth_anything_vitl.pth'
            self.model_config = {
                'encoder': 'vitl',
                'features': 64,
                'out_channels': [96, 192, 384, 768]
            }
        
        try:
            self.model = VideoDepthAnything(**self.model_config)
            self.model.load_state_dict(torch.load(checkpoint_path, map_location='cpu'), strict=True)
            self.model = self.model.to(self.device).eval()
            logger.info(f"Video Depth Anything model ({encoder}) loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise

    def fetch_random_video(self):
        """Fetch random video URL from API with retries"""
        api_url = "https://shrenp.com/fp17545703/random_video_api.php"
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Fetching random video from API (attempt {attempt + 1}/{self.max_retries})")
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
                head_response = requests.head(video_url, allow_redirects=True)
                
                if head_response.status_code == 200:
                    logger.info(f"Found valid video URL: {video_url}")
                    return video_url
                    
            except requests.exceptions.RequestException as e:
                logger.warning(f"API request failed (attempt {attempt + 1}): {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise Exception(f"Failed to fetch valid video after {self.max_retries} attempts")

    def download_video(self, url):
        """Download video from URL with retries"""
        logger.info(f"Starting video download from: {url}")
        
        for attempt in range(self.max_retries):
            try:
                response = requests.get(url, stream=True)
                response.raise_for_status()
                
                filename = url.split('/')[-1]
                if not filename.endswith('.mp4'):
                    filename = f"video_{int(time.time())}.mp4"
                    
                output_path = self.output_dir / filename
                
                total_size = int(response.headers.get('content-length', 0))
                block_size = 8192
                
                with open(output_path, 'wb') as f:
                    with tqdm(total=total_size, unit='B', unit_scale=True) as pbar:
                        for chunk in response.iter_content(chunk_size=block_size):
                            if chunk:
                                f.write(chunk)
                                pbar.update(len(chunk))
                
                return output_path
                
            except Exception as e:
                logger.warning(f"Download failed (attempt {attempt + 1}): {str(e)}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise Exception(f"Failed to download video after {self.max_retries} attempts")

    def process_video(self, input_path):
        """Process video with Video Depth Anything"""
        logger.info("Starting video processing...")
        
        input_path = Path(input_path)
        output_path = self.output_dir / f"{input_path.stem}_depth.mp4"
        
        try:
            # Read video frames (just 1 frame)
            logger.info("Reading video frames...")
            frames, target_fps = read_video_frames(
                str(input_path),
                process_length=1,  # Limit to 1 frame
                target_fps=-1,      # Use original FPS
                max_res=self.max_res
            )
            
            logger.info(f"Processing {len(frames)} frame at {target_fps} FPS")
            logger.info("Running depth estimation...")
            
            # Process frames with Video Depth Anything
            depths, fps = self.model.infer_video_depth(
                frames,
                target_fps,
                input_size=self.input_size,
                device=self.device,
                fp32=self.fp32
            )
            
            logger.info("Depth estimation complete, saving results...")
            
            # Save results
            logger.info("Saving source video...")
            save_video(frames, str(self.output_dir / f"{input_path.stem}_src.mp4"), fps=fps)
            logger.info("Saving depth map...")
            save_video(depths, str(output_path), fps=fps, is_depths=True, grayscale=self.grayscale)
            
            logger.info("Processing complete!")
            
            return output_path
            
        except Exception as e:
            logger.error(f"Error during video processing: {str(e)}")
            raise

    def process_random_video(self):
        """Main function to process a random video"""
        logger.info("\n=== Starting new processing session ===")
        logger.info(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
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
                'depth_video': str(output_path)
            }
            
        except Exception as e:
            logger.error(f"Error during processing: {str(e)}")
            return {
                'status': 'error',
                'error': str(e)
            }

def main():
    parser = argparse.ArgumentParser(description='Process random videos with Video Depth Anything')
    parser.add_argument('--output_dir', type=str, default='outputs', help='Output directory for processed videos')
    parser.add_argument('--encoder', type=str, default='vits', choices=['vits', 'vitl'], help='Model encoder type')
    parser.add_argument('--input_size', type=int, default=518, help='Input size for model inference')
    parser.add_argument('--max_res', type=int, default=1280, help='Maximum resolution for model inference')
    parser.add_argument('--fp32', action='store_true', help='Use FP32 precision for inference')
    parser.add_argument('--grayscale', action='store_true', help='Save grayscale depth maps')
    args = parser.parse_args()
    
    processor = RandomVideoProcessor(
        output_dir=args.output_dir,
        encoder=args.encoder,
        input_size=args.input_size,
        max_res=args.max_res,
        fp32=args.fp32,
        grayscale=args.grayscale
    )
    
    try:
        result = processor.process_random_video()
        
        if result['status'] == 'success':
            logger.info("\nVideo processing completed:")
            logger.info(f"- Input: {result['input_video']}")
            logger.info(f"- Output: {result['depth_video']}")
        else:
            logger.error(f"\nProcessing failed: {result['error']}")
            
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")

if __name__ == "__main__":
    main()