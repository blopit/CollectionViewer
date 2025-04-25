#!/usr/bin/env python3
"""
Test script for parallel random video processing using Depth Anything V2 Small
Limited to 10 frames per video for testing
"""

from process_random_video import RandomVideoProcessor
import logging
import sys
import time
import concurrent.futures
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(processName)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('depth_processing.log')
    ]
)
logger = logging.getLogger(__name__)

def process_random_videos(num_videos=2):
    """Process multiple random videos in parallel"""
    try:
        logger.info(f"\nStarting parallel processing of {num_videos} random videos...")
        
        # Create processors for each video
        processors = []
        for i in range(num_videos):
            processor = RandomVideoProcessor(output_dir=f"videos/test_{i}")
            processors.append(processor)
        
        # Process videos in parallel using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_videos) as executor:
            # Submit tasks
            futures = []
            for i, processor in enumerate(processors):
                future = executor.submit(processor.process_random_video)
                futures.append((i, future))
            
            # Wait for results
            results = []
            for i, future in futures:
                try:
                    result = future.result()
                    results.append((i, result))
                    logger.info(f"\nVideo {i} processing completed:")
                    if result['status'] == 'success':
                        logger.info(f"- Input: {result['input_video']}")
                        logger.info(f"- Output: {result['depth_video']}")
                        logger.info(f"- Processing time: {result['processing_time']:.2f}s")
                    else:
                        logger.error(f"- Error: {result['error']}")
                except Exception as e:
                    logger.error(f"Error processing video {i}: {str(e)}")
                    results.append((i, {'status': 'error', 'error': str(e)}))
        
        return results
        
    except Exception as e:
        logger.error(f"Error during parallel processing: {str(e)}")
        raise

def main():
    try:
        # Process 2 random videos in parallel
        start_time = time.time()
        results = process_random_videos(num_videos=2)
        
        # Print summary
        logger.info("\n=== Processing Summary ===")
        successful = sum(1 for _, r in results if r['status'] == 'success')
        failed = sum(1 for _, r in results if r['status'] == 'error')
        total_time = time.time() - start_time
        
        logger.info(f"Total videos processed: {len(results)}")
        logger.info(f"Successful: {successful}")
        logger.info(f"Failed: {failed}")
        logger.info(f"Total time: {total_time:.2f}s")
        
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
    except Exception as e:
        logger.error(f"Error in main: {str(e)}")

if __name__ == "__main__":
    main() 