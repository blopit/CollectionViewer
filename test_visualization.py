#!/usr/bin/env python3
"""
Test Visualization Script

This script extracts the first frame from a video, generates a depth map,
and visualizes it as a 3D point cloud using Open3D.
"""

import os
import cv2
import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt
from PIL import Image


def extract_first_frame(video_path, output_path):
    """Extract the first frame from a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        cv2.imwrite(output_path, frame)
        print(f"First frame extracted to: {output_path}")
        return output_path
    else:
        raise ValueError("Failed to extract frame")


def create_simple_depth_map(image_path, output_path):
    """
    Create a simple depth map using grayscale and edge detection.
    This is a placeholder for actual depth estimation.
    """
    # Load image
    img = cv2.imread(image_path)
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply edge detection
    edges = cv2.Canny(blurred, 50, 150)
    
    # Invert edges (edges are black, non-edges are white)
    edges = 255 - edges
    
    # Apply distance transform to get a crude depth map
    dist = cv2.distanceTransform(edges, cv2.DIST_L2, 3)
    
    # Normalize to 0-255
    cv2.normalize(dist, dist, 0, 255, cv2.NORM_MINMAX)
    
    # Convert to uint8
    depth = np.uint8(dist)
    
    # Apply colormap for visualization
    depth_colored = cv2.applyColorMap(depth, cv2.COLORMAP_JET)
    
    # Save depth map
    cv2.imwrite(output_path, depth)
    cv2.imwrite(output_path.replace('.png', '_colored.png'), depth_colored)
    
    print(f"Simple depth map created at: {output_path}")
    return output_path


def visualize_depth_as_pointcloud(color_path, depth_path, output_path):
    """Visualize depth map as a 3D point cloud and save screenshot."""
    # Load color image
    color_img = o3d.io.read_image(color_path)
    
    # Load depth image
    depth_img = o3d.io.read_image(depth_path)
    
    # Convert to Open3D RGBD image
    rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
        color_img, depth_img,
        depth_scale=255.0,  # Scale factor for 8-bit depth images
        depth_trunc=5.0,    # Maximum depth in meters
        convert_rgb_to_intensity=False
    )
    
    # Camera intrinsics (estimate from image size)
    width, height = np.asarray(color_img).shape[1], np.asarray(color_img).shape[0]
    focal_length = max(width, height) * 1.2  # Approximate focal length
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width, height, focal_length, focal_length, width/2, height/2
    )
    
    # Create point cloud from RGBD image
    pcd = o3d.geometry.PointCloud.create_from_rgbd_image(rgbd, intrinsic)
    
    # Flip the orientation for better visualization
    pcd.transform([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]])
    
    # Visualize point cloud
    print("Visualizing point cloud. Close the window to continue...")
    vis = o3d.visualization.Visualizer()
    vis.create_window()
    vis.add_geometry(pcd)
    
    # Improve visualization
    opt = vis.get_render_option()
    opt.point_size = 1.0
    opt.background_color = np.array([0.5, 0.5, 0.5])
    
    # Set up camera view
    ctr = vis.get_view_control()
    ctr.set_zoom(0.5)
    ctr.set_front([0, 0, -1])
    ctr.set_lookat([0, 0, 0])
    ctr.set_up([0, -1, 0])
    
    # Capture image
    vis.capture_screen_image(output_path, do_render=True)
    
    # Run visualization
    vis.run()
    vis.destroy_window()
    
    print(f"Point cloud visualization saved to: {output_path}")
    return output_path


def create_3d_mesh_from_depth(color_path, depth_path, output_path):
    """Create a 3D mesh from depth map and save it."""
    # Load color image
    color_img = o3d.io.read_image(color_path)
    
    # Load depth image
    depth_img = o3d.io.read_image(depth_path)
    
    # Convert to Open3D RGBD image
    rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
        color_img, depth_img,
        depth_scale=255.0,  # Scale factor for 8-bit depth images
        depth_trunc=5.0,    # Maximum depth in meters
        convert_rgb_to_intensity=False
    )
    
    # Camera intrinsics (estimate from image size)
    width, height = np.asarray(color_img).shape[1], np.asarray(color_img).shape[0]
    focal_length = max(width, height) * 1.2  # Approximate focal length
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width, height, focal_length, focal_length, width/2, height/2
    )
    
    # Create point cloud from RGBD image
    pcd = o3d.geometry.PointCloud.create_from_rgbd_image(rgbd, intrinsic)
    
    # Flip the orientation for better visualization
    pcd.transform([[1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, 1]])
    
    # Estimate normals
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    pcd.normalize_normals()
    
    # Orient normals consistently
    pcd.orient_normals_towards_camera_location(np.array([0, 0, 0]))
    
    # Create mesh using Poisson reconstruction
    print("Creating mesh using Poisson reconstruction...")
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=9, width=0, scale=1.1, linear_fit=False
    )
    
    # Remove low-density vertices
    vertices_to_remove = densities < np.quantile(densities, 0.1)
    mesh.remove_vertices_by_mask(vertices_to_remove)
    
    # Clean up mesh
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()
    
    # Save mesh
    o3d.io.write_triangle_mesh(output_path, mesh)
    
    print(f"3D mesh saved to: {output_path}")
    return output_path


def visualize_mesh(mesh_path, output_path):
    """Visualize the 3D mesh and save screenshot."""
    # Load mesh
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    
    # Compute vertex normals for better visualization
    mesh.compute_vertex_normals()
    
    # Visualize mesh
    print("Visualizing mesh. Close the window to continue...")
    vis = o3d.visualization.Visualizer()
    vis.create_window()
    vis.add_geometry(mesh)
    
    # Improve visualization
    opt = vis.get_render_option()
    opt.mesh_show_back_face = True
    opt.background_color = np.array([0.5, 0.5, 0.5])
    
    # Set up camera view
    ctr = vis.get_view_control()
    ctr.set_zoom(0.7)
    ctr.set_front([0, 0, -1])
    ctr.set_lookat([0, 0, 0])
    ctr.set_up([0, -1, 0])
    
    # Capture image
    vis.capture_screen_image(output_path, do_render=True)
    
    # Run visualization
    vis.run()
    vis.destroy_window()
    
    print(f"Mesh visualization saved to: {output_path}")
    return output_path


def main():
    # Create test directory
    test_dir = "test_results"
    os.makedirs(test_dir, exist_ok=True)
    
    # Test settings
    video_path = "videos/video.mp4"
    frame_path = os.path.join(test_dir, "first_frame.jpg")
    depth_path = os.path.join(test_dir, "depth_map.png")
    pointcloud_vis_path = os.path.join(test_dir, "pointcloud_vis.png")
    mesh_path = os.path.join(test_dir, "mesh.ply")
    mesh_vis_path = os.path.join(test_dir, "mesh_vis.png")
    
    # Run tests
    print("\n===== RUNNING TESTS =====\n")
    
    # 1. Extract first frame
    print("1. Extracting first frame from video...")
    extract_first_frame(video_path, frame_path)
    
    # 2. Create simple depth map
    print("\n2. Creating simple depth map...")
    create_simple_depth_map(frame_path, depth_path)
    
    # 3. Visualize depth as point cloud
    print("\n3. Visualizing depth as point cloud...")
    visualize_depth_as_pointcloud(frame_path, depth_path, pointcloud_vis_path)
    
    # 4. Create 3D mesh from depth
    print("\n4. Creating 3D mesh from depth...")
    create_3d_mesh_from_depth(frame_path, depth_path, mesh_path)
    
    # 5. Visualize mesh
    print("\n5. Visualizing 3D mesh...")
    visualize_mesh(mesh_path, mesh_vis_path)
    
    print("\n===== TESTS COMPLETED =====\n")
    print("Results saved in:", test_dir)
    
    # Display results
    plt.figure(figsize=(15, 10))
    
    plt.subplot(2, 2, 1)
    plt.imshow(cv2.cvtColor(cv2.imread(frame_path), cv2.COLOR_BGR2RGB))
    plt.title("First Frame")
    plt.axis("off")
    
    plt.subplot(2, 2, 2)
    plt.imshow(cv2.imread(depth_path.replace('.png', '_colored.png')))
    plt.title("Depth Map")
    plt.axis("off")
    
    plt.subplot(2, 2, 3)
    plt.imshow(plt.imread(pointcloud_vis_path))
    plt.title("Point Cloud Visualization")
    plt.axis("off")
    
    plt.subplot(2, 2, 4)
    plt.imshow(plt.imread(mesh_vis_path))
    plt.title("3D Mesh Visualization")
    plt.axis("off")
    
    plt.tight_layout()
    plt.savefig(os.path.join(test_dir, "summary.png"))
    plt.show()


if __name__ == "__main__":
    main() 