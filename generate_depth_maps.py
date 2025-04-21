#!/usr/bin/env python3
"""
Generate Depth Maps

This script generates depth maps for extracted frames using OpenCV's DNN module.
It uses a pre-trained MiDaS model for monocular depth estimation.
"""

import os
import sys
import argparse
import numpy as np
import cv2
from pathlib import Path

def download_model():
    """Download the MiDaS model if it doesn't exist."""
    model_path = "models/model-small.onnx"
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    
    if not os.path.exists(model_path):
        print(f"Downloading MiDaS model to {model_path}...")
        url = "https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx"
        os.system(f"curl -L {url} -o {model_path}")
    
    return model_path

def generate_depth_map(image_path, output_path, model_path):
    """
    Generate a depth map for an image using MiDaS.
    
    Args:
        image_path: Path to input image
        output_path: Path to save output depth map
        model_path: Path to MiDaS model
    """
    # Load model
    model = cv2.dnn.readNet(model_path)
    
    # Load image
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not read image {image_path}")
        return
    
    # Prepare input for the model
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w, _ = img.shape
    
    # MiDaS v2.1 small model takes 256x256 input
    img_input = cv2.resize(img, (256, 256))
    
    # Normalize image
    img_input = img_input.astype(np.float32) / 255.0
    
    # Create blob from image
    blob = cv2.dnn.blobFromImage(
        img_input, 
        1.0, 
        (256, 256), 
        (0.485, 0.456, 0.406), 
        True, 
        False
    )
    
    # Set input to the model
    model.setInput(blob)
    
    # Forward pass
    depth = model.forward()
    
    # Reshape output
    depth = depth.squeeze()
    
    # Normalize depth map
    depth_min = depth.min()
    depth_max = depth.max()
    depth = 255 * (depth - depth_min) / (depth_max - depth_min)
    
    # Resize to original dimensions
    depth = cv2.resize(depth, (w, h))
    
    # Save depth map
    cv2.imwrite(output_path, depth.astype(np.uint8))
    
    # Also save as numpy array for later use
    np_output_path = os.path.splitext(output_path)[0] + ".npy"
    np.save(np_output_path, depth)
    
    print(f"Depth map saved to {output_path}")
    print(f"Depth data saved to {np_output_path}")

def process_frames(frames_dir, output_dir):
    """
    Process all frames in a directory.
    
    Args:
        frames_dir: Directory containing frames
        output_dir: Directory to save depth maps
    """
    # Download model
    model_path = download_model()
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Get all jpg files in frames_dir
    frame_paths = sorted([
        os.path.join(frames_dir, f) for f in os.listdir(frames_dir) 
        if f.endswith('.jpg') or f.endswith('.png')
    ])
    
    print(f"Found {len(frame_paths)} frames in {frames_dir}")
    
    # Process each frame
    for i, frame_path in enumerate(frame_paths):
        print(f"Processing frame {i+1}/{len(frame_paths)}: {frame_path}")
        
        # Get output path
        basename = os.path.splitext(os.path.basename(frame_path))[0]
        output_path = os.path.join(output_dir, f"{basename}.png")
        
        # Generate depth map
        generate_depth_map(frame_path, output_path, model_path)

def main():
    parser = argparse.ArgumentParser(description="Generate depth maps for frames")
    parser.add_argument("--frames-dir", required=True, help="Directory containing frames")
    parser.add_argument("--output-dir", required=True, help="Directory to save depth maps")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.frames_dir):
        print(f"Error: Frames directory does not exist: {args.frames_dir}")
        return
    
    process_frames(args.frames_dir, args.output_dir)

if __name__ == "__main__":
    main()
