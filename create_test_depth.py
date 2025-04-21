#!/usr/bin/env python3
"""
Create a simple depth image for testing the 3D mesh conversion.
"""

import numpy as np
from PIL import Image
import os

# Create output directory if it doesn't exist
os.makedirs('depth_images', exist_ok=True)

# Create a simple depth image with gradients and shapes
width, height = 512, 512
image = np.zeros((height, width), dtype=np.uint8)

# Create a gradient background
for y in range(height):
    for x in range(width):
        # Create a distance-based gradient
        dist = np.sqrt((x - width/2)**2 + (y - height/2)**2)
        value = max(0, min(255, int(255 - dist * 0.5)))
        image[y, x] = value

# Add a rectangle
rect_x1, rect_y1 = 150, 150
rect_x2, rect_y2 = 350, 350
rect_value = 220
image[rect_y1:rect_y2, rect_x1:rect_x2] = rect_value

# Add a circle
circle_x, circle_y = width//2, height//2
circle_radius = 100
for y in range(height):
    for x in range(width):
        dist = np.sqrt((x - circle_x)**2 + (y - circle_y)**2)
        if dist < circle_radius:
            # Make the circle a dome shape
            circle_value = int(200 + (circle_radius - dist) * 0.5)
            image[y, x] = min(255, circle_value)

# Save the depth image
output_path = 'depth_images/test_shape.png'
Image.fromarray(image).save(output_path)
print(f"Created test depth image at {output_path}")

# Create a second simpler image with just blocks
simple_image = np.zeros((height, width), dtype=np.uint8)

# Background
simple_image.fill(50)

# Create a few rectangles with different "depths"
rectangles = [
    (100, 100, 200, 200, 150),  # x1, y1, x2, y2, depth value
    (300, 100, 400, 200, 200),
    (100, 300, 200, 400, 250),
    (300, 300, 400, 400, 100),
    (200, 200, 300, 300, 220)
]

for rect in rectangles:
    x1, y1, x2, y2, value = rect
    simple_image[y1:y2, x1:x2] = value

# Save the second depth image
output_path2 = 'depth_images/test_blocks.png'
Image.fromarray(simple_image).save(output_path2)
print(f"Created test blocks depth image at {output_path2}")

print("Done! You can now use these depth images to test the 3D mesh conversion.") 