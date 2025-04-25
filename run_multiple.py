#!/usr/bin/env python3

import subprocess
import logging
import time
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s]: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('batch_processing.log')
    ]
)
logger = logging.getLogger(__name__)

def run_processor(iteration):
    """Run a single iteration of the video processor"""
    start_time = time.time()
    logger.info(f"\n=== Starting iteration {iteration}/10 ===")
    logger.info(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        result = subprocess.run(
            ['python3', 'test_agent.py'],
            capture_output=True,
            text=True,
            check=True
        )
        logger.info(f"Output:\n{result.stdout}")
        if result.stderr:
            logger.warning(f"Stderr:\n{result.stderr}")
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Process failed with exit code {e.returncode}")
        logger.error(f"Error output:\n{e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Error running iteration {iteration}: {str(e)}")
        return False
        
    duration = time.time() - start_time
    logger.info(f"Iteration {iteration} completed in {duration:.2f} seconds")
    return True

def main():
    logger.info("Starting batch processing of 10 videos")
    start_time = time.time()
    
    successful = 0
    failed = 0
    
    for i in range(1, 11):
        if run_processor(i):
            successful += 1
        else:
            failed += 1
        
        # Small delay between iterations
        if i < 10:
            time.sleep(2)
    
    total_time = time.time() - start_time
    logger.info("\n=== Batch Processing Complete ===")
    logger.info(f"Total time: {total_time:.2f} seconds")
    logger.info(f"Successful: {successful}")
    logger.info(f"Failed: {failed}")

if __name__ == "__main__":
    main() 