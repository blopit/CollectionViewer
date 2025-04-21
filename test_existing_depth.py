#!/usr/bin/env python3
"""
Test Existing Depth Maps

This script locates and visualizes existing depth maps in the videos directory.
"""

import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
import open3d as o3d
from PIL import Image


def extract_frame_from_video(video_path, output_path, frame_num=0):
    """Extract a specific frame from a video."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    
    # Set position to frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    
    # Read frame
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        cv2.imwrite(output_path, frame)
        print(f"Frame {frame_num} extracted to: {output_path}")
        return output_path
    else:
        raise ValueError(f"Failed to extract frame {frame_num}")


def extract_frame_from_depth_video(video_path, output_path, frame_num=0):
    """Extract a frame from a depth video and convert it to grayscale."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    
    # Set position to frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    
    # Read frame
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        # Convert to grayscale if it's not already
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame
        
        cv2.imwrite(output_path, gray)
        
        # Also save colored version for visualization
        colored = cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)
        colored_path = output_path.replace('.png', '_colored.png')
        cv2.imwrite(colored_path, colored)
        
        print(f"Depth frame {frame_num} extracted to: {output_path}")
        return output_path
    else:
        raise ValueError(f"Failed to extract frame {frame_num}")


def find_matching_depth_video(color_video_path):
    """Find a corresponding depth video for a color video."""
    directory = os.path.dirname(color_video_path)
    base_name = os.path.splitext(os.path.basename(color_video_path))[0]
    
    # Check for common patterns
    potential_names = [
        f"depth_{base_name}.mp4",
        f"{base_name}_depth.mp4",
        f"depth_video_{base_name}.mp4"
    ]
    
    for name in potential_names:
        path = os.path.join(directory, name)
        if os.path.exists(path):
            return path
    
    # Try to find any depth video in the same directory
    for file in os.listdir(directory):
        if file.startswith("depth_") and file.endswith(".mp4"):
            return os.path.join(directory, file)
    
    return None


def visualize_depth_as_3d(color_path, depth_path, output_path):
    """Visualize depth map as a 3D point cloud and save the visualization."""
    # Load color image
    color_img = o3d.io.read_image(color_path)
    
    # Load depth image
    depth_img = o3d.io.read_image(depth_path)
    
    # Get image dimensions
    color_np = np.asarray(color_img)
    depth_np = np.asarray(depth_img)
    
    # Resize depth to match color if needed
    if color_np.shape[:2] != depth_np.shape[:2]:
        print(f"Resizing depth from {depth_np.shape[:2]} to {color_np.shape[:2]}")
        depth_resized = cv2.resize(depth_np, (color_np.shape[1], color_np.shape[0]))
        cv2.imwrite(depth_path, depth_resized)
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


def main():
    # Create test directory
    test_dir = "test_existing_results"
    os.makedirs(test_dir, exist_ok=True)
    
    # Test settings
    color_video_path = "videos/video.mp4"
    depth_video_path = "videos/depth_video.mp4"  # Default, will try to find match if not found
    
    # Check if depth video exists, otherwise try to find a matching one
    if not os.path.exists(depth_video_path):
        depth_video_path = find_matching_depth_video(color_video_path)
        if not depth_video_path:
            print("No matching depth video found. Using a color video to generate depth...")
            depth_video_path = None
    
    # Set output paths
    color_frame_path = os.path.join(test_dir, "color_frame.jpg")
    depth_frame_path = os.path.join(test_dir, "depth_frame.png")
    point_cloud_vis_path = os.path.join(test_dir, "point_cloud_vis.png")
    mesh_path = os.path.join(test_dir, "mesh.ply")
    mesh_vis_path = os.path.join(test_dir, "mesh_vis.png")
    
    # Run tests
    print("\n===== TESTING WITH EXISTING DEPTH MAPS =====\n")
    
    # 1. Extract color frame
    print("1. Extracting color frame...")
    extract_frame_from_video(color_video_path, color_frame_path)
    
    # 2. Extract depth frame or generate one
    print("\n2. Extracting depth frame...")
    if depth_video_path:
        extract_frame_from_depth_video(depth_video_path, depth_frame_path)
        print(f"Using depth video: {depth_video_path}")
    else:
        # If no depth video is found, generate a depth map from the color frame
        print("Generating depth map from color frame...")
        # Simple depth generation (similar to the other test script)
        img = cv2.imread(color_frame_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        edges = 255 - edges
        dist = cv2.distanceTransform(edges, cv2.DIST_L2, 3)
        cv2.normalize(dist, dist, 0, 255, cv2.NORM_MINMAX)
        depth = np.uint8(dist)
        depth_colored = cv2.applyColorMap(depth, cv2.COLORMAP_JET)
        cv2.imwrite(depth_frame_path, depth)
        cv2.imwrite(depth_frame_path.replace('.png', '_colored.png'), depth_colored)
    
    # 3. Visualize as point cloud
    print("\n3. Visualizing as 3D point cloud...")
    visualize_depth_as_3d(color_frame_path, depth_frame_path, point_cloud_vis_path)
    
    # 4. Create 3D mesh
    print("\n4. Creating 3D mesh...")
    create_3d_mesh_from_depth(color_frame_path, depth_frame_path, mesh_path)
    
    # 5. Visualize mesh
    print("\n5. Visualizing 3D mesh...")
    # This would use Open3D Visualization - running in a script would open a window
    # For this example, we'll just save the rendered image
    # Similar code to the other script
    mesh = o3d.io.read_triangle_mesh(mesh_path)
    mesh.compute_vertex_normals()
    vis = o3d.visualization.Visualizer()
    vis.create_window()
    vis.add_geometry(mesh)
    opt = vis.get_render_option()
    opt.mesh_show_back_face = True
    opt.background_color = np.array([0.5, 0.5, 0.5])
    ctr = vis.get_view_control()
    ctr.set_zoom(0.7)
    ctr.set_front([0, 0, -1])
    ctr.set_lookat([0, 0, 0])
    ctr.set_up([0, -1, 0])
    vis.capture_screen_image(mesh_vis_path, do_render=True)
    vis.run()
    vis.destroy_window()
    
    print("\n===== TESTS COMPLETED =====\n")
    print("Results saved in:", test_dir)
    
    # Create a summary image
    plt.figure(figsize=(15, 10))
    
    plt.subplot(2, 2, 1)
    plt.imshow(cv2.cvtColor(cv2.imread(color_frame_path), cv2.COLOR_BGR2RGB))
    plt.title("Color Frame")
    plt.axis("off")
    
    plt.subplot(2, 2, 2)
    plt.imshow(cv2.imread(depth_frame_path.replace('.png', '_colored.png')))
    plt.title("Depth Map")
    plt.axis("off")
    
    plt.subplot(2, 2, 3)
    plt.imshow(plt.imread(point_cloud_vis_path))
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