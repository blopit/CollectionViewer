#!/usr/bin/env python3
"""
Depth Map Generator for 3D Collection Viewer

This script generates depth maps from a video file using the MiDaS neural network.
The depth maps are then combined into a video file that can be used by the 3D Collection Viewer.

Requirements:
- PyTorch
- OpenCV
- PIL
- ffmpeg (command line tool)

Usage:
    python gen_depth.py

The script expects a video file at 'videos/video.mp4' and will output
the depth map video to 'videos/depth_video.mp4'.
"""

import os
import cv2
import numpy as np
import torch
import tempfile
import shutil
from PIL import Image
from torchvision.transforms import Compose, Resize, ToTensor, Normalize
import json
import argparse
import subprocess
import sys
import time
import hashlib

def try_install_package(package_name):
    """Try to install a package if it's not already installed"""
    try:
        __import__(package_name)
    except ImportError:
        print(f"Package {package_name} not found. Attempting to install...")
        import subprocess
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
            print(f"Successfully installed {package_name}")
            return True
        except subprocess.CalledProcessError:
            print(f"Failed to install {package_name}. Please install it manually.")
            return False
    return True

def parse_args():
    parser = argparse.ArgumentParser(description='Generate depth maps from video')
    parser.add_argument('--input', required=True, help='Input video file')
    parser.add_argument('--output', required=True, help='Output depth video file')
    parser.add_argument('--model', choices=['small', 'large', 'dav2-small', 'dav2-base', 'dav2-large'], default='small',
                      help='Depth model type (small=faster, large=better quality, dav2=Depth Anything V2)')
    parser.add_argument('--foreground-method', choices=['bgsubtract', 'grabcut'], default='bgsubtract',
                      help='Method for foreground extraction')
    parser.add_argument('--threshold', type=str, default='0.2',
                      help='Threshold for foreground detection')
    parser.add_argument('--status-file', help='File to write status updates to')
    return parser.parse_args()

def ensure_directory_exists(path):
    """Ensure the directory exists, create if it doesn't"""
    if not os.path.exists(path):
        os.makedirs(path)

def calculate_video_hash(file_path):
    """Calculate a hash of the video file for caching purposes"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def check_cache(video_hash):
    """Check if a processed version of this video already exists"""
    videos_dir = os.path.join('videos', 'depth')
    if not os.path.exists(videos_dir):
        return None, None
        
    # Check for cache file
    cache_file = os.path.join(videos_dir, 'cache.json')
    if not os.path.exists(cache_file):
        return None, None
        
    try:
        with open(cache_file, 'r') as f:
            cache = json.load(f)
            if video_hash in cache:
                video_path = os.path.join(videos_dir, cache[video_hash]['video'])
                depth_path = os.path.join(videos_dir, cache[video_hash]['depth'])
                if os.path.exists(video_path) and os.path.exists(depth_path):
                    return video_path, depth_path
    except Exception as e:
        print(f"Error reading cache: {str(e)}")
    return None, None

def update_cache(video_hash, video_filename, depth_filename):
    """Update the cache with new video information"""
    videos_dir = os.path.join('videos', 'depth')
    cache_file = os.path.join(videos_dir, 'cache.json')
    
    # Load existing cache
    cache = {}
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r') as f:
                cache = json.load(f)
        except:
            pass
    
    # Update cache
    cache[video_hash] = {
        'video': video_filename,
        'depth': depth_filename,
        'timestamp': time.time()
    }
    
    # Write cache file
    try:
        with open(cache_file, 'w') as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"Error updating cache: {str(e)}")

def save_uploaded_video(input_path):
    """Save the uploaded video to videos/depth directory"""
    videos_dir = os.path.join('videos', 'depth')
    ensure_directory_exists(videos_dir)
    
    # Calculate video hash
    video_hash = calculate_video_hash(input_path)
    
    # Check cache first
    cached_video, cached_depth = check_cache(video_hash)
    if cached_video and cached_depth:
        print(f"Found cached version of video")
        return cached_video, os.path.basename(cached_video), video_hash
    
    # If not cached, save as new
    timestamp = int(time.time())
    video_filename = f'video_{timestamp}.mp4'
    video_path = os.path.join(videos_dir, video_filename)
    
    # Copy the input video
    shutil.copy2(input_path, video_path)
    return video_path, video_filename, video_hash

def update_status(status_file, stage, progress=None, total=None, message=None, extra_info=None):
    """Update the status file with current progress"""
    if not status_file:
        return
        
    status = {
        "status": "processing",
        "stage": stage,
        "progress": progress,
        "total": total,
        "message": message
    }
    
    # Add any extra information to status
    if extra_info:
        status.update(extra_info)
    
    try:
        # Write status atomically by writing to temp file first
        temp_file = f"{status_file}.tmp"
        with open(temp_file, "w") as f:
            json.dump(status, f)
            f.flush()
            os.fsync(f.fileno())  # Ensure it's written to disk
        os.replace(temp_file, status_file)  # Atomic replace
        
        # Also log to stdout for the log file
        if message:
            log_msg = f"[{stage}] {message}"
            if extra_info:
                log_msg += f" | {' | '.join(f'{k}: {v}' for k, v in extra_info.items())}"
            print(log_msg)
            sys.stdout.flush()  # Ensure log is written immediately
    except Exception as e:
        print(f"Error updating status: {str(e)}")
        sys.stdout.flush()

def main():
    args = parse_args()
    
    # Save uploaded video and get paths
    video_path, video_filename, video_hash = save_uploaded_video(args.input)
    
    # Check if we have a cached version
    cached_video, cached_depth = check_cache(video_hash)
    if cached_video and cached_depth:
        # Return cached paths
        status = {
            "status": "completed",
            "stage": "finished",
            "progress": 100,
            "total": 100,
            "message": "Using cached version",
            "depth_video_url": f"/videos/depth/{os.path.basename(cached_depth)}",
            "original_video_url": f"/videos/depth/{os.path.basename(cached_video)}",
            "stats": {
                "cached": True,
                "resolution": "cached version"
            }
        }
        if args.status_file:
            with open(args.status_file, "w") as f:
                json.dump(status, f)
        print("✨ Using cached version!")
        return

    # Update output path to be in the same directory
    output_filename = f'depth_{video_filename}'
    args.output = os.path.join('videos', 'depth', output_filename)
    
    # Create temporary directory
    temp_dir = tempfile.mkdtemp()
    frames_dir = os.path.join(temp_dir, "frames")
    depth_dir = os.path.join(temp_dir, "depth")

    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(depth_dir, exist_ok=True)

    try:
        # Step 1: Load model
        update_status(args.status_file, "loading_model", 
                     progress=0, total=100,
                     message=f"Loading depth model ({args.model})...",
                     extra_info={"device": "GPU" if torch.cuda.is_available() else "CPU"})
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Check if using Depth Anything V2 models
        if args.model.startswith('dav2-'):
            try:
                # Try to import transformers or install it if not available
                if not try_install_package('transformers'):
                    raise ImportError("Transformers package is required for Depth Anything V2 models.")
                
                from transformers import pipeline
                
                model_map = {
                    'dav2-small': "depth-anything/Depth-Anything-V2-Small-hf",
                    'dav2-base': "depth-anything/Depth-Anything-V2-Base-hf",
                    'dav2-large': "depth-anything/Depth-Anything-V2-Large-hf"
                }
                
                model_name = model_map[args.model]
                depth_pipe = pipeline(task="depth-estimation", model=model_name, device=device)
                
                # Define a custom transform for input preprocessing
                transform = None  # We don't need any custom transform for the pipeline
                
            except Exception as e:
                print(f"Error loading Depth Anything V2 model: {str(e)}")
                print("Please install transformers using: pip install transformers")
                sys.exit(1)
                
        else:
            # Original MiDaS models
            model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small" if args.model == "small" else "MiDaS_large")
            model.to(device)
            model.eval()

            # Define transformation for MiDaS
            transform = Compose([
                Resize((256, 256)),
                ToTensor(),
                Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ])
        
        # Step 2: Extract frames
        update_status(args.status_file, "extracting_frames", 
                     progress=0, total=100,
                     message="Reading video information...")
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # Update with video info
        update_status(args.status_file, "extracting_frames",
                     progress=0, total=100,
                     message="Starting frame extraction",
                     extra_info={
                         "video_info": f"{width}x{height} @ {fps}fps",
                         "total_frames": frame_count,
                         "frames_processed": 0
                     })

        frame_idx = 0
        start_time = time.time()
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_path = os.path.join(frames_dir, f"frame_{frame_idx:06d}.jpg")
            cv2.imwrite(frame_path, frame)

            if frame_idx % 5 == 0:  # Update more frequently
                progress = int((frame_idx / frame_count) * 30)  # 0-30% progress
                update_status(args.status_file, "extracting_frames", 
                            progress=progress, total=100,
                            message=f"Extracting frames",
                            extra_info={
                                "frames_processed": frame_idx,
                                "total_frames": frame_count,
                                "video_info": f"{width}x{height} @ {fps}fps",
                                "current_fps": round(frame_idx / (time.time() - start_time), 1)
                            })

            frame_idx += 1

        cap.release()

        # Step 3: Process frames
        frame_files = sorted([os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        total_frames = len(frame_files)
        processing_start_time = time.time()

        for i, frame_path in enumerate(frame_files):
            if i % 2 == 0:  # Update every other frame
                progress = 30 + int((i / total_frames) * 60)  # 30-90% progress
                current_fps = round(i / (time.time() - processing_start_time), 1) if i > 0 else 0
                eta_seconds = round((total_frames - i) / current_fps) if current_fps > 0 else 0
                
                stage_info = ""
                if i < total_frames * 0.3:
                    stage_info = "Analyzing frame depth"
                elif i < total_frames * 0.6:
                    stage_info = "Generating depth map"
                else:
                    stage_info = "Refining depth data"
                
                update_status(args.status_file, "processing", 
                            progress=progress, total=100,
                            message=stage_info,
                            extra_info={
                                "frames_processed": i,
                                "total_frames": total_frames,
                                "processing_fps": current_fps,
                                "eta_seconds": eta_seconds,
                                "eta_human": f"{eta_seconds // 60}m {eta_seconds % 60}s"
                            })
            
            # Process frame - different approaches based on model type
            if args.model.startswith('dav2-'):
                # Use Depth Anything V2 pipeline
                img = Image.open(frame_path).convert("RGB")
                depth_result = depth_pipe(img)
                # Convert tensor to numpy array first, then normalize
                output = depth_result["predicted_depth"].cpu().numpy()
                output = (255 * (output - output.min()) / (output.max() - output.min())).astype(np.uint8)
            else:
                # Use original MiDaS approach
                img = Image.open(frame_path).convert("RGB")
                input_batch = transform(img).unsqueeze(0).to(device)

                with torch.no_grad():
                    prediction = model(input_batch)
                    prediction = torch.nn.functional.interpolate(
                        prediction.unsqueeze(1),
                        size=(height, width),
                        mode="bicubic",
                        align_corners=False,
                    ).squeeze()

                output = prediction.cpu().numpy()
                output = (255 * (output - output.min()) / (output.max() - output.min())).astype(np.uint8)

            depth_path = os.path.join(depth_dir, os.path.basename(frame_path))
            depth_image = Image.fromarray(output)
            depth_image.save(depth_path)

        # Step 4: Create final video
        update_status(args.status_file, "creating_video", 
                     progress=90, total=100,
                     message="Creating final video...",
                     extra_info={
                         "frames_processed": total_frames,
                         "total_frames": total_frames,
                         "output_fps": fps
                     })
        
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(depth_dir, "frame_%06d.jpg"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",  # High quality
            args.output
        ]
        subprocess.run(cmd, check=True)
        
        # Update final status and cache
        status = {
            "status": "completed",
            "stage": "finished",
            "progress": 100,
            "total": 100,
            "message": "Depth map generation complete",
            "depth_video_url": f"/videos/depth/{output_filename}",
            "original_video_url": f"/videos/depth/{video_filename}",
            "stats": {
                "total_frames": total_frames,
                "resolution": f"{width}x{height}",
                "fps": fps,
                "processing_time": round(time.time() - processing_start_time, 1),
                "cached": False
            }
        }
        if args.status_file:
            with open(args.status_file, "w") as f:
                json.dump(status, f)
        
        # Update cache with new video
        update_cache(video_hash, video_filename, output_filename)
        
        print("✨ Process completed successfully!")
        
    except Exception as e:
        print(f"Error: {str(e)}")
        if args.status_file:
            with open(args.status_file, "w") as f:
                json.dump({
                    "status": "error",
                    "message": str(e)
                }, f)
        raise e
        
    finally:
        # Clean up
        shutil.rmtree(temp_dir)

if __name__ == "__main__":
    main()