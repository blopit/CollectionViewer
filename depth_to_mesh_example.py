#!/usr/bin/env python3
"""
Depth to Mesh Example

This script demonstrates how to convert a depth map to a 3D mesh using Open3D.
It takes a depth map image (PNG) and optionally a color image (JPG/PNG) and 
generates a textured 3D mesh (PLY).
"""

import os
import argparse
import numpy as np
import open3d as o3d
from PIL import Image


def depth_to_mesh(depth_path, color_path=None, output_path=None, 
                  depth_scale=1000.0, depth_trunc=3.0, focal_length=None):
    """
    Convert a depth map to a 3D mesh using Open3D.
    
    Args:
        depth_path: Path to the depth map image (PNG)
        color_path: Optional path to the color image for texturing
        output_path: Path to save the output mesh (PLY)
        depth_scale: Scale factor to convert depth values to meters
        depth_trunc: Truncate depth values beyond this distance (meters)
        focal_length: Focal length of the camera (if None, estimated from image size)
        
    Returns:
        Path to the generated mesh
    """
    # Ensure output path exists
    if output_path is None:
        output_dir = os.path.dirname(depth_path)
        basename = os.path.splitext(os.path.basename(depth_path))[0]
        output_path = os.path.join(output_dir, f"{basename}.ply")
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Load depth image
    if depth_path.endswith('.npy'):
        # Load numpy array
        depth_np = np.load(depth_path)
        # Convert to Open3D format (float32)
        depth_image = o3d.geometry.Image(depth_np.astype(np.float32))
    else:
        # Load image and convert to grayscale
        depth_pil = Image.open(depth_path).convert('L')
        depth_np = np.array(depth_pil).astype(np.float32) / depth_scale
        depth_image = o3d.geometry.Image(depth_np)
    
    # Get dimensions
    height, width = depth_np.shape
    
    # Set camera intrinsics
    if focal_length is None:
        # Estimate focal length based on image dimensions
        # Common approximation: focal_length = max(width, height) * 1.2
        focal_length = max(width, height) * 1.2
    
    cx, cy = width / 2, height / 2
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width, height, focal_length, focal_length, cx, cy
    )
    
    # Create point cloud from depth
    if color_path:
        # Load color image
        color_image = o3d.io.read_image(color_path)
        # Create RGBD image
        rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
            color_image, depth_image,
            depth_scale=1.0,  # Already scaled
            depth_trunc=depth_trunc,
            convert_rgb_to_intensity=False
        )
        # Create point cloud from RGBD image
        pcd = o3d.geometry.PointCloud.create_from_rgbd_image(rgbd, intrinsic)
    else:
        # Create point cloud from depth image
        pcd = o3d.geometry.PointCloud.create_from_depth_image(
            depth_image, intrinsic, depth_scale=1.0, depth_trunc=depth_trunc
        )
    
    # Flip the orientation to align with camera coordinate system
    pcd.transform([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]])
    
    # Optional: Preprocess point cloud
    # 1. Remove outliers
    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
    
    # 2. Estimate normals
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    pcd.normalize_normals()
    
    # 3. Orient normals consistent with viewing direction
    pcd.orient_normals_towards_camera_location(np.array([0, 0, 0]))
    
    # Reconstruct mesh using Poisson surface reconstruction
    print("Reconstructing mesh using Poisson reconstruction...")
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=9, width=0, scale=1.1, linear_fit=False
    )
    
    # Remove low-density vertices
    vertices_to_remove = densities < np.quantile(densities, 0.1)
    mesh.remove_vertices_by_mask(vertices_to_remove)
    
    # Optional: Simplify mesh
    # mesh = mesh.simplify_quadric_decimation(100000)
    
    # Optional: Clean mesh
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()
    
    # Save mesh
    o3d.io.write_triangle_mesh(output_path, mesh)
    print(f"Mesh saved to {output_path}")
    
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Convert depth map to 3D mesh")
    parser.add_argument("--depth", required=True, help="Path to depth map image (PNG or NPY)")
    parser.add_argument("--color", help="Path to color image for texturing")
    parser.add_argument("--output", help="Path to save output mesh (PLY)")
    parser.add_argument("--depth-scale", type=float, default=1000.0, 
                      help="Scale factor to convert depth values to meters")
    parser.add_argument("--depth-trunc", type=float, default=3.0,
                      help="Truncate depth values beyond this distance (meters)")
    parser.add_argument("--focal-length", type=float,
                      help="Camera focal length (if not provided, estimated from image)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.depth):
        print(f"Depth image does not exist: {args.depth}")
        return
    
    if args.color and not os.path.exists(args.color):
        print(f"Color image does not exist: {args.color}")
        return
    
    depth_to_mesh(
        depth_path=args.depth,
        color_path=args.color,
        output_path=args.output,
        depth_scale=args.depth_scale,
        depth_trunc=args.depth_trunc,
        focal_length=args.focal_length
    )


if __name__ == "__main__":
    main() 