import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';
import { isWebRTCSupported } from '../lib/webrtc';

// Safely import RTCView - handle case when WebRTC is not available
let RTCView;
try {
  const webrtc = require('react-native-webrtc');
  RTCView = webrtc.RTCView;
} catch (error) {
  // WebRTC not available - create a placeholder component
  RTCView = ({ stream, ...props }) => (
    <View {...props} style={[props.style, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: '#fff' }}>WebRTC not available</Text>
    </View>
  );
}

const VideoCallWindow = () => {
  const { colors, spacing, typography } = useTheme();
  const styles = getStyles(colors, spacing, typography);
  const {
    caller,
    receiver,
    localStream,
    remoteStream,
    callDuration,
    isMuted,
    isVideoEnabled,
    isSpeakerEnabled,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
    endCall,
  } = useCallStore();
  
  const { authUser } = useAuthStore();
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return String(id._id);
    return String(id);
  };
  
  const authUserId = authUser ? normalizeId(authUser._id) : null;
  const callerId = caller ? normalizeId(caller.userId) : null;
  const isCurrentUserCaller = callerId === authUserId;
  const otherUser = isCurrentUserCaller ? receiver : caller;
  
  const displayName = otherUser?.fullname || 'Unknown';
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <View style={styles.container}>
      {/* Remote Video */}
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
        />
      ) : (
        <View style={styles.remoteVideoPlaceholder}>
          <Text style={styles.placeholderText}>{displayName}</Text>
        </View>
      )}
      
      {/* Local Video (Picture-in-Picture) */}
      {localStream && isVideoEnabled && (
        <View style={styles.localVideoContainer}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localVideo}
            objectFit="cover"
            mirror={true}
          />
        </View>
      )}
      
      {/* Call Info Overlay */}
      <View style={styles.overlay}>
        <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
      </View>
      
      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Ionicons
            name={isMuted ? 'mic-off' : 'mic'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={() => endCall('user-ended')}
        >
          <Ionicons name="call" size={24} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
          onPress={toggleVideo}
        >
          <Ionicons
            name={isVideoEnabled ? 'videocam' : 'videocam-off'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.controlButton, isSpeakerEnabled && styles.controlButtonActive]}
          onPress={toggleSpeaker}
        >
          <Ionicons
            name={isSpeakerEnabled ? 'volume-high' : 'volume-low'}
            size={24}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getStyles = (colors, spacing, typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: typography.xl,
    color: '#fff',
  },
  localVideoContainer: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 120,
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  duration: {
    fontSize: typography.base,
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  controls: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: colors.primary,
  },
  endCallButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f44336',
  },
});

export default VideoCallWindow;
