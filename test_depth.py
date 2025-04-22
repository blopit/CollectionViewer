import os
import argparse
import sys
from gen_depth import main as gen_depth_main

def parse_args():
    parser = argparse.ArgumentParser(description='Test Depth Anything V2 implementation')
    parser.add_argument('--input', '-i', type=str, required=True,
                       help='Path to input video file')
    parser.add_argument('--model', '-m', type=str, default='dav2-small',
                       choices=['dav2-small', 'dav2-base', 'dav2-large'],
                       help='Model size to use (default: dav2-small)')
    return parser.parse_args()

def main():
    args = parse_args()
    
    # Create output directory if it doesn't exist
    os.makedirs('output', exist_ok=True)
    
    # Set up paths
    output_path = os.path.join('output', f'depth_{os.path.basename(args.input)}')
    status_path = os.path.join('output', 'status.json')
    
    # Set up system arguments for gen_depth
    sys.argv = [
        'gen_depth.py',
        '--input', args.input,
        '--output', output_path,
        '--model', args.model,
        '--status-file', status_path
    ]
    
    print(f"🎥 Processing video: {args.input}")
    print(f"🤖 Using model: {args.model}")
    print(f"💾 Output will be saved to: {output_path}")
    print("\nStarting depth map generation...")
    
    try:
        gen_depth_main()  # Call without arguments since it will use sys.argv
        print("\n✨ Depth map generation completed successfully!")
        print(f"📁 Output saved to: {output_path}")
    except Exception as e:
        print(f"\n❌ Error during depth map generation: {str(e)}")

if __name__ == "__main__":
    main() 