# 3D Collection Viewer

A dynamic 3D trading card effect that uses AI-generated depth maps from videos, controlled by device accelerometer and touch interactions. This application creates an immersive 3D effect from regular videos by using depth estimation AI.

## Features

- Convert videos to depth-aware 3D trading cards
- Interactive tilting with device accelerometer or mouse movement
- Touch-based interaction with elastic animation
- Custom WebGL shaders for parallax and 3D effects
- Adjustable effect parameters through an intuitive UI
- Works on both mobile and desktop browsers

## Project Structure

```
├── css/                  # CSS styles
│   └── styles.css        # Main stylesheet
├── js/                   # JavaScript files
│   ├── app.js            # Main application code
│   └── lib/              # External libraries
├── videos/               # Video files directory
│   ├── video.mp4         # Source video
│   └── depth_video.mp4   # Generated depth map video
├── gen_depth.py          # Python script for depth map generation
├── index.html            # Main application HTML
└── requirements.txt      # Python dependencies
```

## Setup

### 1. Generate Depth Maps

First, generate a depth map video from your original video:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Generate depth map (make sure your video is in the videos/ directory)
python gen_depth.py
```

> Note: This process requires PyTorch and ffmpeg to be installed on your system.

### 2. Run the Web Application

You can run the application using any HTTP server. For example:

```bash
# Using Python
python -m http.server

# Using Node.js
npx serve
```

Then open your browser to:
```
http://localhost:8000
```

For mobile devices, use your computer's IP address instead of localhost.

## Requirements

### For Depth Map Generation
- Python 3.6+
- PyTorch
- OpenCV
- ffmpeg

### For Web Application
- Modern browser with WebGL support
- Device with accelerometer (for mobile tilt functionality)

## How It Works

1. **Depth Map Generation**: The Python script uses MiDaS (a neural network for monocular depth estimation) to generate depth maps from video frames. These depth maps represent the distance of objects from the camera.

2. **3D Rendering**: The web application uses Three.js with custom WebGL shaders to create the 3D effect. The depth map is used to displace vertices in the z-direction, creating a parallax effect.

3. **Interactive Controls**: The card responds to device orientation (accelerometer) on mobile or mouse movement on desktop. The application uses GSAP for smooth animations.

4. **Customizable Effects**: The UI allows adjusting various parameters:
   - Effect Strength: Controls the intensity of the 3D effect
   - Shine Strength: Adjusts the reflective highlights
   - Depth Contrast: Changes the contrast of the depth map
   - Depth Smoothing: Applies smoothing to the depth map

## Troubleshooting

- **Videos not playing**: Make sure your videos are properly encoded and in a web-compatible format (MP4 with H.264 codec is recommended).
- **Depth effect not working**: Check that both the original video and depth video are properly generated and accessible.
- **Performance issues**: Reduce the video resolution or adjust the effect parameters for better performance on lower-end devices.

## License

See the [LICENSE](LICENSE) file for details.
