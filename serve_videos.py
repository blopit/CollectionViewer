#!/usr/bin/env python3
"""
Simple HTTP server to serve static files with CORS support
"""

import http.server
import socketserver
import os
from pathlib import Path

# Configuration
PORT = 5678
DIRECTORY = "."  # Serve current directory

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        # Handle OPTIONS request for CORS preflight
        self.send_response(200)
        self.end_headers()

def main():
    # Start server
    with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        print("You can access:")
        print(f"- HTML page: http://localhost:{PORT}/test.html")
        print(f"- Videos directory: http://localhost:{PORT}/videos/")
        print(f"Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()

if __name__ == "__main__":
    main() 