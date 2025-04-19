#!/usr/bin/env python3
"""
Generate depth maps from a video using MiDaS.
This script extracts frames from a video, generates depth maps,
and then recompiles the depth maps into a video.

Usage:
    python generate_depth_maps.py --input <input_video> --output <output_video>

Requirements:
    - PyTorch
    - OpenCV
    - NumPy
    - ffmpeg (command line tool)
"""

import os
import sys
import argparse
import subprocess
import torch
import cv2
import numpy as np
from tqdm import tqdm
from torchvision.transforms import Compose, Resize, ToTensor, Normalize
from PIL import Image


def extract_frames(video_path, frames_dir):
    """Extract frames from a video file using ffmpeg."""
    os.makedirs(frames_dir, exist_ok=True)
    
    # Use ffmpeg to extract frames
    command = [
        'ffmpeg', '-i', video_path, 
        '-q:v', '1',  # Highest quality
        os.path.join(frames_dir, 'frame-%05d.png')
    ]
    
    print(f"Extracting frames from {video_path}...")
    subprocess.run(command, check=True)
    print(f"Frames extracted to {frames_dir}")


def generate_depth_maps(frames_dir, depth_dir):
    """Generate depth maps for frames using MiDaS."""
    os.makedirs(depth_dir, exist_ok=True)
    
    # Load MiDaS model
    print("Loading MiDaS model...")
    midas = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small')
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    midas.to(device)
    midas.eval()
    
    # Input transformation
    midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
    transform = midas_transforms.small_transform
    
    # Process each frame
    frames = sorted([f for f in os.listdir(frames_dir) if f.endswith('.png')])
    print(f"Generating depth maps for {len(frames)} frames...")
    
    for frame in tqdm(frames):
        img_path = os.path.join(frames_dir, frame)
        
        # Load image
        img = cv2.imread(img_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Apply input transforms
        input_batch = transform(img).to(device)
        
        # Predict and resize to original resolution
        with torch.no_grad():
            prediction = midas(input_batch)
            
            # Resize to original resolution
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        
        depth = prediction.cpu().numpy()
        
        # Normalize depth values
        depth_min = depth.min()
        depth_max = depth.max()
        depth_normalized = 255 * (depth - depth_min) / (depth_max - depth_min)
        depth_image = depth_normalized.astype(np.uint8)
        
        # Save depth map
        depth_path = os.path.join(depth_dir, frame)
        cv2.imwrite(depth_path, depth_image)
    
    print(f"Depth maps generated in {depth_dir}")


def compile_video(frames_dir, output_video, fps=30):
    """Compile frames into a video using ffmpeg."""
    # Use ffmpeg to compile the video
    command = [
        'ffmpeg', '-r', str(fps), 
        '-i', os.path.join(frames_dir, 'frame-%05d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-y',  # Overwrite if exists
        output_video
    ]
    
    print(f"Compiling video to {output_video}...")
    subprocess.run(command, check=True)
    print(f"Video saved to {output_video}")


def main():
    parser = argparse.ArgumentParser(description='Generate depth maps from video')
    parser.add_argument('--input', required=True, help='Input video file')
    parser.add_argument('--output', required=True, help='Output depth video file')
    parser.add_argument('--fps', type=int, default=30, help='Frames per second (default: 30)')
    parser.add_argument('--keep-frames', action='store_true', help='Keep extracted frames')
    
    args = parser.parse_args()
    
    # Create temporary directories
    frames_dir = 'tmp_frames'
    depth_dir = 'tmp_depth'
    
    try:
        # Step 1: Extract frames
        extract_frames(args.input, frames_dir)
        
        # Step 2: Generate depth maps
        generate_depth_maps(frames_dir, depth_dir)
        
        # Step 3: Compile depth video
        compile_video(depth_dir, args.output, args.fps)
        
        print("Depth map video generation complete!")
        
    finally:
        # Clean up temporary files if needed
        if not args.keep_frames:
            import shutil
            if os.path.exists(frames_dir):
                shutil.rmtree(frames_dir)
            if os.path.exists(depth_dir):
                shutil.rmtree(depth_dir)


if __name__ == "__main__":
    main() 