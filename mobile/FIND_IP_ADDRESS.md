# How to Find Your Computer's IP Address

## Quick Method (Terminal)

### macOS / Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Or more specific:
```bash
# For WiFi (usually en0)
ipconfig getifaddr en0

# For Ethernet (usually en1)
ipconfig getifaddr en1
```

### Windows:
```cmd
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually WiFi or Ethernet).

## GUI Method

### macOS:
1. Open **System Settings** (or System Preferences on older macOS)
2. Go to **Network**
3. Select your active connection (WiFi or Ethernet)
4. Your IP address is shown next to "IP Address"

### Windows:
1. Open **Settings** → **Network & Internet**
2. Click on your connection (WiFi or Ethernet)
3. Scroll down to find "IPv4 address"

### Linux:
1. Open **Settings** → **Network**
2. Click on your connection
3. View details to see IP address

## For Mobile App Development

### What IP to Use:
- **Physical Device**: Use your computer's local IP (e.g., `192.168.0.107`)
- **Android Emulator**: Use `10.0.2.2` (special IP that points to host machine)
- **iOS Simulator**: Use `localhost` or `127.0.0.1`

### Current Setup:
Your mobile app uses the IP from `.env` file:
```
EXPO_PUBLIC_LOCAL_IP=192.168.0.107
```

### If IP Changes:
1. Find your new IP using methods above
2. Update `mobile/.env` file:
   ```
   EXPO_PUBLIC_LOCAL_IP=YOUR_NEW_IP
   ```
3. Restart the dev server:
   ```bash
   npx expo start --dev-client --clear
   ```

## Quick Check Script

Run this to see all your IP addresses:
```bash
# macOS
ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}'

# Or use this one-liner
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

## Important Notes

1. **Local IP vs Public IP**: You need the **local IP** (usually starts with `192.168.x.x` or `10.x.x.x`)
2. **IP Can Change**: Your router may assign a new IP when you reconnect to WiFi
3. **Same Network**: Device and computer must be on the **same WiFi network**
4. **Firewall**: Make sure your firewall allows connections on port 5002

## Verify Connection

Test if your backend is reachable:
```bash
curl http://YOUR_IP:5002/api/auth/me
```

If you get a response (even an error), the IP is correct!
