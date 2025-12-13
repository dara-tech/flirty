# Building Release APK

## Option 1: EAS Build (Recommended - Cloud Build)

### Step 1: Login to EAS
```bash
eas login
```
You'll need an Expo account. If you don't have one, create it at https://expo.dev

### Step 2: Build Release APK
```bash
eas build --platform android --profile production
```

This will:
- Build your APK in the cloud
- Take about 10-20 minutes
- Provide a download link when complete

### Alternative: Build Preview APK (faster, for testing)
```bash
eas build --platform android --profile preview
```

---

## Option 2: Local Build (Requires Android Studio)

### Prerequisites:
1. Android Studio installed
2. Android SDK configured
3. JAVA_HOME and ANDROID_HOME environment variables set

### Build Command:
```bash
expo run:android --variant release
```

The APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## Quick Start (EAS Build)

Run these commands in order:

```bash
# 1. Login (interactive - you'll need to enter credentials)
eas login

# 2. Build release APK
eas build --platform android --profile production

# 3. Wait for build to complete (check status with)
eas build:list

# 4. Download APK when ready
eas build:download
```

---

## Notes:
- EAS Build requires an Expo account (free tier available)
- First build may take longer as it sets up the build environment
- APK will be signed with a debug keystore (for production, configure signing in eas.json)
