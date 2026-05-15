#!/bin/bash

# PiCA Test Script
# Runs all test suites

set -e

echo "🧪 Running PiCA Tests..."
echo ""

# Run tests
echo "  Running integration tests..."
npm run test -- --run

echo ""
echo "✅ All tests passed!"
echo ""
