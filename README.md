# Collection Viewer

A web-based application for processing videos to generate depth maps and viewing them in an interactive interface. The project uses state-of-the-art depth estimation models to create high-quality depth maps from videos, with features for parallel processing and smooth visualization.

## Features

- Video depth map generation using advanced ML models
- Parallel processing for efficient video handling
- Interactive web viewer with depth map visualization
- Collection browser for managing multiple videos
- Real-time depth map smoothing and antialiasing
- Support for high-definition video processing

## Prerequisites

- Python 3.8 or higher
- Node.js and npm (for web development)
- CUDA-capable GPU (recommended for faster processing)
- FFmpeg for video processing

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/CollectionViewer.git
cd CollectionViewer
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

## Project Structure

- `gen_depth.py` - Main depth estimation script
- `gen_depth_hd.py` - High-definition depth estimation
- `process_random_video.py` - Parallel video processing script
- `scan_videos.py` - Video catalog generation
- `serve_videos.py` - Local video server
- `depth_processor.py` - Core depth processing utilities
- `collection.html` - Collection browser interface
- `index.html` - Main viewer interface
- `test-viewer.js` - Viewer functionality
- `test-random-video-api.js` - Random video API interface

## Usage

1. Start the video server:
```bash
python serve_videos.py
```

2. Process videos for depth estimation:
```bash
python process_random_video.py
```

3. Generate video catalog:
```bash
python scan_videos.py
```

4. Open the collection browser in your web browser:
```
http://localhost:8000/collection.html
```

## Development

The project uses a modular architecture:

- Python backend for video processing and depth estimation
- Web frontend for visualization and interaction
- FFmpeg for video frame extraction and manipulation
- WebGL for smooth depth map rendering

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the terms of the LICENSE file included in the repository.

## Acknowledgments

- MiDaS depth estimation model
- FFmpeg for video processing
- Three.js for 3D visualization 