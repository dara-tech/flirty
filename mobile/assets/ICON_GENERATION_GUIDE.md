# Chatu Icon Generation Guide

## Icon Design
An SVG icon has been created at `assets/icon-chatu.svg` with a modern chat bubble design.

## Required Icon Sizes

### iOS
- **icon.png**: 1024x1024 pixels (required)
- **splash-icon.png**: 1242x2436 pixels (for splash screen)

### Android
- **icon.png**: 1024x1024 pixels (base icon)
- **adaptive-icon.png**: 1024x1024 pixels (foreground only, transparent background)

## How to Generate Icons

### Option 1: Using Online Tools (Easiest)

1. **Convert SVG to PNG**:
   - Go to https://cloudconvert.com/svg-to-png
   - Upload `icon-chatu.svg`
   - Set size to 1024x1024
   - Download as `icon.png`

2. **For Adaptive Icon (Android)**:
   - Use the same PNG but ensure it has transparent background
   - The icon should be centered in a 1024x1024 canvas
   - Save as `adaptive-icon.png`

3. **For Splash Screen**:
   - Use https://www.appicon.co/ or https://www.appicon.build/
   - Upload your icon
   - Generate all required sizes

### Option 2: Using ImageMagick (Command Line)

```bash
# Install ImageMagick (if not installed)
# macOS: brew install imagemagick
# Linux: sudo apt-get install imagemagick

# Convert SVG to PNG (1024x1024)
convert -background none -resize 1024x1024 assets/icon-chatu.svg assets/icon.png

# Create adaptive icon (same as icon for now)
cp assets/icon.png assets/adaptive-icon.png

# Create splash icon (can use same icon or create a larger version)
convert -background white -resize 1242x2436 -gravity center -extent 1242x2436 assets/icon.png assets/splash-icon.png
```

### Option 3: Using Figma/Design Tools

1. Open `icon-chatu.svg` in Figma or Adobe Illustrator
2. Export as PNG at 1024x1024 resolution
3. Save as `icon.png`
4. For adaptive icon, ensure transparent background and save as `adaptive-icon.png`

### Option 4: Using Expo's Icon Generator

```bash
# Install expo-cli if needed
npm install -g expo-cli

# Generate icons from SVG (if expo supports it)
npx expo-asset-generator assets/icon-chatu.svg assets/
```

## Verification

After generating icons, verify they exist:
- ✅ `assets/icon.png` (1024x1024)
- ✅ `assets/adaptive-icon.png` (1024x1024)
- ✅ `assets/splash-icon.png` (1242x2436 or similar)
- ✅ `assets/favicon.png` (for web, 32x32 or 64x64)

## Update app.json

The app name has been updated to "Chatu" in `app.json`. The icon paths are already configured correctly.

## Testing

After updating icons:
1. Clear cache: `npx expo start -c`
2. Rebuild: `npx expo prebuild --clean`
3. Run app: `npx expo run:ios` or `npx expo run:android`







