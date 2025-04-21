#!/usr/bin/env python3
"""
API Server for Depth-to-3D Conversion

This server handles depth image uploads, converts them to 3D meshes,
and serves the resulting models for viewing in the browser.

Usage:
    python api.py
"""

import os
import sys
import io
import uuid
import tempfile
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, send_file
from PIL import Image
import numpy as np

# Import from our mesh_converter.py script
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from mesh_converter import convert_depth_to_mesh_open3d

# Initialize Flask app with static folder configuration
app = Flask(__name__, static_url_path='')
app.config['UPLOAD_FOLDER'] = 'uploaded_models'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Create required directories if they don't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('depth_images', exist_ok=True)

@app.route('/')
def index():
    """Serve the index.html file."""
    return send_file('index.html')

@app.route('/upload')
def upload_page():
    """Serve the upload.html file."""
    return send_file('upload.html')

@app.route('/styles.css')
def serve_css():
    """Serve the CSS file."""
    return send_file('styles.css')

@app.route('/script.js')
def serve_js():
    """Serve the JavaScript file."""
    return send_file('script.js')

@app.route('/api/convert-depth', methods=['POST'])
def convert_depth():
    """
    Convert uploaded depth image to 3D mesh.
    
    Expected POST form data:
    - depth_image: The depth image file
    - method (optional): 'open3d' or 'dtm' (default: 'open3d')
    
    Returns:
    JSON with model_url pointing to the generated model
    """
    # Check if depth_image is in the request
    if 'depth_image' not in request.files:
        return jsonify({'error': 'No depth_image in request'}), 400
    
    file = request.files['depth_image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Get conversion method - only use Open3D for now
    method = request.form.get('method', 'open3d')
    if method != 'open3d':
        return jsonify({'error': 'Only open3d method is supported in this version'}), 400
    
    try:
        # Save depth image with unique name
        unique_id = str(uuid.uuid4())
        depth_filename = 'depth_{}.png'.format(unique_id)
        depth_path = os.path.join('depth_images', depth_filename)
        
        # Save the uploaded image
        img = Image.open(file.stream)
        img.save(depth_path)
        
        # Generate 3D mesh filename
        mesh_filename = 'mesh_{}.ply'.format(unique_id)
        mesh_path = os.path.join(app.config['UPLOAD_FOLDER'], mesh_filename)
        
        # Convert depth to mesh
        convert_depth_to_mesh_open3d(depth_path, mesh_path)
        
        # Return the URL to access the model
        model_url = '/models/{}'.format(mesh_filename)
        viewer_url = '/index.html?model={}'.format(mesh_filename)
        
        return jsonify({
            'success': True,
            'model_url': model_url,
            'viewer_url': viewer_url,
            'model_id': unique_id
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/models/<filename>')
def serve_model(filename):
    """Serve a 3D model file."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/depth_images/<filename>')
def serve_depth_image(filename):
    """Serve a depth image file."""
    return send_from_directory('depth_images', filename)

if __name__ == '__main__':
    # Run the Flask app
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=True) 