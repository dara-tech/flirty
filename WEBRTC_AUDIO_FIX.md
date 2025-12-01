# WebRTC Audio Not Working - Root Cause Analysis

## Problem
Users can't hear each other in calls. The call connects but no audio.

## Possible Causes
1. **Audio elements not playing** - Audio streams attached but not playing
2. **Remote stream not received** - ICE connection not established
3. **Audio tracks missing** - Media stream doesn't have audio tracks
4. **Autoplay blocked** - Browser blocking audio autoplay
5. **Volume muted** - Audio elements muted or volume set to 0

## Current Audio Setup

### VoiceCallWindow.jsx
- Has `<audio>` elements for local and remote streams
- Sets `srcObject` when streams are available
- Calls `.play()` explicitly

### VideoCallWindow.jsx  
- Uses `<video>` elements which should handle audio
- Sets `srcObject` when streams are available
- Calls `.play()` explicitly

## Debug Checklist
1. ✅ Check if `remoteStream` is received (console logs)
2. ✅ Check if audio elements are playing (not paused)
3. ✅ Check if tracks are enabled (not muted)
4. ✅ Check browser autoplay policy
5. ✅ Check volume settings
6. ✅ Check ICE connection state (should be "connected")
7. ✅ Check peer connection state (should be "connected")

## Fix Strategy
1. Ensure audio elements have `autoplay` and `playsInline` attributes
2. Explicitly play audio when stream is attached
3. Handle autoplay policy errors gracefully
4. Add user interaction requirement if needed
5. Monitor ICE connection state
6. Log audio track information
