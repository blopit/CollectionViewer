#!/usr/bin/env python3
"""
Render Video from 3D Meshes

This script renders a video from 3D meshes using Open3D.
"""

import os
import sys
import argparse
import numpy as np
import open3d as o3d
import cv2
from pathlib import Path
import tempfile

def render_mesh(mesh_path, output_path, width=800, height=600, n_frames=30, rotation_degrees=30):
    """
    Render a mesh from different viewpoints and save as images.
    
    Args:
        mesh_path: Path to mesh file
        output_path: Directory to save rendered images
        width: Width of rendered images
        height: Height of rendered images
        n_frames: Number of frames to render
        rotation_degrees: Total rotation in degrees
    
    Returns:
        List of paths to rendered images
    """
    # Load mesh
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    
    # Create a visualizer
    vis = o3d.visualization.Visualizer()
    vis.create_window(width=width, height=height, visible=False)
    
    # Add the mesh to the visualizer
    vis.add_geometry(mesh)
    
    # Get view control
    view_control = vis.get_view_control()
    
    # Set initial camera parameters
    view_control.set_zoom(0.8)
    
    # Render frames
    rendered_paths = []
    for i in range(n_frames):
        # Rotate the camera around the mesh
        angle = i * rotation_degrees / (n_frames - 1)
        
        # Convert angle to radians
        angle_rad = np.radians(angle)
        
        # Set camera position
        radius = 1.0
        x = radius * np.sin(angle_rad)
        z = radius * np.cos(angle_rad)
        
        # Update camera position
        view_control.set_lookat([0, 0, 0])
        view_control.set_front([x, 0, z])
        view_control.set_up([0, 1, 0])
        
        # Update rendering
        vis.poll_events()
        vis.update_renderer()
        
        # Capture image
        image = vis.capture_screen_float_buffer(do_render=True)
        
        # Convert to numpy array
        image_np = np.asarray(image)
        
        # Convert to uint8
        image_np = (image_np * 255).astype(np.uint8)
        
        # Save image
        frame_path = os.path.join(output_path, f"frame_{i:04d}.png")
        cv2.imwrite(frame_path, cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR))
        
        rendered_paths.append(frame_path)
    
    # Close visualizer
    vis.destroy_window()
    
    return rendered_paths

def create_video(image_paths, output_path, fps=30):
    """
    Create a video from a list of images.
    
    Args:
        image_paths: List of paths to images
        output_path: Path to save output video
        fps: Frames per second
    """
    # Get image dimensions
    img = cv2.imread(image_paths[0])
    height, width, _ = img.shape
    
    # Create video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
    
    # Add each image to the video
    for image_path in image_paths:
        img = cv2.imread(image_path)
        video.write(img)
    
    # Release video writer
    video.release()
    
    print(f"Video saved to {output_path}")

def process_meshes(mesh_dir, output_dir, output_video):
    """
    Process all meshes in a directory and create a video.
    
    Args:
        mesh_dir: Directory containing meshes
        output_dir: Directory to save rendered images
        output_video: Path to save output video
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Get all ply files in mesh_dir
    mesh_paths = sorted([
        os.path.join(mesh_dir, f) for f in os.listdir(mesh_dir) 
        if f.endswith('.ply')
    ])
    
    print(f"Found {len(mesh_paths)} meshes in {mesh_dir}")
    
    # Create a temporary directory for all rendered frames
    with tempfile.TemporaryDirectory() as temp_dir:
        all_frames = []
        
        # Process each mesh
        for i, mesh_path in enumerate(mesh_paths):
            print(f"Processing mesh {i+1}/{len(mesh_paths)}: {mesh_path}")
            
            # Create a subdirectory for this mesh
            mesh_output_dir = os.path.join(temp_dir, f"mesh_{i:04d}")
            os.makedirs(mesh_output_dir, exist_ok=True)
            
            # Render mesh
            frames = render_mesh(mesh_path, mesh_output_dir)
            all_frames.extend(frames)
            
            # Save a sample frame to the output directory
            if i == 0:
                sample_frame = os.path.join(output_dir, "sample_frame.png")
                os.system(f"cp {frames[0]} {sample_frame}")
                print(f"Sample frame saved to {sample_frame}")
        
        # Create video from all frames
        create_video(all_frames, output_video, fps=30)

def main():
    parser = argparse.ArgumentParser(description="Render video from 3D meshes")
    parser.add_argument("--mesh-dir", required=True, help="Directory containing meshes")
    parser.add_argument("--output-dir", required=True, help="Directory to save rendered images")
    parser.add_argument("--output-video", required=True, help="Path to save output video")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.mesh_dir):
        print(f"Error: Mesh directory does not exist: {args.mesh_dir}")
        return
    
    process_meshes(args.mesh_dir, args.output_dir, args.output_video)

if __name__ == "__main__":
    main()
