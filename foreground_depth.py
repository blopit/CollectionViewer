#!/usr/bin/env python3
"""
Foreground-Focused Depth Map Generator

This script generates depth maps from a video file using the MiDaS neural network,
but focuses only on foreground objects by using OpenCV for foreground segmentation.

Requirements:
- PyTorch
- OpenCV
- PIL
- NumPy
- tqdm
- ffmpeg (command line tool)

Usage:
    python foreground_depth.py --input <input_video> --output <output_video> [options]

Options:
    --model {dpt_large,midas_small}  MiDaS model to use (default: midas_small)
    --method {grabcut,bgsubtract,watershed}  Foreground segmentation method (default: grabcut)
    --threshold FLOAT  Threshold for foreground detection (0.0-1.0, default: 0.2)
    --blur INT  Blur kernel size for smoothing (default: 15)
    --no-smooth  Disable depth map smoothing
    --keep-temp  Keep temporary files after processing
"""

import os
import sys
import argparse
import json
import shutil
import tempfile
import subprocess
import time
import torch
import cv2
import numpy as np
from PIL import Image
from tqdm import tqdm

# Status file handling for progress tracking
def update_status(status_file, stage, progress=0, total=100, message="Processing"):
    """Update the status file with current progress information."""
    status = {
        "status": "processing",
        "stage": stage,
        "progress": progress,
        "total": total,
        "message": message
    }
    with open(status_file, "w") as f:
        json.dump(status, f)

def print_progress(message, color='white'):
    """Print a colored progress message to the console."""
    colors = {
        'red': '\033[91m',
        'green': '\033[92m',
        'yellow': '\033[93m',
        'blue': '\033[94m',
        'magenta': '\033[95m',
        'cyan': '\033[96m',
        'white': '\033[97m',
        'end': '\033[0m'
    }
    print(f"{colors.get(color, colors['white'])}{message}{colors['end']}")

def extract_foreground_grabcut(image, threshold=0.2):
    """
    Extract foreground using GrabCut algorithm.
    
    Args:
        image: Input BGR image
        threshold: Threshold for initial mask (lower values include more as foreground)
        
    Returns:
        Foreground mask (255 for foreground, 0 for background)
    """
    # Convert to RGB for processing
    rgb_img = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Create initial mask based on simple thresholding of grayscale image
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, initial_mask = cv2.threshold(gray, int(255 * threshold), 255, cv2.THRESH_BINARY)
    
    # Initialize mask for GrabCut
    mask = np.zeros(image.shape[:2], np.uint8)
    mask[initial_mask == 255] = cv2.GC_PR_FGD  # Probably foreground
    mask[initial_mask == 0] = cv2.GC_PR_BGD    # Probably background
    
    # Set border pixels as definite background
    border_size = 10
    mask[:border_size, :] = cv2.GC_BGD
    mask[-border_size:, :] = cv2.GC_BGD
    mask[:, :border_size] = cv2.GC_BGD
    mask[:, -border_size:] = cv2.GC_BGD
    
    # GrabCut parameters
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    
    # Apply GrabCut
    rect = (border_size, border_size, image.shape[1]-border_size*2, image.shape[0]-border_size*2)
    cv2.grabCut(image, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
    
    # Create final mask
    foreground_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    
    # Apply morphological operations to clean up the mask
    kernel = np.ones((5, 5), np.uint8)
    foreground_mask = cv2.morphologyEx(foreground_mask, cv2.MORPH_OPEN, kernel)
    foreground_mask = cv2.morphologyEx(foreground_mask, cv2.MORPH_CLOSE, kernel)
    
    return foreground_mask

def extract_foreground_bgsubtract(image, prev_frames=None, threshold=0.2):
    """
    Extract foreground using background subtraction.
    
    Args:
        image: Input BGR image
        prev_frames: List of previous frames for background model
        threshold: Sensitivity threshold (lower values detect more movement)
        
    Returns:
        Foreground mask (255 for foreground, 0 for background)
    """
    if prev_frames is None or len(prev_frames) < 5:
        # Not enough frames for background model, use simple thresholding
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, int(255 * threshold), 255, cv2.THRESH_BINARY)
        return mask
    
    # Create background subtractor
    backSub = cv2.createBackgroundSubtractorMOG2(history=len(prev_frames), varThreshold=int(100 * (1-threshold)))
    
    # Train on previous frames
    for frame in prev_frames:
        backSub.apply(frame)
    
    # Apply to current frame
    foreground_mask = backSub.apply(image)
    
    # Clean up mask
    kernel = np.ones((5, 5), np.uint8)
    foreground_mask = cv2.morphologyEx(foreground_mask, cv2.MORPH_OPEN, kernel)
    foreground_mask = cv2.morphologyEx(foreground_mask, cv2.MORPH_CLOSE, kernel)
    
    return foreground_mask

def extract_foreground_watershed(image, threshold=0.2):
    """
    Extract foreground using Watershed algorithm.
    
    Args:
        image: Input BGR image
        threshold: Threshold for markers (lower values include more as foreground)
        
    Returns:
        Foreground mask (255 for foreground, 0 for background)
    """
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Threshold to get binary image
    _, thresh = cv2.threshold(gray, int(255 * threshold), 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Noise removal
    kernel = np.ones((3, 3), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    
    # Sure background area
    sure_bg = cv2.dilate(opening, kernel, iterations=3)
    
    # Finding sure foreground area
    dist_transform = cv2.distanceTransform(opening, cv2.DIST_L2, 5)
    _, sure_fg = cv2.threshold(dist_transform, 0.5 * dist_transform.max(), 255, 0)
    sure_fg = sure_fg.astype(np.uint8)
    
    # Finding unknown region
    unknown = cv2.subtract(sure_bg, sure_fg)
    
    # Marker labelling
    _, markers = cv2.connectedComponents(sure_fg)
    markers = markers + 1
    markers[unknown == 255] = 0
    
    # Apply watershed
    markers = cv2.watershed(image, markers)
    
    # Create mask
    foreground_mask = np.zeros(markers.shape, dtype=np.uint8)
    foreground_mask[markers > 1] = 255
    
    return foreground_mask

def main():
    parser = argparse.ArgumentParser(description="Generate depth maps focusing on foreground objects")
    parser.add_argument("--input", required=True, help="Input video file")
    parser.add_argument("--output", required=True, help="Output depth video file")
    parser.add_argument("--model", choices=["dpt_large", "midas_small"], default="midas_small", 
                        help="MiDaS model to use (default: midas_small)")
    parser.add_argument("--method", choices=["grabcut", "bgsubtract", "watershed"], default="grabcut",
                        help="Foreground segmentation method (default: grabcut)")
    parser.add_argument("--threshold", type=float, default=0.2, 
                        help="Threshold for foreground detection (0.0-1.0, default: 0.2)")
    parser.add_argument("--blur", type=int, default=15, 
                        help="Blur kernel size for smoothing (default: 15)")
    parser.add_argument("--no-smooth", action="store_true", 
                        help="Disable depth map smoothing")
    parser.add_argument("--keep-temp", action="store_true", 
                        help="Keep temporary files after processing")
    parser.add_argument("--status-file", 
                        help="Status file for progress tracking")
    
    args = parser.parse_args()
    
    # Create temporary directory
    temp_dir = tempfile.mkdtemp()
    frames_dir = os.path.join(temp_dir, "frames")
    depth_dir = os.path.join(temp_dir, "depth")
    mask_dir = os.path.join(temp_dir, "masks")
    
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(depth_dir, exist_ok=True)
    os.makedirs(mask_dir, exist_ok=True)
    
    # Status file for tracking progress
    status_file = args.status_file if args.status_file else os.path.join(temp_dir, "status.json")
    update_status(status_file, "initializing", message="Initializing...")
    
    try:
        # Step 1: Load MiDaS model
        print_progress("Loading MiDaS model...", 'blue')
        update_status(status_file, "loading_model", message="Loading depth model...")
        
        if args.model == "dpt_large":
            print_progress("Using DPT-Large model for best quality", 'blue')
            model = torch.hub.load('intel-isl/MiDaS', 'DPT_Large')
        else:
            print_progress("Using MiDaS-Small model for faster processing", 'blue')
            model = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small')
        
        device = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')
        print_progress(f"Using device: {device}", 'yellow')
        
        model.to(device)
        model.eval()
        
        # Load transforms
        midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
        if args.model == "dpt_large":
            transform = midas_transforms.dpt_transform
        else:
            transform = midas_transforms.small_transform
        
        # Step 2: Extract frames
        print_progress("Extracting frames from video...", 'cyan')
        update_status(status_file, "extracting_frames", message="Extracting frames...")
        
        cap = cv2.VideoCapture(args.input)
        if not cap.isOpened():
            print_progress(f"Error: Could not open video {args.input}", 'red')
            update_status(status_file, "error", message=f"Could not open video {args.input}")
            return
        
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print_progress(f"Video info: {width}x{height} @ {fps}fps, {frame_count} frames", 'cyan')
        
        # Store frames for background subtraction if needed
        prev_frames = []
        max_prev_frames = 30  # Maximum number of previous frames to store
        
        # Extract frames
        frame_idx = 0
        with tqdm(total=frame_count, desc="Extracting frames", unit="frame") as pbar:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                
                frame_path = os.path.join(frames_dir, f"frame_{frame_idx:06d}.jpg")
                cv2.imwrite(frame_path, frame)
                
                # Store frame for background subtraction if needed
                if args.method == "bgsubtract":
                    prev_frames.append(frame.copy())
                    if len(prev_frames) > max_prev_frames:
                        prev_frames.pop(0)
                
                if frame_idx % 5 == 0:
                    update_status(status_file, "extracting_frames", 
                                progress=frame_idx, 
                                total=frame_count,
                                message=f"Extracting frame {frame_idx}/{frame_count}")
                
                frame_idx += 1
                pbar.update(1)
        
        cap.release()
        
        # Step 3: Process frames - extract foreground and generate depth maps
        print_progress("Generating foreground-focused depth maps...", 'green')
        update_status(status_file, "generating_depth", message="Generating foreground-focused depth maps...")
        
        frame_files = sorted([os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".jpg")])
        total_frames = len(frame_files)
        
        with tqdm(total=total_frames, desc="Processing frames", unit="frame") as pbar:
            for i, frame_path in enumerate(frame_files):
                # Load image
                img = cv2.imread(frame_path)
                
                # Extract foreground mask
                if i % 5 == 0:
                    pbar.set_postfix({"Operation": "Foreground extraction", "Frame": f"{i+1}/{total_frames}"})
                
                if args.method == "grabcut":
                    foreground_mask = extract_foreground_grabcut(img, args.threshold)
                elif args.method == "bgsubtract":
                    # Get previous frames for this frame
                    frame_prev = prev_frames[:i] if i < len(prev_frames) else prev_frames
                    foreground_mask = extract_foreground_bgsubtract(img, frame_prev, args.threshold)
                else:  # watershed
                    foreground_mask = extract_foreground_watershed(img, args.threshold)
                
                # Save mask for debugging
                mask_path = os.path.join(mask_dir, os.path.basename(frame_path))
                cv2.imwrite(mask_path, foreground_mask)
                
                # Convert to RGB for MiDaS
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                
                # Prepare input for depth estimation
                if i % 5 == 0:
                    pbar.set_postfix({"Operation": "Depth estimation", "Frame": f"{i+1}/{total_frames}"})
                
                input_batch = transform(img_rgb).to(device)
                
                # Run depth inference
                with torch.no_grad():
                    prediction = model(input_batch)
                    prediction = torch.nn.functional.interpolate(
                        prediction.unsqueeze(1),
                        size=(height, width),
                        mode="bicubic",
                        align_corners=False,
                    ).squeeze()
                
                # Convert to numpy and normalize
                output = prediction.cpu().numpy()
                output = (255 * (output - output.min()) / (output.max() - output.min())).astype(np.uint8)
                
                # Apply foreground mask to depth map
                # Only keep depth values for foreground pixels
                masked_depth = cv2.bitwise_and(output, output, mask=foreground_mask)
                
                # Apply smoothing if enabled
                if not args.no_smooth:
                    if i % 5 == 0:
                        pbar.set_postfix({"Operation": "Smoothing", "Frame": f"{i+1}/{total_frames}"})
                    
                    # Apply Gaussian blur to smooth the depth map
                    kernel_size = args.blur if args.blur % 2 == 1 else args.blur + 1
                    masked_depth = cv2.GaussianBlur(masked_depth, (kernel_size, kernel_size), 0)
                
                # Save depth map
                depth_path = os.path.join(depth_dir, os.path.basename(frame_path))
                cv2.imwrite(depth_path, masked_depth)
                
                if i % 5 == 0:
                    update_status(status_file, "generating_depth", 
                                progress=i+1, 
                                total=total_frames,
                                message=f"Processing frame {i+1}/{total_frames}")
                pbar.update(1)
        
        # Step 4: Create video from depth maps
        print_progress("Creating final video...", 'yellow')
        update_status(status_file, "encoding_video", message="Creating final video...")
        
        # Use ffmpeg to create video
        cmd = [
            "ffmpeg", "-y",
            "-framerate", str(fps),
            "-i", os.path.join(depth_dir, "frame_%06d.jpg"),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "18",
            args.output
        ]
        
        subprocess.run(cmd, check=True)
        
        print_progress("✨ Process completed successfully! ✨", 'green')
        print_progress(f"Output saved to: {args.output}", 'green')
        
        # Mark as completed
        status = {
            "status": "completed",
            "stage": "finished",
            "progress": 100,
            "total": 100,
            "message": "Foreground depth map generation complete",
            "depth_video_url": f"/videos/{os.path.basename(args.output)}"
        }
        with open(status_file, "w") as f:
            json.dump(status, f)
    
    finally:
        # Clean up temporary files
        if not args.keep_temp:
            shutil.rmtree(temp_dir)
        else:
            print_progress(f"Temporary files kept at: {temp_dir}", 'yellow')

if __name__ == "__main__":
    main()
