import torch
import cv2
import numpy as np
from pathlib import Path
import logging
import time
import gc
import sys
from tqdm import tqdm
import concurrent.futures

# Add Video-Depth-Anything to Python path
video_depth_path = Path("Video-Depth-Anything")
sys.path.append(str(video_depth_path))

from video_depth_anything.video_depth import VideoDepthAnything
from depth_anything.util.transform import Resize, NormalizeImage, PrepareForNet

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DepthProcessor:
    def __init__(self, model_type="large", device="cuda" if torch.cuda.is_available() else "cpu", fp16=True):
        self.device = device
        self.fp16 = fp16
        logger.info(f"Using device: {self.device}, FP16: {self.fp16}")
        
        # Initialize Video Depth Anything model
        self.model = VideoDepthAnything(encoder=f'vit{model_type[0]}')  # vitl for large, vits for small
        self.model.to(self.device)
        self.model.eval()
        
    def process_video(self, input_path, output_path, input_size=518, max_res=1280, target_fps=None, 
                     max_len=None, save_grayscale=True, save_npz=False, save_exr=False):
        """Process a video file and generate depth map video using temporal information"""
        input_path = Path(input_path)
        output_path = Path(output_path)
        output_dir = output_path.parent
        
        if not input_path.exists():
            raise FileNotFoundError(f"Input video not found: {input_path}")
            
        # Create output directory
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Read video
        cap = cv2.VideoCapture(str(input_path))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Set target FPS
        fps = target_fps if target_fps and target_fps > 0 else orig_fps
        
        # Limit number of frames if max_len specified
        if max_len and max_len > 0:
            total_frames = min(total_frames, max_len * fps)
        
        # Read all frames
        frames = []
        with tqdm(total=total_frames, desc="Reading frames") as pbar:
            frame_count = 0
            while frame_count < total_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                frames.append(frame)
                frame_count += 1
                pbar.update(1)
        
        cap.release()
        frames = np.stack(frames, axis=0)
        
        # Process frames using temporal model
        logger.info("Processing frames with temporal model...")
        with torch.cuda.amp.autocast(enabled=self.fp16):
            depth_frames, _ = self.model.infer_video_depth(
                frames, 
                target_fps=fps,
                input_size=input_size,
                max_res=max_res,
                device=self.device
            )
        
        # Save outputs
        if save_grayscale:
            # Normalize and convert to uint8
            depth_frames_gray = (depth_frames - depth_frames.min()) / (depth_frames.max() - depth_frames.min()) * 255
            depth_frames_gray = depth_frames_gray.astype(np.uint8)
            
            # Save grayscale video
            out = cv2.VideoWriter(
                str(output_path),
                cv2.VideoWriter_fourcc(*'mp4v'),
                fps,
                (width, height),
                False
            )
            
            try:
                for frame in depth_frames_gray:
                    out.write(frame)
            finally:
                out.release()
        
        # Save NPZ if requested
        if save_npz:
            npz_path = output_dir / f"{output_path.stem}.npz"
            np.savez_compressed(str(npz_path), depth=depth_frames)
            
        # Save EXR if requested
        if save_exr:
            import OpenEXR
            import Imath
            
            exr_path = output_dir / f"{output_path.stem}.exr"
            header = OpenEXR.Header(width, height)
            header['channels'] = {'Y': Imath.Channel(Imath.PixelType(Imath.PixelType.FLOAT))}
            
            exr = OpenEXR.OutputFile(str(exr_path), header)
            data = depth_frames.astype(np.float32).tobytes()
            exr.writePixels({'Y': data})
            exr.close()
            
        # Clean up
        del frames
        del depth_frames
        if save_grayscale:
            del depth_frames_gray
        gc.collect()
        torch.cuda.empty_cache()
            
        return str(output_path)

class VideoProcessor:
    def __init__(self, max_workers=2, **kwargs):
        self.depth_processor = DepthProcessor(**kwargs)
        self.max_workers = max_workers
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        
    def process_videos(self, video_paths, **kwargs):
        """Process multiple videos in parallel"""
        futures = []
        results = []
        
        for video_path in video_paths:
            input_path = Path(video_path)
            output_path = input_path.parent / f"{input_path.stem}_depth{input_path.suffix}"
            
            future = self.executor.submit(
                self.depth_processor.process_video,
                input_path,
                output_path,
                **kwargs
            )
            futures.append((video_path, future))
        
        # Wait for all tasks to complete
        for video_path, future in futures:
            try:
                output_path = future.result()
                results.append({
                    'input': video_path,
                    'output': output_path,
                    'status': 'success'
                })
            except Exception as e:
                logger.error(f"Error processing {video_path}: {str(e)}")
                results.append({
                    'input': video_path,
                    'output': None,
                    'status': 'failed',
                    'error': str(e)
                })
                
        return results

def main():
    # Example usage
    processor = VideoProcessor(
        max_workers=2,  # Process 2 videos in parallel
        model_type="large",  # Use large model
        fp16=True  # Use FP16 for faster inference
    )
    
    # List of videos to process
    videos = [
        "video.mp4",
        # Add more video paths as needed
    ]
    
    logger.info("Starting video processing...")
    start_time = time.time()
    
    results = processor.process_videos(
        videos,
        input_size=518,  # Default input size
        max_res=1280,  # Maximum resolution
        save_grayscale=True,  # Save grayscale depth map
        save_npz=False,  # Don't save NPZ
        save_exr=False  # Don't save EXR
    )
    
    # Print results
    logger.info("\nProcessing Results:")
    for result in results:
        if result['status'] == 'success':
            logger.info(f"Successfully processed {result['input']} -> {result['output']}")
        else:
            logger.error(f"Failed to process {result['input']}: {result['error']}")
            
    total_time = time.time() - start_time
    logger.info(f"\nTotal processing time: {total_time:.2f} seconds")

if __name__ == "__main__":
    main() 