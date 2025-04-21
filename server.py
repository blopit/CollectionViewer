#!/usr/bin/env python3
"""
Simple HTTP server for handling depth map and normal map generation requests.
This server accepts video uploads and returns depth map and normal map videos.

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
DEPTH_DIR = os.path.join(VIDEOS_DIR, "depth")
NORMAL_DIR = os.path.join(VIDEOS_DIR, "normal")
ORIGINAL_DIR = os.path.join(VIDEOS_DIR, "original")
CACHE_DIR = "cache"
SCREENSHOTS_DIR = os.path.join(VIDEOS_DIR, "screenshots")

# Ensure all directories exist
for directory in [UPLOAD_DIR, VIDEOS_DIR, DEPTH_DIR, NORMAL_DIR, ORIGINAL_DIR, CACHE_DIR, SCREENSHOTS_DIR]:
    os.makedirs(directory, exist_ok=True)

# Initialize mimetypes
mimetypes.init()

def save_video_from_base64(base64_data, output_path):
    """Save base64 video data to a file"""
    try:
        # Remove data URI header if present
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]
        
        # Decode and save
        video_data = base64.b64decode(base64_data)
        with open(output_path, 'wb') as f:
            f.write(video_data)
        return True
    except Exception as e:
        print(f"Error saving video: {e}")
        return False

class VideoHandler(BaseHTTPRequestHandler):
    def serve_static_file(self, file_path):
        """Serve a static file"""
        try:
            # Get the file extension and mime type
            ext = os.path.splitext(file_path)[1]
            mime_type = mimetypes.types_map.get(ext, 'application/octet-stream')
            
            with open(file_path, 'rb') as f:
                content = f.read()
                
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return True
        except Exception as e:
            print(f"Error serving static file: {e}")
            return False

    def do_POST(self):
        """Handle POST requests for video upload and processing"""
        if self.path == '/upload':
            try:
                # Read and parse JSON data
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))
                
                # Generate unique ID
                job_id = str(uuid.uuid4())
                
                # Setup paths
                original_path = os.path.join(ORIGINAL_DIR, f"{job_id}.mp4")
                depth_path = os.path.join(DEPTH_DIR, f"{job_id}.mp4")
                status_file = os.path.join(UPLOAD_DIR, f"{job_id}.status")
                
                # Save original video
                if not save_video_from_base64(data['video'], original_path):
                    raise Exception("Failed to save video file")
                
                # Create initial status
                initial_status = {
                    "status": "processing",
                    "stage": "starting",
                    "message": "Starting video processing...",
                    "progress": 0,
                    "total": 100
                }
                with open(status_file, 'w') as f:
                    json.dump(initial_status, f)
                
                # Start processing
                cmd = [
                    'python3', 'gen_depth.py',
                    '--input', original_path,
                    '--output', depth_path,
                    '--status-file', status_file
                ]
                
                # Add optional parameters
                if 'model' in data:
                    cmd.extend(['--model', data['model']])
                if 'foreground_method' in data:
                    cmd.extend(['--foreground-method', data['foreground_method']])
                if 'threshold' in data:
                    cmd.extend(['--threshold', str(data['threshold'])])
                
                # Start processing in background
                subprocess.Popen(cmd)
                
                # Return success response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'job_id': job_id,
                    'message': 'Processing started'
                }).encode())
                return
                
            except Exception as e:
                print(f"Error processing upload: {e}")
                self.send_error(500, str(e))
                return

        self.send_error(404, "Path not found")

    def do_GET(self):
        """Handle GET requests"""
        # Serve index.html for root path
        if self.path == '/' or self.path == '':
            if self.serve_static_file('index.html'):
                return
                
        # Serve static files
        if self.path.endswith(('.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.gif')):
            file_path = self.path.lstrip('/')
            if os.path.exists(file_path) and self.serve_static_file(file_path):
                return
                
        # Handle status check
        if self.path.startswith('/status/'):
            job_id = self.path.split('/')[-1]
            status_file = os.path.join(UPLOAD_DIR, f"{job_id}.status")
            
            if os.path.exists(status_file):
                try:
                    with open(status_file, 'r') as f:
                        status = json.load(f)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(status).encode())
                    return
                except Exception as e:
                    print(f"Error reading status file: {e}")
                    self.send_error(500, f"Error reading status: {str(e)}")
                    return
            else:
                self.send_error(404, "Status not found")
                return
                
        # Serve video files
        elif self.path.startswith('/videos/'):
            video_path = os.path.join('.', self.path.lstrip('/'))
            if os.path.exists(video_path):
                try:
                    self.send_response(200)
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Length', str(os.path.getsize(video_path)))
                    self.end_headers()
                    with open(video_path, 'rb') as f:
                        shutil.copyfileobj(f, self.wfile)
                    return
                except Exception as e:
                    print(f"Error serving video: {e}")
                    self.send_error(500, f"Error serving video: {str(e)}")
                    return
                
        # List available videos
        elif self.path == '/api/videos':
            try:
                videos = []
                # Look for video sets in the directories
                for filename in os.listdir(ORIGINAL_DIR):
                    if filename.endswith('.mp4'):
                        video_id = os.path.splitext(filename)[0]
                        original_path = os.path.join(ORIGINAL_DIR, filename)
                        depth_path = os.path.join(DEPTH_DIR, filename)
                        normal_path = os.path.join(NORMAL_DIR, filename)
                        
                        if os.path.exists(original_path):
                            video_stat = os.stat(original_path)
                            video_info = {
                                'name': filename,
                                'url': f'/videos/original/{filename}',
                                'size': video_stat.st_size,
                                'timestamp': video_stat.st_mtime
                            }
                            
                            # Add depth/normal paths if they exist
                            if os.path.exists(depth_path):
                                video_info['depth_url'] = f'/videos/depth/{filename}'
                            if os.path.exists(normal_path):
                                video_info['normal_url'] = f'/videos/normal/{filename}'
                                
                            videos.append(video_info)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'videos': videos}).encode())
                return
            except Exception as e:
                print(f"Error listing videos: {e}")
                self.send_error(500, f"Error listing videos: {str(e)}")
                return
                
        self.send_error(404, "Path not found")

def run_server():
    """Start the HTTP server"""
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, VideoHandler)
    print(f"Server running on port {PORT}")
    httpd.serve_forever()

if __name__ == '__main__':
    run_server()
