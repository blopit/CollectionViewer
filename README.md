# 3D Photo Processing Pipeline

This repository contains tools for converting videos and images into 3D assets, including depth maps, meshes, and novel-view renderings. It leverages several state-of-the-art Python APIs for 3D processing.

## Features

- Extract frames from videos
- Generate depth maps using various methods (MiDaS, Facebook's one-shot, etc.)
- Create inpainted 3D content with occluded regions hallucinated
- Convert depth maps to 3D meshes
- Render novel views of 3D content
- Create videos with 3D effects

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/3d-photo-pipeline.git
   cd 3d-photo-pipeline
   ```

2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Optional: Install specialized dependencies based on your needs:

   - **PyTorch3D** (for differentiable rendering):
     Follow instructions at [PyTorch3D Installation](https://github.com/facebookresearch/pytorch3d/blob/main/INSTALL.md)

   - **NVIDIA Kaolin** (for advanced 3D operations):
     ```bash
     pip install kaolin==0.17.0 -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-${TORCH}_cu${CUDA}.html
     ```
     Replace `${TORCH}` and `${CUDA}` with your PyTorch and CUDA versions.

   - **3D-Photo-Inpainting** (for full 3D inpainting pipeline):
     ```bash
     git clone https://github.com/vt-vl-lab/3d-photo-inpainting.git
     cd 3d-photo-inpainting
     pip install -r requirements.txt
     ./download.sh
     ```

   - **One-Shot 3D Photography** (Facebook's depth estimation):
     ```bash
     git clone https://github.com/facebookresearch/one_shot_3d_photography.git
     cd one_shot_3d_photography
     pip install -r requirements.txt
     ```

## Usage

### Main Pipeline

The main pipeline processes videos or images into 3D assets:

```bash
python pipeline.py --input path/to/video.mp4 --output-dir output
```

This will:
1. Extract frames from the video
2. Generate depth maps for each frame
3. Create 3D meshes
4. Render novel views
5. Create a 3D video

For images, use:

```bash
python pipeline.py --input path/to/image.jpg --output-dir output
```

### Converting Depth Maps to Meshes

Use the depth-to-mesh example to convert depth maps to 3D meshes:

```bash
python depth_to_mesh_example.py --depth path/to/depth.png --color path/to/color.jpg --output path/to/output.ply
```

Options:
- `--depth-scale`: Scale factor to convert depth values to meters (default: 1000.0)
- `--depth-trunc`: Truncate depth values beyond this distance in meters (default: 3.0)
- `--focal-length`: Camera focal length (if not provided, estimated from image size)

## API Choices

This pipeline supports multiple APIs for depth estimation and 3D processing:

1. **3D-Photo-Inpainting** (vt-vl-lab): Full pipeline for inpainting depth maps and creating 3D content
2. **Open3D**: For mesh processing and visualization
3. **PyTorch3D**: For differentiable rendering
4. **Facebook's One-Shot 3D Photography**: For depth estimation and novel view synthesis
5. **Replicate API**: For hosted 3D-Photo-Inpainting service
6. **NVIDIA Kaolin**: For advanced 3D operations

Choose the appropriate API based on your needs:

```bash
python pipeline.py --input video.mp4 --method open3d
```

## Examples

Check the `examples` directory for sample videos, depth maps, and meshes.

## Limitations

- Depth estimation quality depends on the input image quality
- Inpainting may produce artifacts on complex scenes
- Processing large videos can be memory-intensive
- Some APIs require specific hardware (e.g., CUDA for PyTorch3D)

## References

- [VT-VL-Lab: 3D Photography using Context-aware Layered Depth Inpainting](https://github.com/vt-vl-lab/3d-photo-inpainting)
- [Facebook Research: One-Shot 3D Photography](https://github.com/facebookresearch/one_shot_3d_photography)
- [Open3D: A Modern Library for 3D Data Processing](http://www.open3d.org/)
- [PyTorch3D: A library for deep learning with 3D data](https://github.com/facebookresearch/pytorch3d)
- [NVIDIA Kaolin: A PyTorch Library for Accelerating 3D Deep Learning Research](https://github.com/NVIDIAGameWorks/kaolin) 