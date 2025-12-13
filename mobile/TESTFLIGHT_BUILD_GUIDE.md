# TestFlight Build Guide for iOS

Complete guide to build and deploy your iOS app to TestFlight.

## Prerequisites

1. **Apple Developer Account** (paid - $99/year)
   - Sign up at: https://developer.apple.com
   - You need this to distribute via TestFlight

2. **Xcode** (latest version)
   - Download from Mac App Store
   - Make sure Command Line Tools are installed: `xcode-select --install`

3. **App Store Connect Setup**
   - Go to https://appstoreconnect.apple.com
   - Create a new app (if not already created)
   - Bundle ID: `com.anonymous.mobile`
   - App Name: `Chatu`

## Step 1: Open Xcode Workspace

```bash
cd /Users/cheolsovandara/Documents/D/Developments/Project_2024/chat_app/mobile/ios
open Chatu.xcworkspace
```

**Important:** Always open the `.xcworkspace` file, NOT the `.xcodeproj` file!

## Step 2: Configure Signing & Capabilities

1. In Xcode, select the **Chatu** project in the left sidebar
2. Select the **Chatu** target
3. Go to **Signing & Capabilities** tab
4. Check **"Automatically manage signing"**
5. Select your **Team** (your Apple Developer account)
6. Xcode will automatically create/select the correct provisioning profile

## Step 3: Update Version & Build Number

1. In the **General** tab of your target:
   - **Version**: `1.0.0` (or increment for updates)
   - **Build**: `1` (increment this for each TestFlight upload)

Or update in `app.json`:
```json
{
  "expo": {
    "version": "1.0.0",
    "ios": {
      "buildNumber": "1"
    }
  }
}
```

Then run: `npx expo prebuild --clean`

## Step 4: Build Archive

### Option A: Using Xcode GUI (Recommended)

1. In Xcode, select **"Any iOS Device"** or **"Generic iOS Device"** from the device selector (top toolbar)
2. Go to **Product → Archive**
3. Wait for the archive to build (this may take 5-10 minutes)
4. The **Organizer** window will open automatically

### Option B: Using Command Line

```bash
cd /Users/cheolsovandara/Documents/D/Developments/Project_2024/chat_app/mobile/ios

# Clean build folder
xcodebuild clean -workspace Chatu.xcworkspace -scheme Chatu

# Build archive
xcodebuild archive \
  -workspace Chatu.xcworkspace \
  -scheme Chatu \
  -configuration Release \
  -archivePath build/Chatu.xcarchive \
  -allowProvisioningUpdates
```

## Step 5: Upload to App Store Connect

### Option A: Using Xcode Organizer (Recommended)

1. After archive completes, the **Organizer** window opens
2. Select your archive
3. Click **"Distribute App"**
4. Choose **"App Store Connect"**
5. Click **"Upload"**
6. Follow the wizard:
   - Select your distribution options
   - Review app information
   - Click **"Upload"**
7. Wait for upload to complete (5-15 minutes)

### Option B: Using Command Line (xcrun altool)

```bash
# Upload the archive
xcrun altool --upload-app \
  --type ios \
  --file "build/Chatu.xcarchive" \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

Or use the newer `xcrun notarytool` for notarization.

## Step 6: Configure TestFlight

1. Go to https://appstoreconnect.apple.com
2. Navigate to **My Apps → Chatu**
3. Go to **TestFlight** tab
4. Wait for processing (10-30 minutes)
5. Once processed, you can:
   - Add internal testers (up to 100)
   - Add external testers (up to 10,000)
   - Send invitation emails

## Step 7: Add Testers

### Internal Testers (Immediate)
1. Go to **TestFlight → Internal Testing**
2. Click **"+"** to add testers
3. Add email addresses of your team members
4. They'll receive an email invitation

### External Testers (Requires Beta Review)
1. Go to **TestFlight → External Testing**
2. Create a new group
3. Add the build
4. Fill out Beta App Information (required for first external test)
5. Submit for Beta App Review (takes 24-48 hours)
6. Once approved, add testers

## Troubleshooting

### "No signing certificate found"
- Go to Xcode → Preferences → Accounts
- Add your Apple ID
- Download certificates manually if needed

### "Provisioning profile doesn't match"
- In Xcode, go to Signing & Capabilities
- Uncheck and re-check "Automatically manage signing"
- Clean build folder: Product → Clean Build Folder

### Archive fails with code signing errors
```bash
# Clean derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Clean build folder
cd ios
rm -rf build

# Re-install pods
pod install

# Try again
```

### Upload fails
- Check your internet connection
- Verify your Apple Developer account is active
- Make sure you have the correct permissions in App Store Connect

## Quick Build Script

Save this as `build-testflight.sh`:

```bash
#!/bin/bash
cd "$(dirname "$0")/ios"

echo "🧹 Cleaning..."
xcodebuild clean -workspace Chatu.xcworkspace -scheme Chatu

echo "📦 Building archive..."
xcodebuild archive \
  -workspace Chatu.xcworkspace \
  -scheme Chatu \
  -configuration Release \
  -archivePath build/Chatu.xcarchive \
  -allowProvisioningUpdates

echo "✅ Archive created at: ios/build/Chatu.xcarchive"
echo "📤 Now upload via Xcode Organizer or use xcrun altool"
```

Make it executable:
```bash
chmod +x build-testflight.sh
./build-testflight.sh
```

## Important Notes

- ⚠️ **Bundle ID must match** App Store Connect exactly: `com.anonymous.mobile`
- ⚠️ **Version numbers** must increment for each new build
- ⚠️ **First upload** may take longer to process
- ⚠️ **External testing** requires Beta App Review (24-48 hours)
- ✅ **Internal testing** is immediate (no review needed)

## Next Steps After Upload

1. Wait for processing (check App Store Connect)
2. Add testers
3. Testers install TestFlight app from App Store
4. Testers receive invitation email
5. Testers can install and test your app

---

**Need Help?**
- Apple Developer Support: https://developer.apple.com/support
- TestFlight Documentation: https://developer.apple.com/testflight






