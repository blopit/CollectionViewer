#!/usr/bin/env python3
"""
Video Collection Scanner

Scans the videos directory for matching video and depth map pairs,
generates thumbnails, and creates a catalog JSON for the collection viewer.
"""

import os
import json
import cv2
from pathlib import Path
import logging
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s]: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class VideoCollectionScanner:
    def __init__(self, videos_dir="videos", thumbnails_dir="thumbnails"):
        self.videos_dir = Path(videos_dir)
        self.thumbnails_dir = Path(thumbnails_dir)
        self.thumbnails_dir.mkdir(exist_ok=True)

    def generate_thumbnail(self, video_path, output_path, size=(320, 180)):
        """Generate thumbnail from video first frame"""
        try:
            cap = cv2.VideoCapture(str(video_path))
            ret, frame = cap.read()
            if ret:
                # Resize frame
                thumbnail = cv2.resize(frame, size)
                # Save thumbnail
                cv2.imwrite(str(output_path), thumbnail)
                logger.info(f"Generated thumbnail: {output_path}")
                return True
            cap.release()
        except Exception as e:
            logger.error(f"Error generating thumbnail for {video_path}: {e}")
        return False

    def find_video_pairs(self):
        """Find matching video and depth map pairs"""
        pairs = []
        processed = set()

        # Recursively scan videos directory and all subdirectories
        for file in self.videos_dir.glob("**/*.mp4"):
            # Skip files in __pycache__ directories
            if "__pycache__" in str(file):
                continue

            if file.stem.endswith("_depth"):
                # This is a depth video, find its original
                original = file.parent / f"{file.stem[:-6]}.mp4"
                if original.exists() and str(original) not in processed:
                    pair = self.process_pair(original, file)
                    if pair:
                        pairs.append(pair)
                        processed.add(str(original))
            else:
                # This is an original video, find its depth map
                depth = file.parent / f"{file.stem}_depth.mp4"
                if depth.exists() and str(file) not in processed:
                    pair = self.process_pair(file, depth)
                    if pair:
                        pairs.append(pair)
                        processed.add(str(file))

        logger.info(f"Found {len(pairs)} video pairs")
        return pairs

    def process_pair(self, original_video, depth_video):
        """Process a video pair and generate metadata"""
        try:
            # Generate thumbnails
            thumb_path = self.thumbnails_dir / f"{original_video.stem}_thumb.jpg"
            if not thumb_path.exists():
                self.generate_thumbnail(original_video, thumb_path)

            # Get video metadata
            cap = cv2.VideoCapture(str(original_video))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = int(cap.get(cv2.CAP_PROP_FPS))
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = frame_count / fps if fps > 0 else 0
            cap.release()

            # Get relative paths for videos
            try:
                original_rel_path = original_video.relative_to(self.videos_dir)
            except ValueError:
                # If the path is not relative to videos_dir, use the full path
                original_rel_path = original_video

            try:
                depth_rel_path = depth_video.relative_to(self.videos_dir)
            except ValueError:
                # If the path is not relative to videos_dir, use the full path
                depth_rel_path = depth_video

            # Create metadata
            return {
                "id": original_video.stem,
                "original_video": str(original_rel_path),
                "depth_video": str(depth_rel_path),
                "thumbnail": str(thumb_path.name),  # Just use the filename
                "width": width,
                "height": height,
                "fps": fps,
                "duration": duration,
                "frame_count": frame_count,
                "created": datetime.fromtimestamp(original_video.stat().st_ctime).isoformat()
            }

        except Exception as e:
            logger.error(f"Error processing video pair {original_video.name}: {e}")
            return None

    def create_catalog(self):
        """Create catalog JSON with all video pairs"""
        pairs = self.find_video_pairs()
        catalog = {
            "updated": datetime.now().isoformat(),
            "video_count": len(pairs),
            "videos": pairs
        }

        # Save catalog
        catalog_path = self.videos_dir / "catalog.json"
        with open(catalog_path, "w") as f:
            json.dump(catalog, f, indent=2)

        logger.info(f"Created catalog with {len(pairs)} video pairs")
        return catalog_path

def main():
    scanner = VideoCollectionScanner()
    catalog_path = scanner.create_catalog()
    logger.info(f"Catalog saved to: {catalog_path}")

if __name__ == "__main__":
    main()