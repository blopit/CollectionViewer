#!/usr/bin/env python3
"""
Simple HTTP Server for serving static files
"""

import http.server
import socketserver
import os
from urllib.parse import urlparse, parse_qs

# Configure the server
PORT = 9000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class SimpleHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests."""
        # Parse URL and query parameters
        parsed_url = urlparse(self.path)
        
        # Set directory to serve files from
        self.directory = DIRECTORY
        
        # Default to index.html for root
        if parsed_url.path == '/':
            self.path = '/index.html'
        
        # Handle upload page
        if parsed_url.path == '/upload':
            self.path = '/upload.html'
            
        # Handle standard requests
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

# Set up and start the server
handler = SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    print(f"Serving from directory: {DIRECTORY}")
    httpd.serve_forever() 