#!/usr/bin/env python3
"""
Simple Mesh Converter
Converts depth images to PLY files without using Open3D
"""

import numpy as np
from PIL import Image
import os

def create_mesh_from_depth(depth_image_path, output_path):
    """Convert a depth image to a simple PLY mesh."""
    try:
        # Load and normalize depth image
        depth_img = np.array(Image.open(depth_image_path))
        if len(depth_img.shape) > 2:
            depth_img = depth_img[:,:,0]
        
        # Normalize to 0-1
        if depth_img.dtype == np.uint8:
            depth_img = depth_img.astype(np.float32) / 255.0
        elif depth_img.dtype == np.uint16:
            depth_img = depth_img.astype(np.float32) / 65535.0
            
        # Flip if inverted
        if depth_img.mean() > 0.5:
            depth_img = 1.0 - depth_img
            
        # Create vertex grid
        rows, cols = depth_img.shape
        vertices = []
        faces = []
        
        # Generate vertices
        scale = 2.0  # Scale factor for x,y coordinates
        for i in range(rows):
            for j in range(cols):
                # Convert pixel coordinates to 3D space
                x = scale * (j - cols/2) / cols
                y = scale * (rows/2 - i) / rows
                z = depth_img[i,j]
                vertices.append((x, y, z))
        
        # Generate faces (triangles)
        for i in range(rows-1):
            for j in range(cols-1):
                v0 = i * cols + j
                v1 = v0 + 1
                v2 = (i+1) * cols + j
                v3 = v2 + 1
                # Create two triangles for each grid cell
                faces.append((v0, v2, v1))
                faces.append((v1, v2, v3))
        
        # Write PLY file
        with open(output_path, 'w') as f:
            # Write header
            f.write("ply\n")
            f.write("format ascii 1.0\n")
            f.write(f"element vertex {len(vertices)}\n")
            f.write("property float x\n")
            f.write("property float y\n")
            f.write("property float z\n")
            f.write(f"element face {len(faces)}\n")
            f.write("property list uchar int vertex_indices\n")
            f.write("end_header\n")
            
            # Write vertices
            for v in vertices:
                f.write(f"{v[0]} {v[1]} {v[2]}\n")
            
            # Write faces
            for face in faces:
                f.write(f"3 {face[0]} {face[1]} {face[2]}\n")
        
        print(f"Created mesh with {len(vertices)} vertices and {len(faces)} faces")
        print(f"Mesh saved to {output_path}")
        return True
        
    except Exception as e:
        print(f"Error creating mesh: {str(e)}")
        return False

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python simple_mesh_converter.py input.png output.ply")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(input_path):
        print(f"Input file {input_path} does not exist")
        sys.exit(1)
    
    success = create_mesh_from_depth(input_path, output_path)
    if not success:
        sys.exit(1) 