#!/bin/bash
# Quick Test Script

echo "🧪 Quick Test Suite"
echo "=================="
echo ""

# Security Check
echo "🔒 1. Security Check..."
if git ls-files | grep -E "app\.json$|\.env$" | grep -v example > /dev/null; then
    echo "   ❌ FAIL: Secrets found in git!"
    git ls-files | grep -E "app\.json$|\.env$" | grep -v example
else
    echo "   ✅ PASS: No secrets in tracked files"
fi

# Check app.json exists locally
echo ""
echo "📱 2. Mobile App Config..."
if [ -f "mobile/app.json" ]; then
    if grep -q "YOUR_GOOGLE_MAPS_API_KEY_HERE" mobile/app.json; then
        echo "   ⚠️  WARNING: app.json still has placeholder - add your API key!"
    else
        echo "   ✅ PASS: app.json exists with API key"
    fi
else
    echo "   ❌ FAIL: mobile/app.json not found - create from app.json.example"
fi

# Check .env files exist locally
echo ""
echo "🔐 3. Environment Files..."
if [ -f "backend/.env" ]; then
    echo "   ✅ backend/.env exists"
else
    echo "   ⚠️  WARNING: backend/.env not found - create from .env.example"
fi

if [ -f "frontend/.env" ]; then
    echo "   ✅ frontend/.env exists"
else
    echo "   ℹ️  INFO: frontend/.env optional (uses defaults)"
fi

# Check backend can start
echo ""
echo "🌐 4. Backend Health Check..."
cd backend
timeout 5 npm run dev > /dev/null 2>&1 &
BACKEND_PID=$!
sleep 3
if curl -s http://localhost:5002/api/health > /dev/null 2>&1; then
    echo "   ✅ PASS: Backend responds"
else
    echo "   ⚠️  WARNING: Backend not responding (may not be running)"
fi
kill $BACKEND_PID 2>/dev/null
cd ..

# Check mobile can build
echo ""
echo "📦 5. Mobile Build Check..."
if [ -d "mobile/android" ]; then
    echo "   ✅ Android project exists"
    if [ -f "mobile/android/app/src/main/AndroidManifest.xml" ]; then
        if grep -q "API_KEY" mobile/android/app/src/main/AndroidManifest.xml 2>/dev/null; then
            echo "   ✅ API key found in AndroidManifest.xml"
        else
            echo "   ⚠️  WARNING: API key not in AndroidManifest.xml - run: npx expo prebuild"
        fi
    fi
else
    echo "   ℹ️  INFO: Android project not generated - run: npx expo prebuild"
fi

echo ""
echo "✅ Quick test complete!"
echo ""
echo "📖 For detailed testing, see TESTING_GUIDE.md"
