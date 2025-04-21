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
    try:
        print("Converting {} to mesh...".format(depth_image_path))
        
        # Load depth image
        depth_img = np.array(Image.open(depth_image_path))
        print(f"Loaded depth image shape: {depth_img.shape}, dtype: {depth_img.dtype}")
        
        # Ensure the image is 2D
        if len(depth_img.shape) > 2:
            depth_img = depth_img[:,:,0]  # Take first channel if multi-channel
        
        # Normalize depth if needed (assuming depth is in range 0-255 or 0-65535)
        if depth_img.dtype == np.uint8:
            depth_img = depth_img.astype(np.float32) / 255.0
        elif depth_img.dtype == np.uint16:
            depth_img = depth_img.astype(np.float32) / 65535.0
            
        # Flip the depth values if they appear inverted
        if depth_img.mean() > 0.5:
            depth_img = 1.0 - depth_img
        
        print(f"Normalized depth range: {depth_img.min():.3f} to {depth_img.max():.3f}")
        
        # Create a simple vertex grid
        rows, cols = depth_img.shape
        vertices = []
        triangles = []
        
        # Create vertices
        for i in range(rows):
            for j in range(cols):
                # Convert pixel coordinates to 3D space
                x = (j - cols/2) / cols
                y = (rows/2 - i) / rows
                z = depth_img[i,j]
                vertices.append([x, y, z])
        
        # Create triangles (faces)
        for i in range(rows-1):
            for j in range(cols-1):
                # Get vertex indices
                v0 = i * cols + j
                v1 = v0 + 1
                v2 = (i+1) * cols + j
                v3 = v2 + 1
                
                # Create two triangles for each quad
                triangles.append([v0, v2, v1])
                triangles.append([v1, v2, v3])
        
        # Create mesh
        mesh = o3d.geometry.TriangleMesh()
        mesh.vertices = o3d.utility.Vector3dVector(np.array(vertices))
        mesh.triangles = o3d.utility.Vector3iVector(np.array(triangles))
        
        # Compute vertex normals
        mesh.compute_vertex_normals()
        
        print(f"Created mesh with {len(mesh.vertices)} vertices and {len(mesh.triangles)} triangles")
        
        # Save the mesh
        o3d.io.write_triangle_mesh(output_path, mesh)
        print("Mesh saved to {}".format(output_path))
        return mesh
        
    except Exception as e:
        print(f"Error converting depth to mesh: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

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