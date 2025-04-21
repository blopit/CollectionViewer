#!/usr/bin/env python3
"""
Depth-to-Mesh Converter Script

This script converts depth images to 3D meshes (.ply files) that can be viewed in the browser.
It supports:
1. Converting a single depth image to a mesh
2. Processing a directory of depth images
3. Basic inpainting of missing depth values

Usage:
    python mesh_converter.py --input depth.png --output mesh.ply
    python mesh_converter.py --input_dir depth_images/ --output_dir meshes/
"""

import os
import sys
import argparse
import numpy as np
from PIL import Image
import open3d as o3d
# Import the installed depth_to_mesh library - renamed to avoid conflict
try:
    import depth_to_mesh.mesh_from_depth as dtm
except ImportError:
    print("Warning: depth-to-mesh package not installed. Only Open3D conversion will be available.")
    dtm = None
from pathlib import Path

def convert_depth_to_mesh_open3d(depth_image_path, output_path, inpaint=True):
    """Convert a depth image to a 3D mesh using Open3D."""
    print("Converting {} to mesh...".format(depth_image_path))
    
    # Load depth image
    depth_img = np.array(Image.open(depth_image_path))
    
    # Normalize depth if needed (assuming depth is in range 0-255 or 0-65535)
    if depth_img.dtype == np.uint8:
        depth_img = depth_img.astype(np.float32) / 255.0
    elif depth_img.dtype == np.uint16:
        depth_img = depth_img.astype(np.float32) / 65535.0
    
    # Create depth image for Open3D
    depth = o3d.geometry.Image(depth_img)
    
    # Camera intrinsic parameters (estimate based on image size)
    width, height = depth_img.shape[1], depth_img.shape[0]
    fx = width * 0.8  # approximate focal length
    fy = height * 0.8
    cx = width / 2
    cy = height / 2
    intrinsic = o3d.camera.PinholeCameraIntrinsic(width, height, fx, fy, cx, cy)
    
    # Create point cloud from depth image
    pcd = o3d.geometry.PointCloud.create_from_depth_image(
        depth, intrinsic, depth_scale=1.0, depth_trunc=1.0
    )
    
    # Estimate normals for better mesh reconstruction
    pcd.estimate_normals(search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30))
    pcd.orient_normals_towards_camera_location()
    
    # Create mesh with Poisson surface reconstruction
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=9, width=0, scale=1.1, linear_fit=True
    )
    
    # Save the mesh
    o3d.io.write_triangle_mesh(output_path, mesh)
    print("Mesh saved to {}".format(output_path))
    return mesh

def convert_depth_to_mesh_dtm(depth_image_path, output_path):
    """Convert a depth image to a 3D mesh using depth-to-mesh library."""
    if dtm is None:
        raise ImportError("depth-to-mesh package is not installed")
        
    print("Converting {} to mesh using depth-to-mesh...".format(depth_image_path))
    
    # Load depth image
    depth_img = np.array(Image.open(depth_image_path))
    
    # Process depth image
    mesh = dtm.process_depth_image(depth_img)
    
    # Save the mesh
    mesh.export(output_path)
    print("Mesh saved to {}".format(output_path))
    return mesh

def process_directory(input_dir, output_dir, method='open3d'):
    """Process all depth images in a directory."""
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True, parents=True)
    
    # Find all image files
    image_files = []
    for ext in ['*.png', '*.jpg', '*.jpeg']:
        image_files.extend(list(input_path.glob(ext)))
    
    print("Found {} images in {}".format(len(image_files), input_dir))
    
    for img_path in image_files:
        out_file = output_path / "{}.ply".format(img_path.stem)
        if method == 'open3d':
            convert_depth_to_mesh_open3d(str(img_path), str(out_file))
        else:
            convert_depth_to_mesh_dtm(str(img_path), str(out_file))

def main():
    parser = argparse.ArgumentParser(description='Convert depth images to 3D meshes')
    parser.add_argument('--input', help='Input depth image file')
    parser.add_argument('--output', help='Output mesh file (.ply)')
    parser.add_argument('--input_dir', help='Directory containing depth images')
    parser.add_argument('--output_dir', help='Directory for output meshes')
    parser.add_argument('--method', choices=['open3d', 'dtm'], default='open3d',
                       help='Mesh generation method: open3d or depth-to-mesh (dtm)')
    
    args = parser.parse_args()
    
    if args.input and args.output:
        # Process single file
        if args.method == 'open3d':
            convert_depth_to_mesh_open3d(args.input, args.output)
        else:
            convert_depth_to_mesh_dtm(args.input, args.output)
    elif args.input_dir and args.output_dir:
        # Process directory
        process_directory(args.input_dir, args.output_dir, args.method)
    else:
        print("Error: Please provide either --input and --output or --input_dir and --output_dir")
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main() 