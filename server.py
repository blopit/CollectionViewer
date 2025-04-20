#!/usr/bin/env python3
"""
Simple HTTP server for handling depth map generation requests.
This server accepts video uploads and returns depth map videos.

Usage:
    python server.py

The server will listen on port 8000 by default.
"""

import os
import sys
import json
import uuid
import base64
import subprocess
import mimetypes
import hashlib
import shutil
import time
from PIL import Image
from io import BytesIO
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Configuration
PORT = 8000
UPLOAD_DIR = "uploads"
VIDEOS_DIR = "videos"
CACHE_DIR = "cache"
SCREENSHOTS_DIR = os.path.join(VIDEOS_DIR, "depth", "screenshots")

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

# Initialize mimetypes
mimetypes.init()

def get_video_hash(video_data):
    """Generate a hash for the video data"""
    return hashlib.sha256(video_data).hexdigest()

def get_cached_video(video_hash, model_type, foreground_method, threshold):
    """Check if a processed video exists in cache"""
    cache_key = f"{video_hash}_{model_type}_{foreground_method}_{threshold}"
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.mp4")
    if os.path.exists(cache_file):
        return cache_file
    return None

def generate_thumbnail(video_path, output_path, timestamp=0):
    """Generate a thumbnail from a video at the specified timestamp"""
    try:
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-ss', str(timestamp),
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-y',
            output_path
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error generating thumbnail: {e}")
        return False

def organize_video_files():
    """Organize video files into a proper structure"""
    videos_dir = os.path.join(VIDEOS_DIR, "depth")
    for filename in os.listdir(videos_dir):
        if not filename.endswith('.mp4'):
            continue
            
        filepath = os.path.join(videos_dir, filename)
        if os.path.isfile(filepath):
            # Generate thumbnail if it doesn't exist
            thumbnail_name = f"{os.path.splitext(filename)[0]}_thumb.jpg"
            thumbnail_path = os.path.join(SCREENSHOTS_DIR, thumbnail_name)
            
            if not os.path.exists(thumbnail_path):
                generate_thumbnail(filepath, thumbnail_path)

class DepthMapHandler(BaseHTTPRequestHandler):
    def _set_headers(self, content_type="application/json"):
        self.send_response(200)
        self.send_header("Content-type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def serve_file(self, file_path, content_type=None):
        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            if content_type is None:
                content_type, _ = mimetypes.guess_type(file_path)
                if content_type is None:
                    content_type = 'application/octet-stream'

            self._set_headers(content_type)
            self.wfile.write(content)
            return True
        except Exception as e:
            print(f"Error serving file {file_path}: {str(e)}")
            return False

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        # List processed videos endpoint
        if self.path == "/list-processed-videos":
            try:
                videos = []
                videos_dir = os.path.join('videos', 'depth')
                
                # Organize videos first
                organize_video_files()
                
                # Check if videos directory exists
                if os.path.exists(videos_dir):
                    # Get all video files
                    for filename in os.listdir(videos_dir):
                        if filename.endswith('.mp4'):
                            video_path = os.path.join(videos_dir, filename)
                            stat = os.stat(video_path)
                            
                            # Check for thumbnail
                            thumbnail_name = f"{os.path.splitext(filename)[0]}_thumb.jpg"
                            thumbnail_path = os.path.join(SCREENSHOTS_DIR, thumbnail_name)
                            has_thumbnail = os.path.exists(thumbnail_path)
                            
                            # Create video entry
                            video = {
                                'name': filename,
                                'url': f'/videos/depth/{filename}',
                                'size': stat.st_size,
                                'timestamp': stat.st_mtime,
                                'is_depth': filename.startswith('depth_'),
                                'thumbnail_url': f'/videos/depth/screenshots/{thumbnail_name}' if has_thumbnail else None
                            }
                            videos.append(video)
                
                # Sort videos by timestamp, newest first
                videos.sort(key=lambda x: x['timestamp'], reverse=True)
                
                print(f"Found {len(videos)} videos in {videos_dir}")
                
                self._set_headers()
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'videos': videos
                }).encode())
                return
            except Exception as e:
                print(f"Error listing videos: {str(e)}")
                self._set_headers()
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': str(e)
                }).encode())
                return

        # Serve index.html for root path
        if self.path == "/" or self.path == "/index.html":
            if not self.serve_file("index.html", "text/html"):
                self.send_response(404)
                self.end_headers()
            return

        # Handle status check requests
        if self.path.startswith("/status/"):
            job_id = self.path.split("/")[-1]
            status_file = os.path.join(UPLOAD_DIR, f"{job_id}.status")
            log_file = os.path.join(UPLOAD_DIR, f"{job_id}.log")

            if os.path.exists(status_file):
                try:
                    # Read status file
                    with open(status_file, "r") as f:
                        try:
                            status_data = json.loads(f.read().strip())
                        except json.JSONDecodeError:
                            # Handle old format status files
                            status_data = {
                                "status": "processing",
                                "stage": "processing",
                                "progress": 50,
                                "total": 100,
                                "message": "Processing video..."
                            }
                    
                    # Add log information if available
                    if os.path.exists(log_file):
                        try:
                            with open(log_file, "r") as f:
                                log_lines = f.readlines()
                                if log_lines:
                                    status_data["log"] = log_lines[-1].strip()
                        except Exception as e:
                            print(f"Error reading log file: {str(e)}")

                    # If completed, add video URL
                    if status_data.get("status") == "completed":
                        depth_video = os.path.join(VIDEOS_DIR, f"{job_id}_depth.mp4")
                        if os.path.exists(depth_video):
                            status_data["depth_video_url"] = f"/videos/{job_id}_depth.mp4"

                    self._set_headers()
                    self.wfile.write(json.dumps(status_data).encode())
                except Exception as e:
                    print(f"Error reading status: {str(e)}")
                    self._set_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": str(e)
                    }).encode())
            else:
                self._set_headers()
                self.wfile.write(json.dumps({"error": "Job not found"}).encode())
            return

        # Serve static files (including screenshots)
        if self.path.startswith("/videos/"):
            file_path = self.path[1:]  # Remove leading slash
            if os.path.exists(file_path) and os.path.isfile(file_path):
                content_type = mimetypes.guess_type(file_path)[0]
                if not self.serve_file(file_path, content_type):
                    self.send_response(404)
                    self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()
            return

        # Serve other static files (CSS, JS)
        if self.path.startswith("/css/") or self.path.startswith("/js/"):
            file_path = self.path[1:]  # Remove leading slash
            if os.path.exists(file_path) and os.path.isfile(file_path):
                if not self.serve_file(file_path):
                    self.send_response(404)
                    self.end_headers()
            else:
                self.send_response(404)
                self.end_headers()
            return

        # Default response
        self._set_headers()
        self.wfile.write(json.dumps({"status": "Depth Map Generator Server is running"}).encode())

    def do_POST(self):
        if self.path == "/generate-depth":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            # Generate a unique ID for this job
            job_id = str(uuid.uuid4())

            # Decode video data
            video_data = base64.b64decode(data['video'].split(',')[1])
            
            # Check cache first
            video_hash = get_video_hash(video_data)
            model_type = data.get('model', 'small')
            foreground_method = data.get('foreground_method', 'bgsubtract')
            threshold = data.get('threshold', '0.2')
            
            cached_video = get_cached_video(video_hash, model_type, foreground_method, threshold)
            
            if cached_video:
                print(f"Cache hit! Using cached video: {cached_video}")
                # Copy cached video to output
                output_path = os.path.join(VIDEOS_DIR, f"{job_id}_depth.mp4")
                shutil.copy2(cached_video, output_path)
                
                # Return immediate completion
                self._set_headers()
                self.wfile.write(json.dumps({
                    "job_id": job_id,
                    "status": "completed",
                    "depth_video_url": f"/videos/{job_id}_depth.mp4"
                }).encode())
                return

            # No cache hit, process normally
            input_path = os.path.join(UPLOAD_DIR, f"{job_id}.mp4")
            output_path = os.path.join(VIDEOS_DIR, f"{job_id}_depth.mp4")

            with open(input_path, "wb") as f:
                f.write(video_data)

            # Create status file
            status_data = {
                "status": "processing",
                "stage": "initializing",
                "progress": 0,
                "total": 100,
                "message": "Starting video processing..."
            }
            with open(os.path.join(UPLOAD_DIR, f"{job_id}.status"), "w") as f:
                json.dump(status_data, f)

            # Start depth map generation in a separate process
            cache_key = f"{video_hash}_{model_type}_{foreground_method}_{threshold}"
            cache_output = os.path.join(CACHE_DIR, f"{cache_key}.mp4")

            cmd = [
                sys.executable,
                "gen_depth.py",
                "--input", input_path,
                "--output", cache_output,  # Output to cache first
                "--model", model_type,
                "--foreground-method", foreground_method,
                "--threshold", threshold,
                "--status-file", os.path.join(UPLOAD_DIR, f"{job_id}.status")
            ]

            def on_complete():
                """Callback when processing completes"""
                if os.path.exists(cache_output):
                    # Copy from cache to output
                    shutil.copy2(cache_output, output_path)

            # Run the process in the background
            process = subprocess.Popen(
                cmd,
                stdout=open(os.path.join(UPLOAD_DIR, f"{job_id}.log"), "w"),
                stderr=subprocess.STDOUT,
                bufsize=1,  # Line buffered
                universal_newlines=True  # Text mode
            )

            # Return the job ID to the client
            self._set_headers()
            self.wfile.write(json.dumps({
                "job_id": job_id,
                "status": "processing"
            }).encode())

        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, DepthMapHandler)
    print(f"Starting depth map generator server on port {PORT}...")
    print(f"Open http://localhost:{PORT} in your browser")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
