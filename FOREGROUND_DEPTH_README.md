# Foreground-Focused Depth Map Generator

This tool generates depth maps from videos by first isolating foreground objects using computer vision techniques, and then applying depth estimation only to those foreground areas. This approach provides cleaner, more focused depth maps that emphasize the main subjects in the video.

## Features

- **Foreground Isolation**: Uses OpenCV to identify and isolate foreground objects
- **Multiple Segmentation Methods**:
  - **GrabCut**: Best for static scenes with clear foreground/background separation
  - **Background Subtraction**: Best for videos with moving objects
  - **Watershed**: Alternative approach that works well for certain types of scenes
- **Depth Estimation**: Uses MiDaS neural network for high-quality depth maps
- **Customizable Parameters**: Control foreground detection sensitivity and depth map smoothing

## Requirements

- Python 3.6+
- PyTorch
- OpenCV
- NumPy
- PIL
- tqdm
- ffmpeg (command line tool)

## Installation

1. Make sure you have all the required dependencies installed:

```bash
pip install torch torchvision opencv-python numpy pillow tqdm
```

2. Ensure ffmpeg is installed on your system.

## Usage

### Basic Usage

```bash
python foreground_depth.py --input input_video.mp4 --output output_depth.mp4
```

### Advanced Options

```bash
python foreground_depth.py --input input_video.mp4 --output output_depth.mp4 \
    --model midas_small \
    --method grabcut \
    --threshold 0.2 \
    --blur 15
```

### Parameters

- `--input`: Input video file (required)
- `--output`: Output depth video file (required)
- `--model`: MiDaS model to use
  - `dpt_large`: Higher quality but slower
  - `midas_small`: Faster but lower quality (default)
- `--method`: Foreground segmentation method
  - `grabcut`: Best for static scenes (default)
  - `bgsubtract`: Best for videos with moving objects
  - `watershed`: Alternative approach
- `--threshold`: Threshold for foreground detection (0.0-1.0, default: 0.2)
  - Lower values include more as foreground
  - Higher values make foreground detection more strict
- `--blur`: Blur kernel size for smoothing (default: 15)
- `--no-smooth`: Disable depth map smoothing
- `--keep-temp`: Keep temporary files after processing

## Testing Different Methods

You can use the included test script to try different foreground segmentation methods:

```bash
python test_foreground_depth.py --input input_video.mp4
```

This will generate depth maps using all three segmentation methods and save them to the `output` directory.

## How It Works

1. **Frame Extraction**: The input video is split into individual frames
2. **Foreground Segmentation**: Each frame is processed to identify foreground objects
   - GrabCut uses color and texture information to separate foreground from background
   - Background Subtraction detects moving objects by comparing frames
   - Watershed uses image gradients to find object boundaries
3. **Depth Estimation**: MiDaS neural network generates a depth map for each frame
4. **Mask Application**: The foreground mask is applied to the depth map, zeroing out background areas
5. **Smoothing**: Optional smoothing is applied to the masked depth map
6. **Video Creation**: The processed depth maps are compiled into a video

## Tips for Best Results

- **For Static Scenes**: Use the `grabcut` method with a threshold around 0.2-0.3
- **For Moving Objects**: Use the `bgsubtract` method with a threshold around 0.1-0.2
- **For Complex Scenes**: Try all three methods and see which works best
- **Adjust Threshold**: Lower values (0.1-0.2) include more as foreground, higher values (0.3-0.5) are more selective
- **Smoothing**: Increase the blur value for smoother depth maps, or use `--no-smooth` for raw depth

## Troubleshooting

- **Poor Foreground Detection**: Try a different segmentation method or adjust the threshold
- **Missing Objects**: Lower the threshold to include more as foreground
- **Too Much Background**: Increase the threshold to be more selective
- **Slow Processing**: Use the `midas_small` model for faster processing
- **Out of Memory**: Process a shorter video or reduce the resolution
