#!/usr/bin/env python3
"""
Inpainting Pipeline

This script provides a complete pipeline for converting videos into 3D assets
including depth maps, meshes, and rendered novel views.
"""

import os
import sys
import argparse
import subprocess
import uuid
from pathlib import Path

def extract_frames(video_path, output_dir, fps=5):
    """
    Extract frames from a video.
    
    Args:
        video_path: Path to input video
        output_dir: Directory to save extracted frames
        fps: Frames per second to extract
        
    Returns:
        Directory containing extracted frames
    """
    print(f"Extracting frames from {video_path}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Extract frames using ffmpeg
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "1",
        f"{output_dir}/frame_%06d.jpg"
    ]
    
    subprocess.run(cmd, check=True)
    
    # Count extracted frames
    frames = [f for f in os.listdir(output_dir) if f.endswith('.jpg')]
    print(f"Extracted {len(frames)} frames to {output_dir}")
    
    return output_dir

def generate_depth_maps(frames_dir, output_dir):
    """
    Generate depth maps for extracted frames.
    
    Args:
        frames_dir: Directory containing frames
        output_dir: Directory to save depth maps
        
    Returns:
        Directory containing depth maps
    """
    print(f"Generating depth maps for frames in {frames_dir}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Run the depth map generation script
    cmd = [
        "python", "generate_depth_maps.py",
        "--frames-dir", frames_dir,
        "--output-dir", output_dir
    ]
    
    subprocess.run(cmd, check=True)
    
    return output_dir

def generate_meshes(depth_dir, frames_dir, output_dir):
    """
    Generate meshes from depth maps.
    
    Args:
        depth_dir: Directory containing depth maps
        frames_dir: Directory containing original frames
        output_dir: Directory to save meshes
        
    Returns:
        Directory containing meshes
    """
    print(f"Generating meshes from depth maps in {depth_dir}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Run the mesh generation script
    cmd = [
        "python", "generate_meshes.py",
        "--depth-dir", depth_dir,
        "--frames-dir", frames_dir,
        "--output-dir", output_dir
    ]
    
    subprocess.run(cmd, check=True)
    
    return output_dir

def render_video(mesh_dir, output_dir, output_video):
    """
    Render a video from meshes.
    
    Args:
        mesh_dir: Directory containing meshes
        output_dir: Directory to save rendered frames
        output_video: Path to save output video
        
    Returns:
        Path to output video
    """
    print(f"Rendering video from meshes in {mesh_dir}...")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Run the video rendering script
    cmd = [
        "python", "render_video.py",
        "--mesh-dir", mesh_dir,
        "--output-dir", output_dir,
        "--output-video", output_video
    ]
    
    subprocess.run(cmd, check=True)
    
    return output_video

def process_video(video_path, output_dir=None, fps=5):
    """
    Process a video to generate 3D content.
    
    Args:
        video_path: Path to input video
        output_dir: Directory to save output files
        fps: Frames per second to extract
        
    Returns:
        Dictionary of output directories and files
    """
    # Generate a unique ID for this run if output_dir is not provided
    if output_dir is None:
        unique_id = str(uuid.uuid4())
        output_dir = os.path.join("output_inpainting", unique_id)
    
    # Create output directories
    frames_dir = os.path.join(output_dir, "frames")
    depth_dir = os.path.join(output_dir, "depth")
    mesh_dir = os.path.join(output_dir, "mesh")
    video_dir = os.path.join(output_dir, "video")
    
    for d in [frames_dir, depth_dir, mesh_dir, video_dir]:
        os.makedirs(d, exist_ok=True)
    
    # Extract frames
    frames_dir = extract_frames(video_path, frames_dir, fps)
    
    # Generate depth maps
    depth_dir = generate_depth_maps(frames_dir, depth_dir)
    
    # Generate meshes
    mesh_dir = generate_meshes(depth_dir, frames_dir, mesh_dir)
    
    # Render video
    output_video = os.path.join(video_dir, "video_3d.mp4")
    output_video = render_video(mesh_dir, video_dir, output_video)
    
    return {
        "input_video": video_path,
        "frames_dir": frames_dir,
        "depth_dir": depth_dir,
        "mesh_dir": mesh_dir,
        "video_dir": video_dir,
        "output_video": output_video
    }

def main():
    parser = argparse.ArgumentParser(description="Inpainting Pipeline")
    parser.add_argument("--input", required=True, help="Input video file")
    parser.add_argument("--output-dir", help="Output directory")
    parser.add_argument("--fps", type=int, default=5, help="Frames per second to extract from video")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file does not exist: {args.input}")
        return
    
    results = process_video(args.input, args.output_dir, args.fps)
    
    print("\nProcessing complete!")
    print("Output files:")
    for key, path in results.items():
        print(f"  - {key}: {path}")

if __name__ == "__main__":
    main()
