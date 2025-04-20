#!/usr/bin/env python3
"""
Test script to demonstrate all foreground segmentation methods.

This script processes a sample video with all available foreground segmentation methods
and creates a comparison video showing the results side by side.

Usage:
    python test_all_methods.py --input <input_video>
"""

import os
import sys
import argparse
import subprocess
import time
import cv2
import numpy as np
from tqdm import tqdm

def parse_args():
    parser = argparse.ArgumentParser(description='Test all foreground segmentation methods')
    parser.add_argument('--input', required=True, help='Input video file')
    parser.add_argument('--output', default='comparison.mp4', help='Output comparison video')
    parser.add_argument('--keep-temp', action='store_true', help='Keep temporary files')
    return parser.parse_args()

def main():
    args = parse_args()
    
    # Create output directory
    os.makedirs('output', exist_ok=True)
    
    # Base filename without extension
    base_name = os.path.splitext(os.path.basename(args.input))[0]
    
    # Methods to test
    methods = ['bgsubtract', 'grabcut', 'watershed', 'none']
    output_files = {}
    
    # Process with each method
    for method in methods:
        print(f"\n=== Processing with {method.upper()} method ===")
        
        output_file = f"output/{base_name}_{method}_depth.mp4"
        output_files[method] = output_file
        
        # Run foreground depth generation
        cmd = [
            sys.executable, "gen_depth.py",
            "--input", args.input,
            "--output", output_file,
            "--foreground-method", method,
            "--threshold", "0.2",
            "--blur", "15",
            "--keep-temp"  # Keep temp files for inspection
        ]
        
        print(f"Running: {' '.join(cmd)}")
        start_time = time.time()
        
        try:
            subprocess.run(cmd, check=True)
            elapsed = time.time() - start_time
            print(f"✅ {method} completed in {elapsed:.2f} seconds")
        except subprocess.CalledProcessError as e:
            print(f"❌ {method} failed: {e}")
            continue
    
    # Create comparison video
    print("\n=== Creating comparison video ===")
    
    # Open all videos
    caps = {}
    for method in methods:
        if method in output_files:
            cap = cv2.VideoCapture(output_files[method])
            if cap.isOpened():
                caps[method] = cap
            else:
                print(f"Could not open {output_files[method]}")
    
    if not caps:
        print("No videos to compare")
        return
    
    # Get video properties from first video
    first_method = list(caps.keys())[0]
    width = int(caps[first_method].get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(caps[first_method].get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = caps[first_method].get(cv2.CAP_PROP_FPS)
    frame_count = int(caps[first_method].get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Calculate grid layout
    grid_cols = 2
    grid_rows = (len(caps) + 1) // 2  # Ceiling division
    
    # Create video writer
    output_width = width * grid_cols
    output_height = height * grid_rows
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(args.output, fourcc, fps, (output_width, output_height))
    
    # Process frames
    with tqdm(total=frame_count, desc="Creating comparison video") as pbar:
        frame_idx = 0
        while frame_idx < frame_count:
            # Read frames from all videos
            frames = {}
            for method, cap in caps.items():
                ret, frame = cap.read()
                if ret:
                    # Add method name as text overlay
                    cv2.putText(frame, method.upper(), (10, 30), 
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                    frames[method] = frame
            
            if not frames:
                break
            
            # Create grid layout
            grid = np.zeros((output_height, output_width, 3), dtype=np.uint8)
            
            # Place frames in grid
            for i, method in enumerate(frames.keys()):
                row = i // grid_cols
                col = i % grid_cols
                
                y_start = row * height
                y_end = y_start + height
                x_start = col * width
                x_end = x_start + width
                
                grid[y_start:y_end, x_start:x_end] = frames[method]
            
            # Write frame
            out.write(grid)
            frame_idx += 1
            pbar.update(1)
    
    # Release resources
    for cap in caps.values():
        cap.release()
    out.release()
    
    print(f"Comparison video saved to {args.output}")
    
    # Clean up temporary files if not keeping them
    if not args.keep_temp:
        for method in methods:
            if method in output_files and os.path.exists(output_files[method]):
                os.remove(output_files[method])
                print(f"Removed temporary file: {output_files[method]}")

if __name__ == "__main__":
    main()
