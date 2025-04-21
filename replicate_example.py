#!/usr/bin/env python3
"""
Replicate API Example

This script demonstrates how to use Replicate's hosted 3D-Photo-Inpainting API
to generate depth maps and 3D inpainted content from images.
"""

import os
import sys
import argparse
import requests
from PIL import Image
from io import BytesIO
import time

try:
    import replicate
except ImportError:
    print("Replicate package not installed. Install with: pip install replicate")
    print("Then set your API token with: export REPLICATE_API_TOKEN=your_token")
    sys.exit(1)


def process_image_with_replicate(image_path, output_dir=None, api_token=None):
    """
    Process an image with Replicate's 3D-Photo-Inpainting API.
    
    Args:
        image_path: Path to the input image
        output_dir: Directory to save the output files
        api_token: Replicate API token (if not set in environment)
        
    Returns:
        Dictionary of output files
    """
    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(image_path), "replicate_output")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Use API token from parameter or environment
    if api_token:
        os.environ["REPLICATE_API_TOKEN"] = api_token
    elif "REPLICATE_API_TOKEN" not in os.environ:
        print("Error: REPLICATE_API_TOKEN not set.")
        print("Either provide it as a parameter or set it in your environment.")
        print("Get your token from https://replicate.com/account/api-tokens")
        return None
    
    # Initialize client
    client = replicate.Client()
    
    # Run the model
    print(f"Processing {image_path} with Replicate's 3D-Photo-Inpainting API...")
    
    # Open the image file
    with open(image_path, "rb") as f:
        image_data = f.read()
    
    try:
        output = client.run(
            "pollinations/3d-photo-inpainting:latest",
            input={
                "image": open(image_path, "rb"),
                # Optional parameters:
                # "depth_image": If you already have a depth map
                # "save_ply": True to generate a 3D mesh
                # "video_mode": "zoom-in" or "swing" or "circle" or "dolly-zoom-in"
            }
        )
        
        # Parse outputs
        results = {}
        
        # Save depth map
        basename = os.path.splitext(os.path.basename(image_path))[0]
        
        if "depth_map" in output and output["depth_map"]:
            depth_url = output["depth_map"]
            depth_path = os.path.join(output_dir, f"{basename}_depth.png")
            
            # Download depth map
            response = requests.get(depth_url)
            if response.status_code == 200:
                with open(depth_path, "wb") as f:
                    f.write(response.content)
                results["depth_map"] = depth_path
                print(f"Depth map saved to: {depth_path}")
        
        # Save inpainted color image
        if "inpainted_image" in output and output["inpainted_image"]:
            inpainted_url = output["inpainted_image"]
            inpainted_path = os.path.join(output_dir, f"{basename}_inpainted.png")
            
            # Download inpainted image
            response = requests.get(inpainted_url)
            if response.status_code == 200:
                with open(inpainted_path, "wb") as f:
                    f.write(response.content)
                results["inpainted_image"] = inpainted_path
                print(f"Inpainted image saved to: {inpainted_path}")
        
        # Save video if available
        if "video" in output and output["video"]:
            video_url = output["video"]
            video_path = os.path.join(output_dir, f"{basename}_3d.mp4")
            
            # Download video
            response = requests.get(video_url)
            if response.status_code == 200:
                with open(video_path, "wb") as f:
                    f.write(response.content)
                results["video"] = video_path
                print(f"3D video saved to: {video_path}")
        
        # Save mesh if available
        if "mesh" in output and output["mesh"]:
            mesh_url = output["mesh"]
            mesh_path = os.path.join(output_dir, f"{basename}.ply")
            
            # Download mesh
            response = requests.get(mesh_url)
            if response.status_code == 200:
                with open(mesh_path, "wb") as f:
                    f.write(response.content)
                results["mesh"] = mesh_path
                print(f"3D mesh saved to: {mesh_path}")
        
        return results
        
    except Exception as e:
        print(f"Error processing image with Replicate: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Process images with Replicate's 3D-Photo-Inpainting API")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--output-dir", help="Directory to save output files")
    parser.add_argument("--api-token", help="Replicate API token (if not set in environment)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.image):
        print(f"Input image does not exist: {args.image}")
        return
    
    results = process_image_with_replicate(
        image_path=args.image,
        output_dir=args.output_dir,
        api_token=args.api_token
    )
    
    if results:
        print("\nProcessing complete!")
        print("Output files:")
        for key, path in results.items():
            print(f"  - {key}: {path}")


if __name__ == "__main__":
    main() 