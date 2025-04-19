# Files to Remove

The following files are unnecessary or duplicate and can be safely removed:

## HTML Files
- `simple.html` - Test/example file that's not needed in production
- `test.html` - Simple Three.js test file that's not needed in production

## Large Files
- `three.js.zip` (363MB) - Not needed as the project imports Three.js from CDN

## Potential Cleanup
- `Video-Depthify/` - If this is just a reference implementation or example, it can be removed
- `depthify_env/` - Python virtual environment that can be recreated using requirements.txt

# Code Cleanup Notes

1. Duplicate controls were removed from `index.html` (lines 194-210)
2. References to the old controls were removed from `js/app.js`
3. Documentation was improved in `README.md`

# Next Steps

1. Delete the files marked for removal
2. Consider adding more comments to the code for better maintainability
3. Consider adding proper JSDoc documentation to the JavaScript functions
4. Add proper error handling for cases where videos or depth maps are missing
