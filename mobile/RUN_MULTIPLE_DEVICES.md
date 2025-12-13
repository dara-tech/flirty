# Running on Multiple Devices Simultaneously

## Quick Start (Recommended)

### Step 1: Start Metro Bundler Once
```bash
cd mobile
npx expo start --dev-client
```

This starts ONE Metro bundler that serves BOTH devices.

### Step 2: Connect Your Tablet (Android)
- The tablet should already be connected
- In Metro terminal, press `a` to open on Android
- Or scan the QR code with your tablet

### Step 3: Connect iOS Device/Simulator
**Option A: iOS Simulator (Mac only)**
- In the same Metro terminal, press `i`
- This will open iOS simulator and install the app

**Option B: Physical iOS Device**
- Make sure iOS device is on the same WiFi network
- Open Expo Go app on iOS device
- Scan the QR code shown in Metro terminal
- Or use the URL shown in Metro terminal

## Important Notes

✅ **One Metro Bundler**: You only need ONE Metro bundler running - it serves all devices

✅ **Same Network**: Both devices must be on the same WiFi network as your computer

✅ **Real-Time Works**: Both devices will receive real-time updates from the same backend

✅ **Independent Instances**: Each device runs its own instance of the app

## Troubleshooting

### iOS Device Can't Connect

**Check Network:**
```bash
# Make sure iOS device is on same WiFi
# Check your computer's IP address
ipconfig getifaddr en0  # macOS WiFi
```

**Use Tunnel Mode:**
```bash
npx expo start --dev-client --tunnel
```
This works even if devices are on different networks (slower but more reliable).

### Both Devices Show Same User

This is normal! Each device needs to:
1. Login with different accounts, OR
2. Use the same account (for testing same user on multiple devices)

### Metro Shows "Waiting for connection"

This is normal - Metro waits for devices to connect. Once you press `a` or `i`, or scan QR code, the connection will be established.

## Commands Reference

```bash
# Start Metro (serves all devices)
npx expo start --dev-client

# In Metro terminal:
# Press 'a' - Open on Android
# Press 'i' - Open on iOS simulator
# Press 'r' - Reload app
# Press 'm' - Open dev menu
# Press 'j' - Open debugger
```

## Testing Real-Time Between Devices

1. **Start Metro**: `npx expo start --dev-client`
2. **Connect Tablet**: Press `a` or scan QR
3. **Connect iOS**: Press `i` or scan QR
4. **Login on both devices** (can be same or different accounts)
5. **Send message from tablet** → Should appear on iOS instantly
6. **Send message from iOS** → Should appear on tablet instantly

Both devices connect to the same backend, so real-time features work perfectly!

