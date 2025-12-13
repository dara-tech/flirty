import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';

const VoiceCallWindow = () => {
  const { colors, spacing, typography } = useTheme();
  const styles = getStyles(colors, spacing, typography);
  const {
    caller,
    receiver,
    localStream,
    remoteStream,
    callDuration,
    isMuted,
    isSpeakerEnabled,
    toggleMute,
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
  const displayImage = otherUser?.profilePic;
  const displayInitial = displayName.charAt(0).toUpperCase();
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <View style={styles.container}>
      {/* User Info */}
      <View style={styles.userInfo}>
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{displayInitial}</Text>
          </View>
        )}
        <Text style={styles.name}>{displayName}</Text>
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
    backgroundColor: '#1a1a1a',
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  userInfo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: spacing.lg,
  },
  avatarPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    fontSize: 60,
    color: '#fff',
    fontWeight: 'bold',
  },
  name: {
    fontSize: typography.xl,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: spacing.xs,
  },
  duration: {
    fontSize: typography.base,
    color: '#ccc',
  },
  controls: {
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
    backgroundColor: '#333',
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

export default VoiceCallWindow;
