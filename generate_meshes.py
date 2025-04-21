#!/usr/bin/env python3
"""
Generate Meshes from Depth Maps

This script converts depth maps to 3D meshes using Open3D.
"""

import os
import sys
import argparse
import numpy as np
import open3d as o3d
from pathlib import Path

def depth_to_mesh(depth_path, color_path, output_path, focal_length=None):
    """
    Convert a depth map to a 3D mesh using Open3D.
    
    Args:
        depth_path: Path to depth map (PNG or NPY)
        color_path: Path to color image for texturing
        output_path: Path to save output mesh
        focal_length: Camera focal length (if None, estimated from image size)
    """
    # Load depth image
    if depth_path.endswith('.npy'):
        depth = np.load(depth_path)
        # Convert to open3d format
        depth_image = o3d.geometry.Image(depth.astype(np.float32))
    else:
        depth_image = o3d.io.read_image(depth_path)
    
    # Load color image
    color_image = o3d.io.read_image(color_path)
    
    # Get image dimensions
    width, height = np.asarray(color_image).shape[1], np.asarray(color_image).shape[0]
    
    # Estimate focal length if not provided
    if focal_length is None:
        focal_length = max(width, height) * 1.2  # Approximate focal length
    
    # Camera intrinsics
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width, height, focal_length, focal_length, width/2, height/2
    )
    
    # Create RGBD image
    rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
        color_image, depth_image,
        depth_scale=1.0,  # Our depth is already in the right scale
        depth_trunc=10000.0,  # Large value to avoid truncation
        convert_rgb_to_intensity=False
    )
    
    # Create point cloud from RGBD image
    pcd = o3d.geometry.PointCloud.create_from_rgbd_image(rgbd, intrinsic)
    
    # Flip the orientation for better visualization
    pcd.transform([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]])
    
    # Estimate normals
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    
    # Surface reconstruction
    print(f"Reconstructing mesh from point cloud...")
    mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=9, width=0, scale=1.1, linear_fit=False
    )
    
    # Save mesh
    o3d.io.write_triangle_mesh(output_path, mesh)
    print(f"Mesh saved to {output_path}")

def process_depth_maps(depth_dir, frames_dir, output_dir):
    """
    Process all depth maps in a directory.
    
    Args:
        depth_dir: Directory containing depth maps
        frames_dir: Directory containing original frames
        output_dir: Directory to save meshes
    """
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Get all png files in depth_dir
    depth_paths = sorted([
        os.path.join(depth_dir, f) for f in os.listdir(depth_dir) 
        if f.endswith('.png')
    ])
    
    print(f"Found {len(depth_paths)} depth maps in {depth_dir}")
    
    # Process each depth map
    for i, depth_path in enumerate(depth_paths):
        print(f"Processing depth map {i+1}/{len(depth_paths)}: {depth_path}")
        
        # Get corresponding color image
        basename = os.path.splitext(os.path.basename(depth_path))[0]
        color_path = os.path.join(frames_dir, f"{basename}.jpg")
        
        if not os.path.exists(color_path):
            print(f"Warning: Color image not found: {color_path}")
            continue
        
        # Get output path
        output_path = os.path.join(output_dir, f"{basename}.ply")
        
        # Convert depth map to mesh
        depth_to_mesh(depth_path, color_path, output_path)

def main():
    parser = argparse.ArgumentParser(description="Generate meshes from depth maps")
    parser.add_argument("--depth-dir", required=True, help="Directory containing depth maps")
    parser.add_argument("--frames-dir", required=True, help="Directory containing original frames")
    parser.add_argument("--output-dir", required=True, help="Directory to save meshes")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.depth_dir):
        print(f"Error: Depth directory does not exist: {args.depth_dir}")
        return
    
    if not os.path.exists(args.frames_dir):
        print(f"Error: Frames directory does not exist: {args.frames_dir}")
        return
    
    process_depth_maps(args.depth_dir, args.frames_dir, args.output_dir)

if __name__ == "__main__":
    main()
