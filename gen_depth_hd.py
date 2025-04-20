#!/usr/bin/env python3
"""
High Resolution Depth Map Generator for 3D Collection Viewer

This script generates high resolution depth maps from a video file using the MiDaS neural network.
The depth maps are generated at maximum possible resolution and quality.

Requirements:
- PyTorch
- OpenCV
- PIL
- ffmpeg (command line tool)
- tqdm (for progress bars)

Usage:
    python gen_depth_hd.py --input <input_video> --output <output_video> [--model <model_type>] [--scale <scale_factor>]
"""

import os
import cv2
import numpy as np
import torch
import tempfile
import shutil
import argparse
import json
import time
from PIL import Image
from tqdm import tqdm
from torchvision.transforms import Compose, Resize, ToTensor, Normalize

def print_progress(message, color='white'):
    """Print colored progress messages"""
    colors = {
        'red': '\033[91m',
        'green': '\033[92m',
        'yellow': '\033[93m',
        'blue': '\033[94m',
        'purple': '\033[95m',
        'cyan': '\033[96m',
        'white': '\033[97m',
        'end': '\033[0m'
    }
    print(f"{colors[color]}[{time.strftime('%H:%M:%S')}] {message}{colors['end']}")

def update_status(status_file, stage, progress=None, total=None, message=None):
    """Update the status file with current progress"""
    if not os.path.exists(status_file):
        return
        
    status = {
        "status": "processing",
        "stage": stage,
        "progress": progress,
        "total": total,
        "message": message
    }
    
    with open(status_file, "w") as f:
        json.dump(status, f)
    
    # Print progress message
    if message:
        color = {
            'loading_model': 'blue',
            'extracting_frames': 'cyan',
            'generating_depth': 'purple',
            'encoding_video': 'yellow',
            'error': 'red',
            'finished': 'green'
        }.get(stage, 'white')
        
        progress_str = f"[{progress}/{total}] " if progress is not None and total is not None else ""
        print_progress(f"{stage.upper()}: {progress_str}{message}", color)

def parse_args():
    parser = argparse.ArgumentParser(description='Generate high resolution depth maps from video')
    parser.add_argument('--input', required=True, help='Input video file')
    parser.add_argument('--output', required=True, help='Output depth video file')
    parser.add_argument('--model', choices=['small', 'large'], default='large',
                      help='MiDaS model type (small=faster, large=better quality)')
    parser.add_argument('--scale', type=float, default=1.0,
                      help='Scale factor for output resolution (1.0 = original resolution)')
    parser.add_argument('--quality', type=int, default=23,
                      help='Output video quality (0-51, lower is better, 23 is default)')
    parser.add_argument('--no-smooth', action='store_true', help='Disable smoothing filters')
    return parser.parse_args()

def main():
    args = parse_args()
    temp_dir = tempfile.mkdtemp()
    frames_dir = os.path.join(temp_dir, "frames")
    depth_dir = os.path.join(temp_dir, "depth")
    status_file = os.path.splitext(args.input)[0] + ".status"

    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(depth_dir, exist_ok=True)

    try:
        # Print initial info
        print_progress(f"Starting depth map generation for: {os.path.basename(args.input)}", 'green')
        print_progress(f"Model: {args.model}, Scale: {args.scale}x, Quality: {args.quality}", 'blue')
        print_progress(f"Smoothing: {'disabled' if args.no_smooth else 'enabled'}", 'blue')

        # Step 1: Load model with detailed progress
        print_progress("Step 1: Model Loading", 'blue')
        print_progress("Initializing device...", 'cyan')
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print_progress(f"Using device: {device}", 'yellow')

        try:
            print_progress("Loading MiDaS repository...", 'cyan')
            if args.model == 'large':
                print_progress("Loading DPT-Large model weights...", 'cyan')
                model = torch.hub.load("intel-isl/MiDaS", "DPT_Large")
                print_progress("Loading DPT transforms...", 'cyan')
                transform = torch.hub.load("intel-isl/MiDaS", "transforms").dpt_transform
            else:
                print_progress("Loading MiDaS-Small model weights...", 'cyan')
                model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
                print_progress("Loading Small transforms...", 'cyan')
                transform = torch.hub.load("intel-isl/MiDaS", "transforms").small_transform

            print_progress("Moving model to device...", 'cyan')
            model.to(device)
            print_progress("Setting model to eval mode...", 'cyan')
            model.eval()
            print_progress("Model loaded successfully ✓", 'green')
        except Exception as e:
            update_status(status_file, "error", message=f"Error loading model: {str(e)}")
            print_progress(f"Error loading model: {str(e)}", 'red')
            exit(1)

        # Step 2: Extract frames at high quality
        print_progress("\nStep 2: Frame Extraction", 'blue')
        print_progress("Opening video file...", 'cyan')
        cap = cv2.VideoCapture(args.input)
        if not cap.isOpened():
            update_status(status_file, "error", message=f"Could not open video {args.input}")
            print_progress(f"Could not open video {args.input}", 'red')
            exit(1)

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        print_progress(f"Video info: {orig_width}x{orig_height} @ {fps}fps, {frame_count} frames", 'cyan')

        # Calculate target resolution
        width = int(orig_width * args.scale)
        height = int(orig_height * args.scale)
        
        # Ensure dimensions are even
        width = width if width % 2 == 0 else width + 1
        height = height if height % 2 == 0 else height + 1

        if args.scale != 1.0:
            print_progress(f"Target resolution: {width}x{height}", 'cyan')

        # Extract frames with progress bar
        with tqdm(total=frame_count, desc="Extracting frames", unit="frame") as pbar:
            frame_idx = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if args.scale != 1.0:
                    frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_LANCZOS4)

                frame_path = os.path.join(frames_dir, f"frame_{frame_idx:06d}.png")
                cv2.imwrite(frame_path, frame, [cv2.IMWRITE_PNG_COMPRESSION, 0])

                if frame_idx % 5 == 0:
                    update_status(status_file, "extracting_frames", 
                                progress=frame_idx, 
                                total=frame_count,
                                message=f"Frame {frame_idx}/{frame_count}")
                    pbar.set_postfix({"Current": f"{frame_idx}/{frame_count}"})

                frame_idx += 1
                pbar.update(1)

        cap.release()
        print_progress("Frame extraction complete ✓", 'green')

        # Step 3: Process frames with high quality settings
        print_progress("\nStep 3: Depth Map Generation", 'blue')
        print_progress("Scanning for extracted frames...", 'cyan')
        frame_files = sorted([os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".png")])
        total_frames = len(frame_files)
        print_progress(f"Found {total_frames} frames to process", 'cyan')

        # Process frames with progress bar
        with tqdm(total=total_frames, desc="Generating depth maps", unit="frame") as pbar:
            for i, frame_path in enumerate(frame_files):
                # Load image
                img = cv2.imread(frame_path)
                img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

                # Update progress with current operation
                if i % 5 == 0:
                    pbar.set_postfix({"Operation": "Model inference", "Frame": f"{i+1}/{total_frames}"})

                # Prepare input
                input_batch = transform(img).to(device)

                # Run inference
                with torch.no_grad():
                    prediction = model(input_batch)
                    
                    if i % 5 == 0:
                        pbar.set_postfix({"Operation": "Interpolation", "Frame": f"{i+1}/{total_frames}"})
                    
                    prediction = torch.nn.functional.interpolate(
                        prediction.unsqueeze(1),
                        size=(height, width),
                        mode="bicubic",
                        align_corners=False,
                    ).squeeze()

                if i % 5 == 0:
                    pbar.set_postfix({"Operation": "Normalization", "Frame": f"{i+1}/{total_frames}"})

                # Convert to numpy and normalize
                output = prediction.cpu().numpy()
                output = (255 * (output - output.min()) / (output.max() - output.min())).astype(np.uint8)

                if i % 5 == 0:
                    pbar.set_postfix({"Operation": "Saving depth map", "Frame": f"{i+1}/{total_frames}"})

                # Save depth map
                depth_path = os.path.join(depth_dir, os.path.basename(frame_path))
                cv2.imwrite(depth_path, output, [cv2.IMWRITE_PNG_COMPRESSION, 0])

                if i % 5 == 0:
                    update_status(status_file, "generating_depth", 
                                progress=i+1, 
                                total=total_frames,
                                message=f"Processing frame {i+1}/{total_frames}")
                pbar.update(1)

        print_progress("Depth map generation complete ✓", 'green')

        # Step 4: Create high quality video
        print_progress("\nStep 4: Video Encoding", 'blue')
        update_status(status_file, "encoding_video", message="Creating final high quality video...")
        print_progress("Encoding depth map frames to video...", 'yellow')
        
        # Use high quality FFmpeg settings
        cmd = (
            f"ffmpeg -y -framerate {fps} -i {depth_dir}/frame_%06d.png "
            f"-c:v libx264 -preset slow -crf {args.quality} "
            f"-profile:v high -pix_fmt yuv420p "
            f"-movflags +faststart {args.output}"
        )
        print_progress("Running FFmpeg encoding...", 'yellow')
        os.system(cmd)

        # Mark as completed
        status = {
            "status": "completed",
            "stage": "finished",
            "progress": 100,
            "total": 100,
            "message": "High resolution depth map generation complete",
            "depth_video_url": f"/videos/{os.path.basename(args.output)}"
        }
        with open(status_file, "w") as f:
            json.dump(status, f)

        print_progress("\n✨ Depth map generation completed successfully! ✨", 'green')
        print_progress(f"Output saved to: {args.output}", 'green')

    except Exception as e:
        print_progress(f"Error: {str(e)}", 'red')
        raise e

    finally:
        # Clean up
        shutil.rmtree(temp_dir)
        print_progress("Temporary files cleaned up", 'blue')

if __name__ == "__main__":
    main() 