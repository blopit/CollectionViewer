#!/usr/bin/env python3
"""
3D Scene Reconstruction

This script reconstructs a 3D scene from a video frame and its depth map,
then renders a rotating view of the scene and saves it as a video.
"""

import os
import cv2
import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt
from pathlib import Path


def extract_frame(video_path, output_path, frame_num=0):
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
        cv2.imwrite(str(output_path), frame)
        print(f"Frame {frame_num} extracted to: {output_path}")
        return output_path
    else:
        raise ValueError(f"Failed to extract frame {frame_num}")


def extract_depth_frame(video_path, output_path, frame_num=0):
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
        
        # Convert Path to string for operations
        output_path_str = str(output_path)
        
        # Save grayscale image
        cv2.imwrite(output_path_str, gray)
        
        # Also save colored version for visualization
        colored_path = output_path_str.replace('.png', '_colored.png')
        colored = cv2.applyColorMap(gray, cv2.COLORMAP_INFERNO)
        cv2.imwrite(colored_path, colored)
        
        print(f"Depth frame {frame_num} extracted to: {output_path}")
        return output_path
    else:
        raise ValueError(f"Failed to extract frame {frame_num}")


def create_textured_mesh(color_path, depth_path, mesh_path):
    """Create a textured 3D mesh from color and depth images."""
    print("Creating textured mesh...")
    
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
    cx, cy = width / 2, height / 2
    intrinsic = o3d.camera.PinholeCameraIntrinsic(
        width, height, focal_length, focal_length, cx, cy
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
    pcd.orient_normals_towards_camera_location(np.array([0, 0, 0]))
    
    # Create mesh using Poisson reconstruction
    print("Reconstructing mesh with Poisson algorithm...")
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
    
    # Add vertex colors from point cloud to mesh
    mesh.vertex_colors = o3d.utility.Vector3dVector(np.asarray(pcd.colors))
    
    # Save mesh
    o3d.io.write_triangle_mesh(mesh_path, mesh)
    print(f"Textured mesh saved to {mesh_path}")
    
    return mesh


def render_rotating_scene(mesh, output_video_path, width=1280, height=720, 
                         duration_seconds=5, fps=30):
    """Render a video of the 3D scene rotating around the vertical axis."""
    print("Rendering rotating scene video...")
    
    # Calculate number of frames
    n_frames = duration_seconds * fps
    
    # Prepare video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))
    
    # Set up visualizer
    vis = o3d.visualization.Visualizer()
    vis.create_window(width=width, height=height, visible=False)
    vis.add_geometry(mesh)
    
    # Improve visualization
    render_option = vis.get_render_option()
    render_option.mesh_show_back_face = True
    render_option.background_color = np.array([0.5, 0.5, 0.5])
    render_option.point_size = 2.0
    render_option.light_on = True
    
    # Set initial view parameters
    view_control = vis.get_view_control()
    view_control.set_zoom(0.8)
    view_control.set_lookat([0, 0, 0])
    view_control.set_front([0, 0, -1])
    view_control.set_up([0, -1, 0])
    
    # Rotation angle per frame
    angle_step = 360.0 / n_frames
    
    for i in range(n_frames):
        # Rotate the mesh around Y axis
        rotation = np.radians(i * angle_step)  # Convert to radians
        # Create rotation matrix around Y axis
        R = np.array([
            [np.cos(rotation), 0, np.sin(rotation)],
            [0, 1, 0],
            [-np.sin(rotation), 0, np.cos(rotation)]
        ])
        
        # Set the camera position based on rotation
        view_control.set_front([np.sin(rotation), 0, -np.cos(rotation)])
        
        # Update the visualization
        vis.update_geometry(mesh)
        vis.poll_events()
        vis.update_renderer()
        
        # Capture frame
        img = vis.capture_screen_float_buffer(do_render=True)
        img_np = np.asarray(img) * 255
        img_np = img_np.astype(np.uint8)
        
        # Convert from RGB to BGR for OpenCV
        img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        # Write frame to video
        video_writer.write(img_np)
        
        # Show progress
        if i % 10 == 0:
            print(f"Rendering frame {i}/{n_frames}")
    
    # Close everything
    vis.destroy_window()
    video_writer.release()
    print(f"Video saved to {output_video_path}")
    
    return output_video_path


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


def main():
    # Create output directory
    output_dir = Path("3d_scene_reconstruction")
    output_dir.mkdir(exist_ok=True)
    
    # Input video paths
    color_video_path = "videos/video.mp4"
    depth_video_path = "videos/depth_video.mp4"
    
    # Check if depth video exists or find a matching one
    if not os.path.exists(depth_video_path):
        depth_video_path = find_matching_depth_video(color_video_path)
        if not depth_video_path:
            print("No matching depth video found. Cannot proceed.")
            return
    
    print(f"Using color video: {color_video_path}")
    print(f"Using depth video: {depth_video_path}")
    
    # Output paths
    color_frame_path = output_dir / "color_frame.jpg"
    depth_frame_path = output_dir / "depth_frame.png"
    mesh_path = output_dir / "scene_mesh.ply"
    video_path = output_dir / "rotating_scene.mp4"
    
    # Extract frames from videos
    print("\n===== SCENE RECONSTRUCTION PROCESS =====\n")
    print("1. Extracting frames from videos...")
    extract_frame(color_video_path, color_frame_path)
    extract_depth_frame(depth_video_path, depth_frame_path)
    
    # Create textured mesh
    print("\n2. Creating textured 3D mesh from frames...")
    mesh = create_textured_mesh(str(color_frame_path), str(depth_frame_path), str(mesh_path))
    
    # Render rotating scene video
    print("\n3. Rendering rotating scene video...")
    render_rotating_scene(mesh, str(video_path))
    
    print("\n===== SCENE RECONSTRUCTION COMPLETED =====\n")
    print(f"Results saved in: {output_dir}")
    print(f"Rotating scene video: {video_path}")
    
    # Display a confirmation image
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    
    # Original frame
    axes[0].imshow(cv2.cvtColor(cv2.imread(str(color_frame_path)), cv2.COLOR_BGR2RGB))
    axes[0].set_title("Original Frame")
    axes[0].axis("off")
    
    # Depth map
    depth_colored_path = str(depth_frame_path).replace('.png', '_colored.png')
    axes[1].imshow(cv2.imread(depth_colored_path))
    axes[1].set_title("Depth Map")
    axes[1].axis("off")
    
    # Capture a single frame from the output video
    cap = cv2.VideoCapture(str(video_path))
    ret, frame = cap.read()
    cap.release()
    if ret:
        axes[2].imshow(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    else:
        axes[2].text(0.5, 0.5, "Video rendering in progress...", 
                    ha="center", va="center", fontsize=12)
    axes[2].set_title("Scene Reconstruction")
    axes[2].axis("off")
    
    plt.tight_layout()
    plt.savefig(str(output_dir / "reconstruction_summary.png"))
    
    print("\nCheck the rotating scene video to see the 3D reconstruction!")


if __name__ == "__main__":
    main() 