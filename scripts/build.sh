#!/bin/bash

# PiCA Build Script
# Compiles TypeScript and prepares for distribution

set -e

echo "🔨 Building PiCA..."

# Clean previous build
echo "  Cleaning previous build..."
npm run clean

# Build TypeScript
echo "  Compiling TypeScript..."
npm run build

# Run type checking
echo "  Running type checks..."
npm run lint

echo "✅ Build complete!"
echo ""
echo "📦 Output: dist/"
echo "📚 Type definitions: dist/*.d.ts"
echo ""
