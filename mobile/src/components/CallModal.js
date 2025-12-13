import React, { useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '../store/useCallStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';

const CallModal = () => {
  const { colors, spacing, typography } = useTheme();
  const styles = getStyles(colors, spacing, typography);
  
  // Use selectors instead of entire store to prevent re-renders
  const callState = useCallStore((state) => state.callState);
  const callType = useCallStore((state) => state.callType);
  const caller = useCallStore((state) => state.caller);
  const receiver = useCallStore((state) => state.receiver);
  const authUser = useAuthStore((state) => state.authUser);
  
  const isIncoming = callState === 'ringing';
  const isRequesting = callState === 'calling';
  
  // Determine which user to display
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return String(id._id);
    return String(id);
  };
  
  const authUserId = authUser ? normalizeId(authUser._id) : null;
  const callerId = caller ? normalizeId(caller.userId) : null;
  const isCurrentUserCaller = callerId === authUserId;
  
  const displayUser = isCurrentUserCaller ? receiver : caller;
  const displayName = displayUser?.fullname || 'Unknown';
  const displayImage = displayUser?.profilePic;
  const displayInitial = displayName.charAt(0).toUpperCase();
  
  useEffect(() => {
    if (isIncoming && !isCurrentUserCaller) {
      const timeout = setTimeout(() => {
        const { rejectCall } = useCallStore.getState();
        rejectCall?.();
      }, 60000);
      return () => clearTimeout(timeout);
    }
  }, [isIncoming, isCurrentUserCaller]); // Remove rejectCall from dependencies
  
  if (callState !== 'calling' && callState !== 'ringing') {
    return null;
  }
  
  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.container}>
        <View style={styles.content}>
          {/* Profile Image */}
          <View style={styles.avatarContainer}>
            {displayImage ? (
              <Image source={{ uri: displayImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{displayInitial}</Text>
              </View>
            )}
          </View>
          
          {/* User Name */}
          <Text style={styles.name}>{displayName}</Text>
          
          {/* Call Type */}
          <Text style={styles.callType}>
            {isRequesting ? 'Calling...' : 'Incoming Call'}
          </Text>
          
          {/* Call Type Icon */}
          <View style={styles.callIconContainer}>
            <Ionicons
              name={callType === 'video' ? 'videocam' : 'call'}
              size={32}
              color={colors.primary}
            />
          </View>
          
          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {isIncoming && !isCurrentUserCaller ? (
              <>
                <TouchableOpacity
                  style={[styles.button, styles.rejectButton]}
                  onPress={() => {
                    const { rejectCall } = useCallStore.getState();
                    rejectCall?.();
                  }}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.answerButton]}
                  onPress={() => {
                    const { answerCall } = useCallStore.getState();
                    answerCall?.();
                  }}
                >
                  <Ionicons name="call" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  const { rejectCall } = useCallStore.getState();
                  rejectCall?.();
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors, spacing, typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  avatarContainer: {
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  name: {
    fontSize: typography.xl,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: spacing.xs,
  },
  callType: {
    fontSize: typography.base,
    color: '#ccc',
    marginBottom: spacing.lg,
  },
  callIconContainer: {
    marginBottom: spacing.xl,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#f44336',
  },
  answerButton: {
    backgroundColor: '#4caf50',
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
});

export default CallModal;
