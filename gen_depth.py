#!/usr/bin/env python3
"""
Depth Map Generator for 3D Collection Viewer

This script generates depth maps from a video file using the MiDaS neural network.
The depth maps are then combined into a video file that can be used by the 3D Collection Viewer.

Requirements:
- PyTorch
- OpenCV
- PIL
- ffmpeg (command line tool)

Usage:
    python gen_depth.py

The script expects a video file at 'videos/video.mp4' and will output
the depth map video to 'videos/depth_video.mp4'.
"""

import os
import cv2
import numpy as np
import torch
import tempfile
import shutil
from PIL import Image
from torchvision.transforms import Compose, Resize, ToTensor, Normalize

# Video paths
input_video = "videos/video.mp4"
output_video = "videos/depth_video.mp4"
temp_dir = tempfile.mkdtemp()
frames_dir = os.path.join(temp_dir, "frames")
depth_dir = os.path.join(temp_dir, "depth")

os.makedirs(frames_dir, exist_ok=True)
os.makedirs(depth_dir, exist_ok=True)

print(f"Using temporary directory: {temp_dir}")

# Step 1: Load model
print("Loading MiDaS model...")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

try:
    # Use MiDaS small model for faster processing
    model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
    model.to(device)
    model.eval()
    print("MiDaS model loaded successfully")
except Exception as e:
    print(f"Error loading MiDaS model: {str(e)}")
    exit(1)

# Step 2: Define transformation
transform = Compose(
    [
        Resize((256, 256)),
        ToTensor(),
        Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)

# Step 3: Extract frames from video
print(f"Extracting frames from {input_video}...")
cap = cv2.VideoCapture(input_video)
if not cap.isOpened():
    print(f"Error: Could not open video {input_video}")
    exit(1)

fps = cap.get(cv2.CAP_PROP_FPS)
frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

print(f"Video: {width}x{height}, {fps} fps, {frame_count} frames")

frame_idx = 0
while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_path = os.path.join(frames_dir, f"frame_{frame_idx:06d}.jpg")
    cv2.imwrite(frame_path, frame)

    if frame_idx % 10 == 0:
        print(f"Extracted {frame_idx}/{frame_count} frames")

    frame_idx += 1

cap.release()
print(f"Extracted {frame_idx} frames")

# Step 4: Process frames to generate depth maps
print("Generating depth maps...")
frame_files = sorted([os.path.join(frames_dir, f) for f in os.listdir(frames_dir) if f.endswith(".jpg")])
total_frames = len(frame_files)

for i, frame_path in enumerate(frame_files):
    # Load image
    img = Image.open(frame_path).convert("RGB")

    # Prepare input
    input_batch = transform(img).unsqueeze(0).to(device)

    # Run inference
    with torch.no_grad():
        prediction = model(input_batch)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=(height, width),
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    # Convert to numpy and normalize to 0-255
    output = prediction.cpu().numpy()
    output = (255 * (output - output.min()) / (output.max() - output.min())).astype(np.uint8)

    # Save depth map
    depth_path = os.path.join(depth_dir, os.path.basename(frame_path))
    depth_image = Image.fromarray(output)
    depth_image.save(depth_path)

    if i % 10 == 0 or i == total_frames - 1:
        print(f"Processed {i+1}/{total_frames} frames")

# Step 5: Create video from depth frames
print("Creating depth video...")
cmd = f"ffmpeg -y -framerate {fps} -i {depth_dir}/frame_%06d.jpg -c:v libx264 -pix_fmt yuv420p {output_video}"
os.system(cmd)

# Clean up temporary directory
print("Cleaning up temporary files...")
shutil.rmtree(temp_dir)

print(f"Depth video successfully created: {output_video}")