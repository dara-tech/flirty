# 🎥 Flutter WebRTC Audio/Video Call & Screen Share Setup Guide

Complete guide to implement audio/video calling with screen sharing in your Flutter project.

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Dependencies](#dependencies)
3. [Project Structure](#project-structure)
4. [Backend Integration](#backend-integration)
5. [Implementation Steps](#implementation-steps)
6. [Screen Sharing](#screen-sharing)
7. [Testing Guide](#testing-guide)

---

## 🏗️ Architecture Overview

### Communication Flow
```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Flutter   │◄──────────────────►│   Backend   │
│   Client    │    Signaling       │   Socket.io │
└──────┬──────┘                    └─────────────┘
       │
       │ WebRTC (Peer-to-Peer)
       │
┌──────▼──────┐
│   Remote    │
│   Client    │
└─────────────┘
```

### Call Types Supported
- ✅ **1-on-1 Voice Call**
- ✅ **1-on-1 Video Call**
- ✅ **Group Voice Call** (SFU mesh)
- ✅ **Group Video Call** (SFU mesh)
- ✅ **Screen Sharing** (1-on-1 and group)

### Backend Features (Already Working)
- ✅ Socket.io server at `ws://YOUR_SERVER:5002`
- ✅ WebRTC signaling (offer/answer/ICE)
- ✅ Call history tracking
- ✅ Group call rooms (SFU-style)
- ✅ Screen share events

---

## 📦 Dependencies

### 1. Add to `pubspec.yaml`

```yaml
name: flirty_flutter
description: Flutter app with WebRTC calls

dependencies:
  flutter:
    sdk: flutter
  
  # WebRTC for audio/video calls
  flutter_webrtc: ^0.10.5
  
  # Socket.io for signaling
  socket_io_client: ^2.0.3+1
  
  # State management
  provider: ^6.1.1
  # OR riverpod: ^2.4.9
  
  # Permissions
  permission_handler: ^11.0.1
  
  # UI
  cached_network_image: ^3.3.0
  flutter_svg: ^2.0.9
  
  # Utils
  uuid: ^4.2.2
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
```

### 2. Platform Configuration

#### **Android** (`android/app/src/main/AndroidManifest.xml`)

```xml
<manifest>
    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    
    <!-- Features -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />

    <application>
        <!-- ... -->
    </application>
</manifest>
```

#### **iOS** (`ios/Runner/Info.plist`)

```xml
<dict>
    <!-- Camera Permission -->
    <key>NSCameraUsageDescription</key>
    <string>We need camera access for video calls</string>
    
    <!-- Microphone Permission -->
    <key>NSMicrophoneUsageDescription</key>
    <string>We need microphone access for voice and video calls</string>
    
    <!-- Background Modes (for calls) -->
    <key>UIBackgroundModes</key>
    <array>
        <string>audio</string>
        <string>voip</string>
    </array>
</dict>
```

#### **iOS Podfile** (`ios/Podfile`)

```ruby
platform :ios, '12.0'

target 'Runner' do
  use_frameworks!
  use_modular_headers!

  flutter_install_all_ios_pods File.dirname(File.realpath(__FILE__))
  
  # WebRTC pod
  pod 'GoogleWebRTC', '~> 1.1'
end
```

---

## 🗂️ Project Structure

```
lib/
├── main.dart
├── models/
│   ├── call_model.dart              # Call data models
│   └── user_model.dart
├── services/
│   ├── socket_service.dart          # Socket.io connection
│   ├── webrtc_service.dart          # WebRTC peer connection
│   └── call_service.dart            # Call management
├── providers/
│   ├── call_provider.dart           # Call state management
│   └── auth_provider.dart
├── screens/
│   ├── voice_call_screen.dart       # Voice call UI
│   ├── video_call_screen.dart       # Video call UI
│   ├── group_call_screen.dart       # Group call UI
│   └── incoming_call_screen.dart    # Incoming call overlay
├── widgets/
│   ├── call_controls.dart           # Mute, speaker, end call buttons
│   ├── video_renderer.dart          # Video display widget
│   └── participant_tile.dart        # Group call participant
└── utils/
    ├── webrtc_config.dart           # STUN/TURN servers
    └── permissions.dart             # Permission handlers
```

---

## 🔌 Backend Integration

### Socket Events (Backend Already Implements These)

#### **Call Signaling Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `call:initiate` | Client → Server | `{ callId, callType, callerId, receiverId, callerInfo }` | Start a call |
| `call:incoming` | Server → Client | `{ callId, callType, callerInfo }` | Receive incoming call |
| `call:ringing` | Server → Client | `{}` | Call is ringing |
| `call:accepted` | Server → Both | `{ callId, receiverInfo }` | Call accepted |
| `call:rejected` | Server → Caller | `{ reason }` | Call rejected |
| `call:ended` | Both → Server | `{ callId }` | End call |

#### **WebRTC Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `webrtc:offer` | Client → Server | `{ callId, offer, receiverId }` | Send SDP offer |
| `webrtc:answer` | Client → Server | `{ callId, answer, callerId }` | Send SDP answer |
| `webrtc:ice-candidate` | Both → Server | `{ callId, candidate, targetId }` | Exchange ICE candidates |

#### **Screen Share Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `screen-share:start` | Client → Server | `{ callId }` | Start screen sharing |
| `screen-share:stop` | Client → Server | `{ callId }` | Stop screen sharing |
| `screen-share:started` | Server → Remote | `{ userId }` | Remote user started sharing |
| `screen-share:stopped` | Server → Remote | `{ userId }` | Remote user stopped sharing |

#### **Group Call Events**

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `groupcall:join` | Client → Server | `{ roomId, userInfo }` | Join group call |
| `groupcall:leave` | Client → Server | `{ roomId }` | Leave group call |
| `groupcall:participant-joined` | Server → Room | `{ userId, userInfo, currentStream }` | New participant |
| `groupcall:participant-left` | Server → Room | `{ userId }` | Participant left |

### Backend API Endpoint

```
Base URL: http://YOUR_SERVER:5002
WebSocket: ws://YOUR_SERVER:5002
```

---

## 🛠️ Implementation Steps

### Step 1: Create WebRTC Configuration

**`lib/utils/webrtc_config.dart`**

```dart
class WebRTCConfig {
  static const Map<String, dynamic> rtcConfiguration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      // Add TURN servers for production
      // {
      //   'urls': 'turn:your-turn-server.com:3478',
      //   'username': 'username',
      //   'credential': 'password'
      // }
    ],
    'sdpSemantics': 'unified-plan',
  };

  static const Map<String, dynamic> mediaConstraints = {
    'audio': {
      'echoCancellation': true,
      'noiseSuppression': true,
      'autoGainControl': true,
    },
    'video': {
      'width': {'ideal': 1280, 'min': 640},
      'height': {'ideal': 720, 'min': 480},
      'facingMode': 'user',
    },
  };

  static const Map<String, dynamic> audioOnlyConstraints = {
    'audio': {
      'echoCancellation': true,
      'noiseSuppression': true,
      'autoGainControl': true,
    },
    'video': false,
  };

  static const Map<String, dynamic> screenShareConstraints = {
    'audio': false,
    'video': true,
  };
}
```

### Step 2: Socket Service

**`lib/services/socket_service.dart`**

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  String? _userId;

  // Initialize socket connection
  void connect({
    required String serverUrl,
    required String userId,
    required String token,
  }) {
    _userId = userId;

    _socket = IO.io(
      serverUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setExtraHeaders({
            'Authorization': 'Bearer $token',
          })
          .setQuery({
            'userId': userId,
          })
          .build(),
    );

    _socket?.onConnect((_) {
      print('✅ Socket connected: ${_socket?.id}');
    });

    _socket?.onDisconnect((_) {
      print('❌ Socket disconnected');
    });

    _socket?.onError((error) {
      print('⚠️ Socket error: $error');
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }

  // Emit events
  void emit(String event, dynamic data) {
    _socket?.emit(event, data);
  }

  // Listen to events
  void on(String event, Function(dynamic) callback) {
    _socket?.on(event, callback);
  }

  void off(String event) {
    _socket?.off(event);
  }

  bool get isConnected => _socket?.connected ?? false;
  String? get userId => _userId;
}
```

### Step 3: WebRTC Service

**`lib/services/webrtc_service.dart`**

```dart
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../utils/webrtc_config.dart';

class WebRTCService {
  RTCPeerConnection? peerConnection;
  MediaStream? localStream;
  MediaStream? remoteStream;
  MediaStream? screenShareStream;

  final List<RTCIceCandidate> _iceCandidatesQueue = [];
  bool _isRemoteDescriptionSet = false;

  // Callbacks
  Function(MediaStream)? onRemoteStream;
  Function(RTCIceCandidate)? onIceCandidate;
  Function(RTCPeerConnectionState)? onConnectionStateChange;

  // Create peer connection
  Future<void> createPeerConnection() async {
    peerConnection = await createPeerConnection(
      WebRTCConfig.rtcConfiguration,
    );

    // Handle ICE candidates
    peerConnection?.onIceCandidate = (candidate) {
      print('🧊 ICE candidate generated');
      onIceCandidate?.call(candidate);
    };

    // Handle remote stream
    peerConnection?.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        print('📡 Remote stream received');
        remoteStream = event.streams[0];
        onRemoteStream?.call(event.streams[0]);
      }
    };

    // Handle connection state
    peerConnection?.onConnectionState = (state) {
      print('🔗 Connection state: $state');
      onConnectionStateChange?.call(state);
    };
  }

  // Get local media stream
  Future<MediaStream> getLocalStream({bool videoEnabled = true}) async {
    try {
      final constraints = videoEnabled
          ? WebRTCConfig.mediaConstraints
          : WebRTCConfig.audioOnlyConstraints;

      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      print('✅ Local stream obtained');

      // Add tracks to peer connection
      if (peerConnection != null) {
        localStream?.getTracks().forEach((track) {
          peerConnection?.addTrack(track, localStream!);
        });
      }

      return localStream!;
    } catch (e) {
      print('❌ Error getting local stream: $e');
      rethrow;
    }
  }

  // Create offer
  Future<RTCSessionDescription> createOffer() async {
    try {
      final offer = await peerConnection?.createOffer();
      await peerConnection?.setLocalDescription(offer!);
      print('📤 Offer created and set as local description');
      return offer!;
    } catch (e) {
      print('❌ Error creating offer: $e');
      rethrow;
    }
  }

  // Create answer
  Future<RTCSessionDescription> createAnswer() async {
    try {
      final answer = await peerConnection?.createAnswer();
      await peerConnection?.setLocalDescription(answer!);
      print('📤 Answer created and set as local description');
      return answer!;
    } catch (e) {
      print('❌ Error creating answer: $e');
      rethrow;
    }
  }

  // Set remote description
  Future<void> setRemoteDescription(RTCSessionDescription description) async {
    try {
      await peerConnection?.setRemoteDescription(description);
      _isRemoteDescriptionSet = true;
      print('📥 Remote description set');

      // Process queued ICE candidates
      if (_iceCandidatesQueue.isNotEmpty) {
        print('🧊 Processing ${_iceCandidatesQueue.length} queued ICE candidates');
        for (var candidate in _iceCandidatesQueue) {
          await peerConnection?.addCandidate(candidate);
        }
        _iceCandidatesQueue.clear();
      }
    } catch (e) {
      print('❌ Error setting remote description: $e');
      rethrow;
    }
  }

  // Add ICE candidate
  Future<void> addIceCandidate(RTCIceCandidate candidate) async {
    try {
      if (_isRemoteDescriptionSet) {
        await peerConnection?.addCandidate(candidate);
        print('🧊 ICE candidate added');
      } else {
        print('🧊 Queuing ICE candidate (remote description not set yet)');
        _iceCandidatesQueue.add(candidate);
      }
    } catch (e) {
      print('❌ Error adding ICE candidate: $e');
    }
  }

  // Toggle audio (mute/unmute)
  void toggleAudio(bool enabled) {
    localStream?.getAudioTracks().forEach((track) {
      track.enabled = enabled;
    });
  }

  // Toggle video
  void toggleVideo(bool enabled) {
    localStream?.getVideoTracks().forEach((track) {
      track.enabled = enabled;
    });
  }

  // Switch camera (front/back)
  Future<void> switchCamera() async {
    if (localStream != null) {
      final videoTrack = localStream!.getVideoTracks()[0];
      await Helper.switchCamera(videoTrack);
    }
  }

  // Start screen sharing (Android/iOS)
  Future<MediaStream?> startScreenShare() async {
    try {
      screenShareStream = await navigator.mediaDevices.getDisplayMedia(
        WebRTCConfig.screenShareConstraints,
      );

      // Replace video track with screen share track
      if (peerConnection != null && screenShareStream != null) {
        final senders = await peerConnection!.getSenders();
        final videoSender = senders.firstWhere(
          (sender) => sender.track?.kind == 'video',
          orElse: () => throw Exception('No video sender found'),
        );

        final screenTrack = screenShareStream!.getVideoTracks()[0];
        await videoSender.replaceTrack(screenTrack);
      }

      return screenShareStream;
    } catch (e) {
      print('❌ Error starting screen share: $e');
      return null;
    }
  }

  // Stop screen sharing
  Future<void> stopScreenShare() async {
    if (screenShareStream != null) {
      screenShareStream!.getTracks().forEach((track) => track.stop());
      screenShareStream = null;

      // Switch back to camera
      if (localStream != null && peerConnection != null) {
        final senders = await peerConnection!.getSenders();
        final videoSender = senders.firstWhere(
          (sender) => sender.track?.kind == 'video',
          orElse: () => throw Exception('No video sender found'),
        );

        final cameraTrack = localStream!.getVideoTracks()[0];
        await videoSender.replaceTrack(cameraTrack);
      }
    }
  }

  // Cleanup
  void dispose() {
    localStream?.getTracks().forEach((track) => track.stop());
    localStream?.dispose();

    remoteStream?.getTracks().forEach((track) => track.stop());
    remoteStream?.dispose();

    screenShareStream?.getTracks().forEach((track) => track.stop());
    screenShareStream?.dispose();

    peerConnection?.close();
    peerConnection?.dispose();

    localStream = null;
    remoteStream = null;
    screenShareStream = null;
    peerConnection = null;

    _iceCandidatesQueue.clear();
    _isRemoteDescriptionSet = false;
  }
}
```

### Step 4: Call Provider (State Management)

**`lib/providers/call_provider.dart`**

```dart
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/socket_service.dart';
import '../services/webrtc_service.dart';
import '../models/call_model.dart';

class CallProvider with ChangeNotifier {
  final SocketService _socketService = SocketService();
  final WebRTCService _webrtcService = WebRTCService();

  CallModel? _currentCall;
  CallState _callState = CallState.idle;
  bool _isMuted = false;
  bool _isVideoEnabled = true;
  bool _isSpeakerOn = true;
  bool _isScreenSharing = false;

  // Getters
  CallModel? get currentCall => _currentCall;
  CallState get callState => _callState;
  bool get isMuted => _isMuted;
  bool get isVideoEnabled => _isVideoEnabled;
  bool get isSpeakerOn => _isSpeakerOn;
  bool get isScreenSharing => _isScreenSharing;
  MediaStream? get localStream => _webrtcService.localStream;
  MediaStream? get remoteStream => _webrtcService.remoteStream;

  void initialize() {
    _setupSocketListeners();
    _setupWebRTCCallbacks();
  }

  void _setupSocketListeners() {
    // Incoming call
    _socketService.on('call:incoming', (data) {
      print('📞 Incoming call: $data');
      _currentCall = CallModel.fromJson(data);
      _callState = CallState.ringing;
      notifyListeners();
    });

    // Call accepted
    _socketService.on('call:accepted', (data) async {
      print('✅ Call accepted');
      _callState = CallState.connecting;
      notifyListeners();
    });

    // Call rejected
    _socketService.on('call:rejected', (data) {
      print('❌ Call rejected');
      endCall();
    });

    // Call ended
    _socketService.on('call:ended', (data) {
      print('📴 Call ended');
      endCall();
    });

    // WebRTC offer
    _socketService.on('webrtc:offer', (data) async {
      print('📥 Received offer');
      final offer = RTCSessionDescription(data['offer']['sdp'], data['offer']['type']);
      await _webrtcService.setRemoteDescription(offer);

      // Create answer
      final answer = await _webrtcService.createAnswer();
      _socketService.emit('webrtc:answer', {
        'callId': _currentCall?.callId,
        'answer': {'sdp': answer.sdp, 'type': answer.type},
        'callerId': _currentCall?.callerId,
      });
    });

    // WebRTC answer
    _socketService.on('webrtc:answer', (data) async {
      print('📥 Received answer');
      final answer = RTCSessionDescription(data['answer']['sdp'], data['answer']['type']);
      await _webrtcService.setRemoteDescription(answer);
    });

    // ICE candidate
    _socketService.on('webrtc:ice-candidate', (data) async {
      print('🧊 Received ICE candidate');
      final candidate = RTCIceCandidate(
        data['candidate']['candidate'],
        data['candidate']['sdpMid'],
        data['candidate']['sdpMLineIndex'],
      );
      await _webrtcService.addIceCandidate(candidate);
    });

    // Screen share events
    _socketService.on('screen-share:started', (data) {
      print('🖥️ Remote user started screen sharing');
      // Handle UI update
      notifyListeners();
    });

    _socketService.on('screen-share:stopped', (data) {
      print('🖥️ Remote user stopped screen sharing');
      // Handle UI update
      notifyListeners();
    });
  }

  void _setupWebRTCCallbacks() {
    _webrtcService.onRemoteStream = (stream) {
      print('📡 Remote stream received in provider');
      if (_callState == CallState.connecting) {
        _callState = CallState.connected;
      }
      notifyListeners();
    };

    _webrtcService.onIceCandidate = (candidate) {
      print('🧊 Sending ICE candidate');
      _socketService.emit('webrtc:ice-candidate', {
        'callId': _currentCall?.callId,
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        },
        'targetId': _currentCall?.receiverId,
      });
    };

    _webrtcService.onConnectionStateChange = (state) {
      print('🔗 Connection state changed: $state');
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _callState = CallState.connected;
        notifyListeners();
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected) {
        endCall();
      }
    };
  }

  // Initiate call
  Future<void> initiateCall({
    required String receiverId,
    required String receiverName,
    required String receiverAvatar,
    required CallType callType,
  }) async {
    try {
      // Create call model
      _currentCall = CallModel(
        callId: DateTime.now().millisecondsSinceEpoch.toString(),
        callerId: _socketService.userId!,
        receiverId: receiverId,
        receiverName: receiverName,
        receiverAvatar: receiverAvatar,
        callType: callType,
      );

      _callState = CallState.calling;
      _isVideoEnabled = callType == CallType.video;
      notifyListeners();

      // Create peer connection
      await _webrtcService.createPeerConnection();

      // Get local stream
      await _webrtcService.getLocalStream(videoEnabled: callType == CallType.video);

      // Create and send offer
      final offer = await _webrtcService.createOffer();
      _socketService.emit('call:initiate', {
        'callId': _currentCall?.callId,
        'callType': callType.toString().split('.').last,
        'callerId': _socketService.userId,
        'receiverId': receiverId,
        'callerInfo': {
          'userId': _socketService.userId,
          'fullname': 'Current User', // Get from auth
          'profilePic': '', // Get from auth
        },
      });

      _socketService.emit('webrtc:offer', {
        'callId': _currentCall?.callId,
        'offer': {'sdp': offer.sdp, 'type': offer.type},
        'receiverId': receiverId,
      });
    } catch (e) {
      print('❌ Error initiating call: $e');
      endCall();
    }
  }

  // Answer call
  Future<void> answerCall() async {
    try {
      _callState = CallState.connecting;
      notifyListeners();

      // Create peer connection
      await _webrtcService.createPeerConnection();

      // Get local stream
      await _webrtcService.getLocalStream(
        videoEnabled: _currentCall?.callType == CallType.video,
      );

      // Emit accepted
      _socketService.emit('call:accepted', {
        'callId': _currentCall?.callId,
        'receiverInfo': {
          'userId': _socketService.userId,
          'fullname': 'Current User',
          'profilePic': '',
        },
      });
    } catch (e) {
      print('❌ Error answering call: $e');
      endCall();
    }
  }

  // Reject call
  void rejectCall() {
    _socketService.emit('call:rejected', {
      'callId': _currentCall?.callId,
      'reason': 'User rejected',
    });
    endCall();
  }

  // End call
  void endCall() {
    if (_currentCall != null) {
      _socketService.emit('call:ended', {
        'callId': _currentCall?.callId,
      });
    }

    _webrtcService.dispose();
    _currentCall = null;
    _callState = CallState.idle;
    _isMuted = false;
    _isVideoEnabled = true;
    _isSpeakerOn = true;
    _isScreenSharing = false;
    notifyListeners();
  }

  // Toggle mute
  void toggleMute() {
    _isMuted = !_isMuted;
    _webrtcService.toggleAudio(!_isMuted);
    notifyListeners();
  }

  // Toggle video
  void toggleVideo() {
    _isVideoEnabled = !_isVideoEnabled;
    _webrtcService.toggleVideo(_isVideoEnabled);
    notifyListeners();
  }

  // Toggle speaker
  void toggleSpeaker() {
    _isSpeakerOn = !_isSpeakerOn;
    // Implement speaker toggle (platform-specific)
    notifyListeners();
  }

  // Switch camera
  Future<void> switchCamera() async {
    await _webrtcService.switchCamera();
  }

  // Toggle screen share
  Future<void> toggleScreenShare() async {
    if (_isScreenSharing) {
      await _webrtcService.stopScreenShare();
      _socketService.emit('screen-share:stop', {
        'callId': _currentCall?.callId,
      });
      _isScreenSharing = false;
    } else {
      final screenStream = await _webrtcService.startScreenShare();
      if (screenStream != null) {
        _socketService.emit('screen-share:start', {
          'callId': _currentCall?.callId,
        });
        _isScreenSharing = true;
      }
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _webrtcService.dispose();
    super.dispose();
  }
}

enum CallState {
  idle,
  calling,
  ringing,
  connecting,
  connected,
}

enum CallType {
  voice,
  video,
}
```

### Step 5: Call Models

**`lib/models/call_model.dart`**

```dart
class CallModel {
  final String callId;
  final String callerId;
  final String receiverId;
  final String receiverName;
  final String receiverAvatar;
  final CallType callType;
  final DateTime? startTime;

  CallModel({
    required this.callId,
    required this.callerId,
    required this.receiverId,
    required this.receiverName,
    required this.receiverAvatar,
    required this.callType,
    this.startTime,
  });

  factory CallModel.fromJson(Map<String, dynamic> json) {
    return CallModel(
      callId: json['callId'],
      callerId: json['callerId'],
      receiverId: json['receiverId'],
      receiverName: json['callerInfo']?['fullname'] ?? 'Unknown',
      receiverAvatar: json['callerInfo']?['profilePic'] ?? '',
      callType: json['callType'] == 'video' ? CallType.video : CallType.voice,
      startTime: json['startTime'] != null ? DateTime.parse(json['startTime']) : null,
    );
  }
}
```

### Step 6: Video Call Screen

**`lib/screens/video_call_screen.dart`**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import '../providers/call_provider.dart';

class VideoCallScreen extends StatefulWidget {
  const VideoCallScreen({Key? key}) : super(key: key);

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  @override
  void initState() {
    super.initState();
    _initRenderers();
  }

  Future<void> _initRenderers() async {
    await _localRenderer.initialize();
    await _remoteRenderer.initialize();

    // Attach streams
    final callProvider = context.read<CallProvider>();
    if (callProvider.localStream != null) {
      _localRenderer.srcObject = callProvider.localStream;
    }
    if (callProvider.remoteStream != null) {
      _remoteRenderer.srcObject = callProvider.remoteStream;
    }
  }

  @override
  void dispose() {
    _localRenderer.dispose();
    _remoteRenderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Consumer<CallProvider>(
        builder: (context, callProvider, child) {
          // Update renderers when streams change
          _localRenderer.srcObject = callProvider.localStream;
          _remoteRenderer.srcObject = callProvider.remoteStream;

          return Stack(
            children: [
              // Remote video (full screen)
              if (callProvider.remoteStream != null)
                Positioned.fill(
                  child: RTCVideoView(
                    _remoteRenderer,
                    objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    mirror: false,
                  ),
                )
              else
                Positioned.fill(
                  child: Container(
                    color: Colors.grey[900],
                    child: Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircleAvatar(
                            radius: 60,
                            backgroundImage: NetworkImage(
                              callProvider.currentCall?.receiverAvatar ?? '',
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            callProvider.currentCall?.receiverName ?? '',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            _getCallStateText(callProvider.callState),
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

              // Local video (small, draggable)
              if (callProvider.localStream != null && callProvider.isVideoEnabled)
                Positioned(
                  top: 50,
                  right: 20,
                  child: Container(
                    width: 120,
                    height: 160,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white, width: 2),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: RTCVideoView(
                        _localRenderer,
                        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                        mirror: true,
                      ),
                    ),
                  ),
                ),

              // Call controls
              Positioned(
                bottom: 40,
                left: 0,
                right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    // Mute button
                    _buildControlButton(
                      icon: callProvider.isMuted ? Icons.mic_off : Icons.mic,
                      color: callProvider.isMuted ? Colors.red : Colors.white,
                      onPressed: () => callProvider.toggleMute(),
                    ),

                    // Video button
                    _buildControlButton(
                      icon: callProvider.isVideoEnabled
                          ? Icons.videocam
                          : Icons.videocam_off,
                      color: callProvider.isVideoEnabled ? Colors.white : Colors.red,
                      onPressed: () => callProvider.toggleVideo(),
                    ),

                    // Switch camera
                    _buildControlButton(
                      icon: Icons.flip_camera_ios,
                      color: Colors.white,
                      onPressed: () => callProvider.switchCamera(),
                    ),

                    // Screen share
                    _buildControlButton(
                      icon: callProvider.isScreenSharing
                          ? Icons.stop_screen_share
                          : Icons.screen_share,
                      color: callProvider.isScreenSharing ? Colors.green : Colors.white,
                      onPressed: () => callProvider.toggleScreenShare(),
                    ),

                    // End call button
                    _buildControlButton(
                      icon: Icons.call_end,
                      color: Colors.red,
                      size: 70,
                      onPressed: () {
                        callProvider.endCall();
                        Navigator.pop(context);
                      },
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required Color color,
    required VoidCallback onPressed,
    double size = 60,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.black.withOpacity(0.5),
      ),
      child: IconButton(
        icon: Icon(icon, color: color),
        iconSize: size * 0.5,
        onPressed: onPressed,
      ),
    );
  }

  String _getCallStateText(CallState state) {
    switch (state) {
      case CallState.calling:
        return 'Calling...';
      case CallState.ringing:
        return 'Ringing...';
      case CallState.connecting:
        return 'Connecting...';
      case CallState.connected:
        return 'Connected';
      default:
        return '';
    }
  }
}
```

---

## 🖥️ Screen Sharing

### Android Configuration

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- For screen capture -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
```

### iOS Configuration

Screen sharing on iOS requires **ReplayKit**. The `flutter_webrtc` plugin handles this automatically for broadcast extensions.

### Implementation

The screen sharing is already implemented in the `CallProvider`:

```dart
// In CallProvider
Future<void> toggleScreenShare() async {
  if (_isScreenSharing) {
    await _webrtcService.stopScreenShare();
    _socketService.emit('screen-share:stop', {
      'callId': _currentCall?.callId,
    });
    _isScreenSharing = false;
  } else {
    final screenStream = await _webrtcService.startScreenShare();
    if (screenStream != null) {
      _socketService.emit('screen-share:start', {
        'callId': _currentCall?.callId,
      });
      _isScreenSharing = true;
    }
  }
  notifyListeners();
}
```

---

## 🧪 Testing Guide

### 1. Test Audio Call
```dart
// From your chat screen
await callProvider.initiateCall(
  receiverId: '676a1234567890abcdef1234',
  receiverName: 'John Doe',
  receiverAvatar: 'https://example.com/avatar.jpg',
  callType: CallType.voice,
);

Navigator.push(
  context,
  MaterialPageRoute(builder: (_) => const VoiceCallScreen()),
);
```

### 2. Test Video Call
```dart
await callProvider.initiateCall(
  receiverId: '676a1234567890abcdef1234',
  receiverName: 'John Doe',
  receiverAvatar: 'https://example.com/avatar.jpg',
  callType: CallType.video,
);

Navigator.push(
  context,
  MaterialPageRoute(builder: (_) => const VideoCallScreen()),
);
```

### 3. Test on Multiple Devices
- Device A: Login as `ka@gmail.com`
- Device B: Login as `sok@gmail.com`
- Device A: Initiate call to Device B
- Device B: Should receive incoming call notification

---

## 🚀 Production Checklist

- [ ] Add TURN server for NAT traversal
- [ ] Implement call notifications (Firebase/APNs)
- [ ] Add call history tracking
- [ ] Implement reconnection logic
- [ ] Add network quality indicator
- [ ] Handle background mode (CallKit for iOS)
- [ ] Add recording capability (if needed)
- [ ] Test on various network conditions
- [ ] Implement group calls (mesh or SFU)
- [ ] Add end-to-end encryption

---

## 📚 Resources

- [flutter_webrtc Documentation](https://github.com/flutter-webrtc/flutter-webrtc)
- [WebRTC Basics](https://webrtc.org/getting-started/overview)
- [Socket.io Flutter Client](https://pub.dev/packages/socket_io_client)
- [Your Backend Socket Events](http://YOUR_SERVER:5002/socket.io/)

---

## 🆘 Troubleshooting

### No Audio/Video
- Check permissions in device settings
- Verify microphone/camera access in code
- Check WebRTC constraints

### Connection Issues
- Verify STUN/TURN server configuration
- Check firewall/NAT settings
- Test with public STUN servers first

### Screen Share Not Working
- Android: Ensure `FOREGROUND_SERVICE` permission
- iOS: Check ReplayKit setup
- Verify browser/app supports screen capture

---

**Your backend already supports all WebRTC signaling! Just implement the Flutter frontend following this guide.** 🎉
