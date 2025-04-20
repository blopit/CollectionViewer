#!/usr/bin/env python3
"""
Test script for the enhanced gen_depth.py with foreground segmentation.

This script demonstrates how to use the gen_depth.py script
with different foreground segmentation methods.

Usage:
    python test_gen_depth.py --input <input_video>
"""

import os
import argparse
import subprocess
import time

def main():
    parser = argparse.ArgumentParser(description="Test foreground-focused depth map generation")
    parser.add_argument("--input", required=True, help="Input video file")
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs("output", exist_ok=True)
    
    # Base filename without extension
    base_name = os.path.splitext(os.path.basename(args.input))[0]
    
    # Test different foreground segmentation methods
    methods = ["bgsubtract", "grabcut", "watershed", "none"]
    
    for method in methods:
        print(f"\n=== Testing {method.upper()} method ===")
        
        output_file = f"output/{base_name}_{method}_depth.mp4"
        
        # Run foreground depth generation
        cmd = [
            "python", "gen_depth.py",
            "--input", args.input,
            "--output", output_file,
            "--foreground-method", method,
            "--threshold", "0.2",
            "--blur", "15",
            "--keep-temp"  # Keep temp files for inspection
        ]
        
        print(f"Running: {' '.join(cmd)}")
        start_time = time.time()
        
        try:
            subprocess.run(cmd, check=True)
            elapsed = time.time() - start_time
            print(f"✅ {method} completed in {elapsed:.2f} seconds")
            print(f"Output saved to: {output_file}")
        except subprocess.CalledProcessError as e:
            print(f"❌ {method} failed: {e}")
    
    print("\n=== All tests completed ===")
    print("Check the 'output' directory for results")

if __name__ == "__main__":
    main()
