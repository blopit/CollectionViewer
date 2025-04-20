# Foreground Segmentation for Depth Maps

This feature enhances the Collection Viewer by allowing you to isolate foreground objects in videos before generating depth maps. This results in cleaner, more focused 3D effects that only apply to the main subjects in your videos.

## How It Works

When you upload a video, you can now choose from several foreground segmentation methods:

1. **Background Subtraction** (default): Best for videos with moving objects against a relatively static background. The algorithm detects changes between frames to identify moving objects.

2. **GrabCut**: Best for static scenes with clear foreground/background separation. This algorithm uses color and texture information to separate foreground from background.

3. **Watershed**: An alternative approach that works well for certain types of scenes, especially those with distinct edges between objects.

4. **None**: Processes the entire frame without any foreground segmentation.

## Using Foreground Segmentation

1. Open the Collection Viewer application
2. In the control panel, find the "Video Input" section
3. Select a foreground segmentation method from the dropdown menu
4. Adjust the "Foreground Threshold" slider:
   - Lower values (0.05-0.2) include more as foreground
   - Higher values (0.3-0.5) are more selective
5. Upload your video
6. The application will process your video using the selected method
7. Once processing is complete, you can toggle "Show Foreground Only" in the Debug Options to see just the isolated foreground

## Tips for Best Results

- **For Videos with Moving Objects**: Use "Background Subtraction" with a threshold around 0.1-0.2
- **For Static Scenes**: Use "GrabCut" with a threshold around 0.2-0.3
- **For Complex Scenes**: Try all three methods and see which works best
- **Adjust Threshold**: If too much background is included, increase the threshold; if parts of the foreground are missing, decrease it
- **Combine with Depth Threshold**: Use the "Depth Threshold" slider to further refine which parts of the scene receive the 3D effect

## Technical Details

The foreground segmentation is performed using OpenCV:

- **Background Subtraction**: Uses `cv2.createBackgroundSubtractorMOG2` to detect moving objects
- **GrabCut**: Uses `cv2.grabCut` to segment based on color and texture
- **Watershed**: Uses `cv2.watershed` to segment based on image gradients

After segmentation, the depth map is generated only for the foreground areas, resulting in a cleaner 3D effect that focuses on the main subjects.

## Troubleshooting

- **Poor Foreground Detection**: Try a different segmentation method or adjust the threshold
- **Missing Objects**: Lower the threshold to include more as foreground
- **Too Much Background**: Increase the threshold to be more selective
- **Flickering**: Background Subtraction may cause flickering in some videos; try GrabCut instead
- **Slow Processing**: GrabCut is the slowest method; try Background Subtraction for faster results
