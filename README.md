# 3D Collection Viewer

A web-based application for creating 3D effect videos from standard 2D content using depth map generation.

## Features

- Automatic depth map generation from videos
- Multiple depth model options
- 3D effect visualization
- Adjustable effect parameters
- Video gallery

## Depth Models

The application now supports the following depth estimation models:

1. **MiDaS Small** - Fast processing, good for most cases
2. **MiDaS Large** - Better quality but slower processing
3. **Depth Anything V2 Small** - Improved quality with reasonable speed
4. **Depth Anything V2 Base** - Better quality than Small, moderate processing time
5. **Depth Anything V2 Large** - Highest quality, but slower processing

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/CollectionViewer.git
   cd CollectionViewer
   ```

2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the server:
   ```
   python server.py
   ```

4. Open your browser at `http://localhost:8000`

## Requirements

- Python 3.7+
- PyTorch
- OpenCV
- FFmpeg (for video processing)
- Transformers (for Depth Anything V2 models)

## Using Depth Anything V2

The Depth Anything V2 models provide superior depth estimation quality compared to the MiDaS models. To use these models:

1. Upload a video through the web interface
2. Select one of the Depth Anything V2 models from the dropdown menu
3. Wait for the depth map generation to complete

Note that the first time you use a Depth Anything V2 model, it will download the model weights which might take some time depending on your internet connection.

## Credits

- Depth estimation powered by MiDaS and Depth Anything V2
- 3D effect rendering using WebGL
