#!/usr/bin/env python3
"""
PLY Model Editor and Optimizer

This script can modify, optimize, and prepare 3D meshes from PLY files
for smooth display in a web browser. It handles:
1. Simplifying meshes to reduce polygon count
2. Normalizing model size and position
3. Optimizing for web viewing
4. Converting between formats

Usage:
    python edit_model.py --input mesh.ply --output optimized.ply --reduce 0.5
"""

import os
import sys
import argparse
import numpy as np
import open3d as o3d

def load_model(input_path):
    """Load a 3D model from file."""
    print("Loading model from {}".format(input_path))
    
    if input_path.endswith('.ply'):
        mesh = o3d.io.read_triangle_mesh(input_path)
    else:
        raise ValueError("Unsupported file format: {}".format(input_path))
    
    print("Loaded mesh with {} vertices and {} triangles".format(len(mesh.vertices), len(mesh.triangles)))
    return mesh

def center_and_normalize(mesh):
    """Center the model at the origin and normalize its size."""
    # Get the axis-aligned bounding box
    bbox = mesh.get_axis_aligned_bounding_box()
    
    # Get the center of the bounding box
    center = bbox.get_center()
    
    # Translate the mesh to center it at the origin
    mesh.translate(-center)
    
    # Get the scale to normalize the model
    scale = 1.0 / max(bbox.get_extent())
    
    # Scale the mesh
    mesh.scale(scale, [0, 0, 0])
    
    return mesh

def simplify_mesh(mesh, target_reduction):
    """Simplify a mesh by reducing the number of triangles."""
    print("Simplifying mesh (reduction factor: {})".format(target_reduction))
    
    # Calculate the target number of triangles
    target_triangles = int(len(mesh.triangles) * target_reduction)
    
    # Make sure the mesh has vertex normals
    if not mesh.has_vertex_normals():
        mesh.compute_vertex_normals()
    
    # Simplify the mesh
    simplified_mesh = mesh.simplify_quadric_decimation(target_triangles)
    
    print("Simplified mesh from {} to {} triangles".format(len(mesh.triangles), len(simplified_mesh.triangles)))
    return simplified_mesh

def repair_mesh(mesh):
    """Repair issues in a mesh that might cause problems for rendering."""
    # Remove degenerate triangles
    mesh.remove_degenerate_triangles()
    
    # Remove duplicated vertices
    mesh.remove_duplicated_vertices()
    
    # Remove duplicated triangles
    mesh.remove_duplicated_triangles()
    
    # Remove non-manifold edges
    mesh.remove_non_manifold_edges()
    
    return mesh

def main():
    parser = argparse.ArgumentParser(description='Edit and optimize 3D models')
    parser.add_argument('--input', required=True, help='Input model file (.ply)')
    parser.add_argument('--output', required=True, help='Output model file (.ply, .obj, .glb)')
    parser.add_argument('--reduce', type=float, default=1.0, 
                       help='Reduction factor for simplification (0.0-1.0)')
    parser.add_argument('--center', action='store_true', 
                       help='Center and normalize the model')
    parser.add_argument('--repair', action='store_true',
                       help='Repair mesh issues')
    
    args = parser.parse_args()
    
    # Load the model
    mesh = load_model(args.input)
    
    # Apply operations based on arguments
    if args.repair:
        mesh = repair_mesh(mesh)
    
    if args.reduce < 1.0:
        mesh = simplify_mesh(mesh, args.reduce)
    
    if args.center:
        mesh = center_and_normalize(mesh)
    
    # Save the model
    print("Saving optimized model to {}".format(args.output))
    o3d.io.write_triangle_mesh(args.output, mesh)
    
    print("Model processing complete!")

if __name__ == "__main__":
    main() 