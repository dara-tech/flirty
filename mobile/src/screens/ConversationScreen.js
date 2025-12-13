import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, Image, Alert, ActionSheetIOS, Modal, Dimensions, Linking, Pressable, Clipboard, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCallStore } from '../store/useCallStore';
import { useTheme } from '../theme';
import MessageInput from '../component/MessageInput';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_IMAGE_WIDTH = SCREEN_WIDTH * 0.7;

export default function ConversationScreen({ route, navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const { userId, userName, groupId, groupName, isGroup } = route.params || {};
  const chatStore = useChatStore();
  const authStore = useAuthStore();
  const callStore = useCallStore();
  const allMessages = chatStore?.messages ?? [];
  const authUser = authStore?.authUser ?? null;
  const onlineUsers = authStore?.onlineUsers ?? [];
  const isMessagesLoading = chatStore?.isMessagesLoading ?? false;
  
  // Local state to track if we've started loading (to prevent stuck loading)
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const users = chatStore?.users ?? [];
  const groups = chatStore?.groups ?? [];
  const typingUsers = chatStore?.typingUsers ?? [];
  const flatListRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const [viewingMedia, setViewingMedia] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [audioPosition, setAudioPosition] = useState({});
  const soundRefs = useRef({});
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showMessageMenu, setShowMessageMenu] = useState(false);
  const [showSeenByModal, setShowSeenByModal] = useState(false);
  const [seenByUsers, setSeenByUsers] = useState([]);
  const [seenByMessageInfo, setSeenByMessageInfo] = useState({ seenCount: 0, totalMembers: 0 });
  const typingTimeoutRef = useRef(null);
  const dot1Anim = useRef(new Animated.Value(0.4)).current;
  const dot2Anim = useRef(new Animated.Value(0.4)).current;
  const dot3Anim = useRef(new Animated.Value(0.4)).current;

  // Filter messages for current conversation only
  const messages = React.useMemo(() => {
    if (!authUser?._id) return [];
    
    if (isGroup && groupId) {
      // Group messages - filter by groupId
      const groupIdStr = groupId.toString();
      return allMessages.filter(msg => {
        const msgGroupId = msg.groupId?._id?.toString() || 
                          (typeof msg.groupId === 'object' ? msg.groupId._id?.toString() : msg.groupId?.toString());
        return msgGroupId === groupIdStr;
      });
    } else if (userId) {
      // Direct messages - filter by userId
      const authUserId = authUser._id.toString();
      const targetUserId = userId.toString();
      
      return allMessages.filter(msg => {
        const senderId = msg.sender?._id?.toString() || 
                        (typeof msg.senderId === 'object' ? msg.senderId._id?.toString() : msg.senderId?.toString());
        const receiverId = msg.receiver?._id?.toString() || 
                          (typeof msg.receiverId === 'object' ? msg.receiverId._id?.toString() : msg.receiverId?.toString());
        
        // Message belongs to this conversation if:
        // - sender is current user and receiver is target user, OR
        // - sender is target user and receiver is current user
        return (senderId === authUserId && receiverId === targetUserId) ||
               (senderId === targetUserId && receiverId === authUserId);
      });
    }
    
    return [];
  }, [allMessages, userId, groupId, isGroup, authUser?._id]);

  // Get the other user's data (for profile picture and name)
  const otherUser = users.find(u => u._id?.toString() === userId?.toString());
  
  // Get group data if it's a group chat
  const group = groups.find(g => g._id?.toString() === groupId?.toString());
  
  // Get display name and image
  const displayName = isGroup 
    ? (groupName || group?.name || 'Group')
    : (userName || otherUser?.fullname || 'Chat');
  const displayImage = isGroup 
    ? (group?.groupPic || null)
    : (otherUser?.profilePic || null);
  const displayInitial = displayName.charAt(0).toUpperCase();
  const memberCount = isGroup ? (group?.members?.length || 0) : null;

  // Set audio mode on mount
  useEffect(() => {
    const setAudioMode = async () => {
      try {
        // Add a small delay to ensure audio session is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('Audio mode initialized');
      } catch (error) {
        // Suppress DataDeliveryServices errors (non-critical iOS warnings)
        const errorMessage = error?.message || '';
        if (!errorMessage.includes('DataDeliveryServices') && !errorMessage.includes('queryMetaDataSync')) {
          console.error('Error setting audio mode:', error);
        }
      }
    };
    setAudioMode();
  }, []);

  // Handle audio playback
  const handlePlayAudio = async (audioUrl, messageId) => {
    try {
      console.log('Playing audio:', audioUrl, 'for message:', messageId);
      
      // Stop currently playing audio
      if (playingAudio && soundRefs.current[playingAudio]) {
        try {
          const currentSound = soundRefs.current[playingAudio];
          const status = await currentSound.getStatusAsync();
          if (status.isLoaded) {
            await currentSound.stopAsync();
          }
          await currentSound.unloadAsync();
        } catch (error) {
          console.error('Error stopping previous audio:', error);
        }
        delete soundRefs.current[playingAudio];
      }

      if (!audioUrl) {
        Alert.alert('Error', 'Audio URL is missing');
        return;
      }

      // Ensure audio mode is set
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        console.log('Audio mode set successfully');
      } catch (audioModeError) {
        // Suppress DataDeliveryServices errors (non-critical iOS warnings)
        const errorMessage = audioModeError?.message || '';
        if (!errorMessage.includes('DataDeliveryServices') && !errorMessage.includes('queryMetaDataSync')) {
          console.error('Error setting audio mode:', audioModeError);
        }
      }

      // Clean and validate URL
      let cleanUrl = audioUrl.trim();
      
      // Ensure HTTPS if it's a Cloudinary URL
      if (cleanUrl.startsWith('http://') && cleanUrl.includes('cloudinary')) {
        cleanUrl = cleanUrl.replace('http://', 'https://');
      }

      // Check if it's WebM format (iOS has limited support)
      const isWebM = cleanUrl.toLowerCase().includes('.webm');
      if (isWebM && Platform.OS === 'ios') {
        console.warn('WebM format detected on iOS - may have limited support');
      }

      console.log('Loading audio from URL:', cleanUrl);
      console.log('Platform:', Platform.OS);

      // Create new sound instance
      const sound = new Audio.Sound();
      soundRefs.current[messageId] = sound;

      // Load the audio with timeout
      try {
        console.log('Calling loadAsync...');
        
        // Add timeout to prevent hanging
        const loadPromise = sound.loadAsync({ uri: cleanUrl });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Audio load timeout')), 10000)
        );
        
        await Promise.race([loadPromise, timeoutPromise]);
        console.log('loadAsync completed');
      } catch (loadError) {
        console.error('Error loading audio:', loadError);
        console.error('Load error details:', {
          message: loadError.message,
          code: loadError.code,
          stack: loadError.stack,
        });
        Alert.alert('Error', `Failed to load audio: ${loadError.message || 'Unknown error'}`);
        delete soundRefs.current[messageId];
        return;
      }

      // Check if loaded - wait a bit for status to update
      await new Promise(resolve => setTimeout(resolve, 100));
      const loadStatus = await sound.getStatusAsync();
      console.log('Load status:', JSON.stringify(loadStatus, null, 2));
      
      if (!loadStatus.isLoaded) {
        if (loadStatus.error) {
          console.error('Audio load error:', loadStatus.error);
          Alert.alert('Error', `Audio format not supported: ${loadStatus.error}`);
        } else {
          console.warn('Audio not loaded, waiting more...');
          // Wait a bit more
          await new Promise(resolve => setTimeout(resolve, 500));
          const retryStatus = await sound.getStatusAsync();
          console.log('Retry load status:', JSON.stringify(retryStatus, null, 2));
          
          if (!retryStatus.isLoaded) {
            Alert.alert('Error', 'Audio format may not be supported or file is corrupted');
            await sound.unloadAsync();
            delete soundRefs.current[messageId];
            return;
          }
        }
      }
      
      console.log('Audio is loaded, proceeding to play...');

      // Set up playback status updates BEFORE playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          if (status.isPlaying) {
            const progress = status.durationMillis > 0 
              ? status.positionMillis / status.durationMillis 
              : 0;
            
            setAudioPosition(prev => ({
              ...prev,
              [messageId]: progress,
            }));
          }

          if (status.didJustFinish) {
            console.log('Audio finished playing');
            setPlayingAudio(null);
            setAudioPosition(prev => ({
              ...prev,
              [messageId]: 0,
            }));
            // Cleanup
            if (soundRefs.current[messageId]) {
              soundRefs.current[messageId].unloadAsync().catch(err => console.error('Error unloading:', err));
              delete soundRefs.current[messageId];
            }
          }
        } else if (status.error) {
          console.error('Audio playback error:', status.error);
          Alert.alert('Error', `Unable to play audio: ${status.error}`);
          setPlayingAudio(null);
          if (soundRefs.current[messageId]) {
            soundRefs.current[messageId].unloadAsync().catch(err => console.error('Error unloading:', err));
            delete soundRefs.current[messageId];
          }
        }
      });
      
      // Start playback
      console.log('Starting audio playback...');
      setPlayingAudio(messageId);
      
      try {
        console.log('Calling playAsync()...');
        const playResult = await sound.playAsync();
        console.log('playAsync() result:', playResult);
        
        // Check status immediately
        const immediateStatus = await sound.getStatusAsync();
        console.log('Immediate status after playAsync:', JSON.stringify(immediateStatus, null, 2));
        
        // Verify playback started after a short delay
        setTimeout(async () => {
          try {
            const verifyStatus = await sound.getStatusAsync();
            console.log('Verification status (300ms later):', JSON.stringify(verifyStatus, null, 2));
            if (verifyStatus.isLoaded && !verifyStatus.isPlaying && !verifyStatus.didJustFinish) {
              console.warn('Audio loaded but not playing, attempting to restart...');
              await sound.playAsync();
              
              const retryStatus = await sound.getStatusAsync();
              console.log('Retry playback status:', JSON.stringify(retryStatus, null, 2));
            } else if (verifyStatus.isPlaying) {
              console.log('✅ Audio is playing successfully!');
            }
          } catch (verifyError) {
            console.error('Error verifying playback:', verifyError);
          }
        }, 300);
        
        console.log('Audio playback initiated');
      } catch (playError) {
        console.error('Error starting playback:', playError);
        console.error('Play error details:', JSON.stringify(playError, null, 2));
        Alert.alert('Error', `Failed to start playback: ${playError.message || 'Unknown error'}`);
        setPlayingAudio(null);
        try {
          await sound.unloadAsync();
        } catch (unloadErr) {
          console.error('Error unloading:', unloadErr);
        }
        delete soundRefs.current[messageId];
        return;
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      const errorMsg = error.message || 'Unknown error';
      Alert.alert('Error', `Unable to play audio message: ${errorMsg}`);
      setPlayingAudio(null);
      if (soundRefs.current[messageId]) {
        try {
          await soundRefs.current[messageId].unloadAsync();
        } catch (unloadError) {
          console.error('Error unloading failed audio:', unloadError);
        }
        delete soundRefs.current[messageId];
      }
    }
  };

  const handleStopAudio = async (messageId) => {
    if (soundRefs.current[messageId]) {
      try {
        const sound = soundRefs.current[messageId];
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
        }
        await sound.unloadAsync();
      } catch (error) {
        console.error('Error stopping audio:', error);
      } finally {
        delete soundRefs.current[messageId];
        setPlayingAudio(null);
        setAudioPosition(prev => ({
          ...prev,
          [messageId]: 0,
        }));
      }
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      Object.values(soundRefs.current).forEach(async (sound) => {
        try {
          await sound.unloadAsync();
        } catch (error) {
          console.error('Error cleaning up audio:', error);
        }
      });
    };
  }, []);

  // Fetch messages and users/groups when screen loads
  useEffect(() => {
    // Reset loading state when params change
    setHasStartedLoading(false);
    
    // Immediately clear loading state when params change to prevent stuck state
    // This is especially important in production builds
    useChatStore.setState({ isMessagesLoading: false });
    
    if (isGroup && groupId) {
      // Group chat - fetch group messages
      setHasStartedLoading(true);
      // getGroupMessages will set isMessagesLoading and handle messages
      chatStore.getGroupMessages(groupId).catch((error) => {
        // Ensure loading state is cleared even if promise rejects unexpectedly
        console.error('Error in getGroupMessages:', error);
        useChatStore.setState({ isMessagesLoading: false });
      });
      if (groups.length === 0) {
        chatStore.getGroups();
      }
    } else if (userId) {
      // Direct chat - fetch user messages
      setHasStartedLoading(true);
      // getMessages will set isMessagesLoading and handle messages
      chatStore.getMessages(userId).catch((error) => {
        // Ensure loading state is cleared even if promise rejects unexpectedly
        console.error('Error in getMessages:', error);
        useChatStore.setState({ isMessagesLoading: false });
      });
      if (users.length === 0) {
        chatStore.getUsers();
      }
    } else {
      // No valid params - clear loading state
      useChatStore.setState({ isMessagesLoading: false });
    }
    
    // Safety timeout: Clear loading state after 8 seconds if still loading (more aggressive)
    // The store has a 12-second timeout, so this provides an additional layer
    const safetyTimeout = setTimeout(() => {
      const currentLoading = useChatStore.getState().isMessagesLoading;
      if (currentLoading) {
        console.warn('⚠️ ConversationScreen: Loading timeout - force clearing loading state');
        useChatStore.setState({ isMessagesLoading: false });
      }
    }, 8000);
    
    // Cleanup: clear timeout when leaving screen
    // Don't clear messages here - let the next screen's useEffect handle it
    return () => {
      clearTimeout(safetyTimeout);
      setHasStartedLoading(false);
      // Also clear loading state when leaving screen to prevent stuck state
      useChatStore.setState({ isMessagesLoading: false });
    };
  }, [userId, groupId, isGroup]);
  
  // Additional safety: Clear loading if it's been true for too long
  // This watches the loading state and ensures it never stays true for more than 10 seconds
  useEffect(() => {
    if (isMessagesLoading) {
      const clearLoadingTimeout = setTimeout(() => {
        const currentLoading = useChatStore.getState().isMessagesLoading;
        if (currentLoading) {
          console.warn('⚠️ ConversationScreen: Loading state stuck - force clearing');
          useChatStore.setState({ isMessagesLoading: false });
        }
      }, 10000); // 10 seconds max
      
      return () => clearTimeout(clearLoadingTimeout);
    }
  }, [isMessagesLoading]);

  // Animate typing dots
  useEffect(() => {
    if (!isTyping) {
      // Reset animations when not typing
      dot1Anim.setValue(0.4);
      dot2Anim.setValue(0.4);
      dot3Anim.setValue(0.4);
      return;
    }

    // Create staggered animation for typing dots
    const createAnimation = (animValue, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0.4,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = createAnimation(dot1Anim, 0);
    const anim2 = createAnimation(dot2Anim, 200);
    const anim3 = createAnimation(dot3Anim, 400);

    Animated.parallel([anim1, anim2, anim3]).start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [isTyping]);

  // Mark messages as seen when viewing conversation
  useEffect(() => {
    const socket = authStore?.socket;
    if (!socket || !authUser) return;

    if (isGroup && groupId) {
      // Group messages - mark as seen
      const markGroupMessagesAsSeen = () => {
        const currentUserId = authUser._id?.toString();
        const unreadMessages = messages.filter(msg => {
          // Check if current user has already seen this message
          const seenBy = msg.seenBy || [];
          const hasSeen = seenBy.some(seen => {
            const seenUserId = seen.userId?._id?.toString() || 
                             (typeof seen.userId === 'object' ? seen.userId._id?.toString() : seen.userId?.toString());
            return seenUserId === currentUserId;
          });
          return !hasSeen;
        });

        unreadMessages.forEach(msg => {
          if (socket && socket.connected) {
            socket.emit('groupMessageSeen', {
              messageId: msg._id,
              groupId: groupId,
            });
          }
        });
      };

      if (messages.length > 0) {
        markGroupMessagesAsSeen();
      }
    } else if (userId) {
      // Direct messages - mark as seen
      const markMessagesAsSeen = () => {
        const unreadMessages = messages.filter(msg => {
          const senderId = msg.sender?._id?.toString() || 
                          (typeof msg.senderId === 'object' ? msg.senderId._id?.toString() : msg.senderId?.toString());
          const currentUserId = authUser._id?.toString();
          return senderId === userId && senderId !== currentUserId && !msg.seen;
        });

        unreadMessages.forEach(msg => {
          if (socket && socket.connected) {
            socket.emit('messageSeen', {
              messageId: msg._id,
              senderId: userId,
            });
          }
        });
      };

      if (messages.length > 0) {
        markMessagesAsSeen();
      }
    }
  }, [messages, userId, groupId, isGroup, authStore?.socket, authUser]);

  // Subscribe to socket events for real-time messages
  useEffect(() => {
    const socket = authStore?.socket;
    if (!socket || !userId) return;

    const handleNewMessage = (message) => {
      const currentUserId = authUser?._id?.toString();
      
      if (isGroup && groupId) {
        // Group message - check if it's for this group
        const msgGroupId = message.groupId?._id?.toString() || 
                          (typeof message.groupId === 'object' ? message.groupId._id?.toString() : message.groupId?.toString());
        if (msgGroupId === groupId?.toString()) {
          chatStore.addMessage(message);
          // Scroll to bottom when new message arrives
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      } else if (userId) {
        // Direct message - only add if it's for this conversation
        const senderId = message.sender?._id?.toString() || message.senderId?.toString();
        const receiverId = message.receiver?._id?.toString() || message.receiverId?.toString();
        
        if ((senderId === userId || receiverId === userId) && 
            (senderId === currentUserId || receiverId === currentUserId)) {
          chatStore.addMessage(message);
          
          // Mark as seen if it's from the other user
          if (senderId === userId && senderId !== currentUserId && !message.seen) {
            setTimeout(() => {
              if (socket && socket.connected) {
                socket.emit('messageSeen', {
                  messageId: message._id,
                  senderId: userId,
                });
              }
            }, 500); // Small delay to ensure message is saved
          }
          
          // Scroll to bottom when new message arrives
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    };

    const handleTyping = (data) => {
      if (isGroup && groupId) {
        // Group typing - check if it's for this group
        const msgGroupId = data.groupId?.toString();
        if (msgGroupId === groupId?.toString()) {
          setIsTyping(true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 5000);
        }
      } else if (userId) {
        // Direct message typing - check if it matches our userId
        const senderId = data.senderId?.toString() || data.userId?.toString();
        const currentUserId = userId?.toString();
        
        if (senderId === currentUserId) {
          setIsTyping(true);
          // Clear any existing timeout
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          // Auto-hide typing indicator after 5 seconds of no updates
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 5000);
        }
      }
    };

    const handleStopTyping = (data) => {
      if (isGroup && groupId) {
        const msgGroupId = data.groupId?.toString();
        if (msgGroupId === groupId?.toString()) {
          setIsTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
        }
      } else if (userId) {
        const senderId = data.senderId?.toString() || data.userId?.toString();
        const currentUserId = userId?.toString();
        
        if (senderId === currentUserId) {
          setIsTyping(false);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
        }
      }
    };

    const handleMessageSeenUpdate = ({ messageId, seenAt }) => {
      // Update message seen status in local state (for direct messages)
      chatStore.updateMessageSeen(messageId, seenAt);
    };

    const handleGroupMessageSeenUpdate = ({ messageId, groupId: msgGroupId, seenBy, userId: seenUserId }) => {
      // Update group message seenBy in local state
      if (isGroup && msgGroupId?.toString() === groupId?.toString()) {
        chatStore.updateGroupMessageSeenBy(messageId, seenBy);
      }
    };

    const handleGroupTyping = (data) => {
      if (isGroup && groupId && data.groupId?.toString() === groupId?.toString()) {
        setIsTyping(true);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
        }, 5000);
      }
    };

    const handleGroupStopTyping = (data) => {
      if (isGroup && groupId && data.groupId?.toString() === groupId?.toString()) {
        setIsTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }
    };

    socket.on('newMessage', handleNewMessage);
    socket.on('typing', handleTyping);
    socket.on('stopTyping', handleStopTyping);
      socket.on('groupTyping', handleGroupTyping);
      socket.on('groupStopTyping', handleGroupStopTyping);
      socket.on('messageSeenUpdate', handleMessageSeenUpdate);
      socket.on('groupMessageSeenUpdate', handleGroupMessageSeenUpdate);

    // Cleanup
    return () => {
      socket.off('newMessage', handleNewMessage);
      socket.off('typing', handleTyping);
      socket.off('stopTyping', handleStopTyping);
      socket.off('groupTyping', handleGroupTyping);
      socket.off('groupStopTyping', handleGroupStopTyping);
      socket.off('messageSeenUpdate', handleMessageSeenUpdate);
      socket.off('groupMessageSeenUpdate', handleGroupMessageSeenUpdate);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [userId, groupId, isGroup, authStore?.socket, authUser]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const formatMessageTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isToday(date)) {
        return format(date, 'HH:mm');
      } else if (isYesterday(date)) {
        return 'Yesterday';
      } else {
        return format(date, 'MMM d, yyyy');
      }
    } catch (error) {
      return '';
    }
  };

  const isCallMessage = (text) => {
    return text && (
      text.includes('Video call') || 
      text.includes('Call') ||
      text.includes('📞')
    );
  };

  // Read receipt component for direct messages
  const ReadReceipt = ({ message, isOwnMessage }) => {
    if (!isOwnMessage || isGroup) return null;
    
    return (
      <View style={styles.readReceiptContainer}>
        <Text style={styles.messageTimeSmall}>
          {formatMessageTime(message.createdAt)}
        </Text>
        <Ionicons 
          name={message.seen ? "checkmark-done" : "checkmark"} 
          size={12} 
          color={message.seen ? "#4FC3F7" : "rgba(255, 255, 255, 0.7)"} 
          style={styles.readReceipt}
        />
      </View>
    );
  };

  // Group message seen by component
  const GroupSeenBy = ({ message, isOwnMessage }) => {
    if (!isGroup || !isOwnMessage) return null;
    
    const seenBy = message.seenBy || [];
    const currentUserId = authUser?._id?.toString();
    const otherMembers = group?.members || [];
    const allMembers = group?.admin ? [group.admin, ...otherMembers] : otherMembers;
    
    // Filter out current user from members list
    const otherMembersList = allMembers.filter(m => {
      const memberId = m?._id?.toString() || m?.toString();
      return memberId !== currentUserId;
    });
    
    // Get seen by users with their profile data
    const seenByUsers = seenBy
      .map(seen => {
        const seenUserId = seen.userId?._id?.toString() || 
                         (typeof seen.userId === 'object' ? seen.userId._id?.toString() : seen.userId?.toString());
        const user = seen.userId && typeof seen.userId === 'object' 
          ? seen.userId 
          : otherMembersList.find(m => {
              const memberId = m?._id?.toString() || m?.toString();
              return memberId === seenUserId;
            });
        return user ? { ...user, seenAt: seen.seenAt } : null;
      })
      .filter(Boolean);
    
    const seenCount = seenByUsers.length;
    const totalMembers = otherMembersList.length;
    
    if (seenCount === 0 && totalMembers > 0) {
      // Show "0/X seen" if no one has seen yet
      return (
        <View style={styles.groupSeenByContainer}>
          <Text style={styles.groupSeenByText}>
            {`0/${totalMembers} seen`}
          </Text>
        </View>
      );
    }
    
    if (seenCount === 0) return null;
    
    return (
      <TouchableOpacity
        style={styles.groupSeenByContainer}
        onPress={() => {
          // Show modal with all seen by users
          setSeenByUsers(seenByUsers);
          setSeenByMessageInfo({ seenCount, totalMembers });
          setShowSeenByModal(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.groupSeenByAvatars}>
          {seenByUsers.slice(0, 3).map((user, idx) => {
            const hasProfilePic = user.profilePic && user.profilePic.trim() !== '';
            return (
              <View key={idx} style={[styles.groupSeenByAvatar, { marginLeft: idx > 0 ? -8 : 0 }]}>
                {hasProfilePic ? (
                  <Image
                    source={{ uri: user.profilePic }}
                    style={styles.groupSeenByAvatarImage}
                  />
                ) : (
                  <View style={styles.groupSeenByAvatarPlaceholder}>
                    <Text style={styles.groupSeenByAvatarText}>
                      {(user.fullname || user.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          {seenCount > 3 && (
            <View style={[styles.groupSeenByAvatar, styles.groupSeenByAvatarMore, { marginLeft: -8 }]}>
              <Text style={styles.groupSeenByAvatarMoreText}>+{seenCount - 3}</Text>
            </View>
          )}
        </View>
        <Text style={styles.groupSeenByText}>
          {seenCount === totalMembers ? 'All seen' : `${seenCount}/${totalMembers} seen`}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item, index }) => {
    // Get sender ID (handle both object and string formats)
    const senderId = item.sender?._id?.toString() || 
                    (typeof item.senderId === 'object' ? item.senderId._id?.toString() : item.senderId?.toString());
    
    // Find sender from users array
    const messageSender = item.sender || users.find(u => u._id?.toString() === senderId);
    
    const isOwnMessage = senderId === authUser?._id?.toString();
    
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const prevSenderId = prevMessage?.sender?._id?.toString() || 
                        (typeof prevMessage?.senderId === 'object' ? prevMessage.senderId._id?.toString() : prevMessage?.senderId?.toString());
    const prevIsOwn = prevSenderId === authUser?._id?.toString();
    const isConsecutive = prevIsOwn === isOwnMessage && prevMessage && prevSenderId === senderId;
    const showSenderName = !isOwnMessage && !isConsecutive;
    
    const callMessage = isCallMessage(item.text);
    // Remove emoji from call messages for display
    const displayText = callMessage && item.text ? item.text.replace(/📞\s*/g, '').trim() : item.text;
    
    return (
      <View
        style={[
          styles.messageWrapper,
          isOwnMessage ? styles.ownMessageWrapper : styles.otherMessageWrapper,
        ]}
      >
        
        <View style={styles.messageContentWrapper}>
          {!isOwnMessage && !isConsecutive && messageSender && (
            <View style={styles.messageAvatarContainer}>
              {messageSender.profilePic ? (
                <Image
                  source={{ uri: messageSender.profilePic }}
                  style={styles.messageAvatar}
                />
              ) : (
                <View style={styles.messageAvatarPlaceholder}>
                  <Text style={styles.messageAvatarText}>
                    {(messageSender.fullname || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {isOwnMessage && !isConsecutive && (
            <View style={styles.messageAvatarSpacer} />
          )}

          {item.image ? (
          <View>
            <TouchableOpacity
              style={[
                styles.imageMessageContainer,
                isOwnMessage ? styles.ownImageContainer : styles.otherImageContainer,
              ]}
              onPress={() => setViewingMedia({ type: 'image', url: item.image })}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri: item.image }}
                style={styles.messageImage}
                resizeMode="cover"
              />
              {item.text && (
                <View style={styles.imageTextOverlay}>
                  <Text style={styles.imageText}>
                    {isCallMessage(item.text) ? item.text.replace(/📞\s*/g, '').trim() : item.text}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {isOwnMessage && (
              isGroup ? (
                <GroupSeenBy message={item} isOwnMessage={isOwnMessage} />
              ) : (
                <ReadReceipt message={item} isOwnMessage={isOwnMessage} />
              )
            )}
          </View>
        ) : item.file ? (
          <View>
            <TouchableOpacity
              style={[
                styles.messageBubble,
                isOwnMessage ? styles.ownBubble : styles.otherBubble,
                styles.fileBubble,
              ]}
              onPress={() => {
                if (item.file) {
                  Linking.openURL(item.file).catch(err => {
                    Alert.alert('Error', 'Unable to open file');
                  });
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.fileContainer}>
                <Ionicons 
                  name="document" 
                  size={32} 
                  color={isOwnMessage ? colors.textWhite : colors.primary} 
                />
                <View style={styles.fileInfo}>
                  <Text
                    style={[
                      styles.fileName,
                      isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
                    ]}
                    numberOfLines={1}
                  >
                    {item.fileName || 'File'}
                  </Text>
                  {item.fileSize && (
                    <Text
                      style={[
                        styles.fileSize,
                        isOwnMessage ? styles.ownFileSize : styles.otherFileSize,
                      ]}
                    >
                      {(item.fileSize / 1024).toFixed(2)} KB
                    </Text>
                  )}
                </View>
                <Ionicons
                  name="download-outline"
                  size={20}
                  color={isOwnMessage ? colors.textWhite : commonStyles.textSecondary}
                />
              </View>
              {item.text && (
                <View style={[
                  styles.fileTextContainer,
                  isOwnMessage && styles.ownFileTextContainer
                ]}>
                  <Text
                    style={[
                      styles.messageText,
                      isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
                    ]}
                  >
                    {isCallMessage(item.text) ? item.text.replace(/📞\s*/g, '').trim() : item.text}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {isOwnMessage && (
              <ReadReceipt message={item} isOwnMessage={isOwnMessage} />
            )}
          </View>
        ) : item.audio ? (
          <View>
            <View
              style={[
                styles.messageBubble,
                isOwnMessage ? styles.ownBubble : styles.otherBubble,
                styles.audioBubble,
              ]}
            >
            <TouchableOpacity
              style={styles.audioContainer}
              onPress={async () => {
                if (playingAudio === item._id) {
                  // Pause or stop
                  const sound = soundRefs.current[item._id];
                  if (sound) {
                    try {
                      const status = await sound.getStatusAsync();
                      if (status.isLoaded && status.isPlaying) {
                        await sound.pauseAsync();
                        setPlayingAudio(null);
                      } else {
                        await handleStopAudio(item._id);
                      }
                    } catch (error) {
                      console.error('Error pausing audio:', error);
                      await handleStopAudio(item._id);
                    }
                  } else {
                    await handleStopAudio(item._id);
                  }
                } else {
                  // Play
                  const audioUrl = item.audio;
                  console.log('Audio message data:', {
                    messageId: item._id,
                    hasAudio: !!audioUrl,
                    audioUrl: audioUrl,
                    audioType: typeof audioUrl,
                  });
                  
                  if (audioUrl) {
                    await handlePlayAudio(audioUrl, item._id);
                  } else {
                    console.error('Audio URL is missing for message:', item._id);
                    Alert.alert('Error', 'Audio URL is missing');
                  }
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[
                styles.audioIconContainer,
                isOwnMessage ? styles.ownAudioIcon : styles.otherAudioIcon
              ]}>
                <Ionicons
                  name={playingAudio === item._id ? "pause" : "play"}
                  size={20}
                  color={isOwnMessage ? colors.textWhite : colors.primary}
                />
              </View>
              
              <View style={[
                styles.audioWaveform,
                isOwnMessage && styles.ownAudioWaveformBg
              ]}>
                <View style={[
                  styles.audioWaveformBar,
                  { width: `${(audioPosition[item._id] || 0) * 100}%` },
                  isOwnMessage ? styles.ownAudioWaveform : styles.otherAudioWaveform
                ]} />
              </View>
              
              <Ionicons
                name="mic"
                size={18}
                color={isOwnMessage ? colors.textWhite : commonStyles.textSecondary}
                style={styles.audioMicIcon}
              />
            </TouchableOpacity>
            
            {item.text && (
              <View style={[
                styles.audioTextContainer,
                isOwnMessage && styles.ownAudioTextContainer
              ]}>
                <Text
                  style={[
                    styles.messageText,
                    isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
                  ]}
                >
                  {isCallMessage(item.text) ? item.text.replace(/📞\s*/g, '').trim() : item.text}
                </Text>
              </View>
            )}
            </View>
            {isOwnMessage && (
              <ReadReceipt message={item} isOwnMessage={isOwnMessage} />
            )}
          </View>
        ) : (
          <Pressable
            style={[
              styles.messageBubble,
              isOwnMessage ? styles.ownBubble : styles.otherBubble,
              isConsecutive && styles.consecutiveBubble,
            ]}
            onLongPress={(e) => handleLongPress(item, e)}
            delayLongPress={400}
          >
            <Text
              style={[
                styles.messageText,
                isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
              ]}
              allowFontScaling={true}
            >
              {displayText}
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[
                styles.messageTime,
                isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime
              ]}>
                {formatMessageTime(item.createdAt)}
              </Text>
              {isOwnMessage && (
                <Ionicons 
                  name={item.seen ? "checkmark-done" : "checkmark"} 
                  size={14} 
                  color={item.seen ? "#4FC3F7" : "rgba(255, 255, 255, 0.7)"} 
                  style={styles.readReceipt}
                />
              )}
            </View>
          </Pressable>
        )}
        </View>
        
      </View>
    );
  };

  const handleSendMessage = async (text, imageUri = null, fileUri = null, audioUri = null) => {
    if ((!text?.trim() && !imageUri && !fileUri && !audioUri)) return;
    if (!userId && !groupId) return;
    
    try {
      if (editingMessage) {
        // Edit existing message
        await chatStore.editMessage(editingMessage._id, text);
        setEditingMessage(null);
      } else {
        // Send new message
        if (isGroup && groupId) {
          await chatStore.sendGroupMessage(groupId, text, imageUri, fileUri, audioUri);
        } else if (userId) {
          await chatStore.sendMessage(userId, text, imageUri, fileUri, audioUri);
        }
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      const errorMessage = error?.message || 'Failed to send message. Please try again.';
      
      // Show more specific error messages
      if (errorMessage.includes('audio') || errorMessage.includes('Audio')) {
        Alert.alert(
          'Voice Message Error',
          errorMessage + '\n\nPlease try recording again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    }
  };

  const handleLongPress = (message, event) => {
    const senderId = message.sender?._id?.toString() || 
                    (typeof message.senderId === 'object' ? message.senderId._id?.toString() : message.senderId?.toString());
    const isOwnMessage = senderId === authUser?._id?.toString();
    
    setSelectedMessage(message);
    const { pageX, pageY } = event.nativeEvent;
    setMenuPosition({ x: pageX, y: pageY });
    setShowMessageMenu(true);
  };

  const handleEditMessage = () => {
    if (selectedMessage) {
      setEditingMessage(selectedMessage);
      setShowMessageMenu(false);
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatStore.deleteMessage(selectedMessage._id);
              setShowMessageMenu(false);
              setSelectedMessage(null);
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message.');
            }
          },
        },
      ]
    );
  };

  const handleCopyMessage = () => {
    if (selectedMessage?.text) {
      Clipboard.setString(selectedMessage.text);
      setShowMessageMenu(false);
      setSelectedMessage(null);
      // Show toast-like feedback
      Alert.alert('', 'Message copied to clipboard');
    }
  };

  const handleReplyMessage = () => {
    // TODO: Implement reply functionality
    setShowMessageMenu(false);
    setSelectedMessage(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
  };

  const handleVoiceCall = async () => {
    if (!userId) return;
    
    try {
      await callStore.initiateCall(userId, 'voice');
    } catch (error) {
      console.error('Error initiating call:', error);
      Alert.alert('Error', error.message || 'Failed to start call. Please try again.');
    }
  };

  const handleVideoCall = async () => {
    if (!userId) return;
    
    try {
      await callStore.initiateCall(userId, 'video');
    } catch (error) {
      console.error('Error initiating video call:', error);
      Alert.alert('Error', error.message || 'Failed to start video call. Please try again.');
    }
  };

  const handleMoreActions = () => {
    const options = [
      'View Profile',
      'Search in Conversation',
      'Mute Notifications',
      'Clear Chat',
      'Cancel',
    ];
    const cancelButtonIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            // View Profile
            Alert.alert('Profile', `Viewing profile of ${userName || otherUser?.fullname || 'User'}`);
          } else if (buttonIndex === 1) {
            // Search
            Alert.alert('Search', 'Search functionality coming soon');
          } else if (buttonIndex === 2) {
            // Mute
            Alert.alert('Mute', 'Mute notifications for this conversation');
          } else if (buttonIndex === 3) {
            // Clear Chat
            Alert.alert(
              'Clear Chat',
              'Are you sure you want to clear all messages?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: () => {
                    // TODO: Implement clear chat
                    Alert.alert('Success', 'Chat cleared');
                  },
                },
              ]
            );
          }
        }
      );
    } else {
      // Android
      Alert.alert(
        'More Options',
        'Choose an action',
        [
          { text: 'View Profile', onPress: () => Alert.alert('Profile', `Viewing profile of ${userName || otherUser?.fullname || 'User'}`) },
          { text: 'Search', onPress: () => Alert.alert('Search', 'Search functionality coming soon') },
          { text: 'Mute', onPress: () => Alert.alert('Mute', 'Mute notifications for this conversation') },
          { text: 'Clear Chat', onPress: () => Alert.alert('Clear Chat', 'Clear chat functionality coming soon') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={commonStyles.textPrimary} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerUserInfo}
          onPress={() => {
            // Navigate to user/group detail screen
            if (isGroup) {
              navigation.navigate('GroupDetail', { groupId });
            } else {
              navigation.navigate('UserDetail', { userId });
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            {displayImage ? (
              <Image
                source={{ uri: displayImage }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, isGroup && styles.groupAvatarPlaceholder]}>
                {isGroup ? (
                  <Ionicons name="people" size={20} color={colors.textWhite} />
                ) : (
                  <Text style={styles.avatarText}>
                    {displayInitial}
                  </Text>
                )}
              </View>
            )}
          </View>
          <View style={styles.headerNameContainer}>
            <Text style={styles.headerText} numberOfLines={1}>
              {displayName}
            </Text>
            {isGroup ? (
              <Text style={styles.headerSubtext} numberOfLines={1}>
                {memberCount || 0} {memberCount === 1 ? 'member' : 'members'}
              </Text>
            ) : otherUser ? (
              <Text style={styles.headerSubtext} numberOfLines={1}>
                {onlineUsers.includes(userId?.toString()) ? 'Online' : 'Offline'}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleVoiceCall}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={22} color={commonStyles.textPrimary} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleVideoCall}
            activeOpacity={0.7}
          >
            <Ionicons name="videocam" size={22} color={commonStyles.textPrimary} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleMoreActions}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={commonStyles.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {isMessagesLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id?.toString() || Math.random().toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          }
        />
      )}

      {isTyping && (
        <View style={styles.typingIndicator}>
          <View style={styles.typingBubble}>
            <View style={styles.typingDots}>
              <Animated.View 
                style={[
                  styles.typingDot, 
                  { 
                    opacity: dot1Anim,
                    transform: [{ scale: dot1Anim }]
                  }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.typingDot, 
                  { 
                    opacity: dot2Anim,
                    transform: [{ scale: dot2Anim }]
                  }
                ]} 
              />
              <Animated.View 
                style={[
                  styles.typingDot, 
                  { 
                    opacity: dot3Anim,
                    transform: [{ scale: dot3Anim }]
                  }
                ]} 
              />
            </View>
          </View>
          <Text style={styles.typingText}>
            {isGroup 
              ? 'Someone is typing...' 
              : `${userName || otherUser?.fullname || 'Someone'} is typing`}
          </Text>
        </View>
      )}

      <MessageInput 
        onSend={handleSendMessage} 
        receiverId={isGroup ? null : userId}
        groupId={isGroup ? groupId : null}
        editingMessage={editingMessage}
        onCancelEdit={cancelEdit}
      />

      {/* Media Viewer Modal */}
      {viewingMedia && (
        <Modal
          visible={!!viewingMedia}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setViewingMedia(null)}
        >
          <View style={styles.mediaModalOverlay}>
            <TouchableOpacity
              style={styles.mediaModalCloseButton}
              onPress={() => setViewingMedia(null)}
            >
              <Ionicons name="close" size={28} color={colors.textWhite} />
            </TouchableOpacity>
            
            {viewingMedia.type === 'image' && (
              <Image
                source={{ uri: viewingMedia.url }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      )}

      {/* Message Menu Modal */}
      <Modal
        visible={showMessageMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageMenu(false)}
      >
        <Pressable 
          style={styles.menuOverlay}
          onPress={() => setShowMessageMenu(false)}
        >
          <View style={[
            styles.messageMenu,
            { 
              top: menuPosition.y - 100,
              left: menuPosition.x > SCREEN_WIDTH / 2 ? menuPosition.x - 180 : menuPosition.x - 20
            }
          ]}>
            {selectedMessage && (() => {
              const senderId = selectedMessage.sender?._id?.toString() || 
                              (typeof selectedMessage.senderId === 'object' ? selectedMessage.senderId._id?.toString() : selectedMessage.senderId?.toString());
              const isOwnMessage = senderId === authUser?._id?.toString();
              
              return (
                <>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={handleCopyMessage}
                  >
                    <Ionicons name="copy-outline" size={20} color={commonStyles.textPrimary} />
                    <Text style={styles.menuItemText}>Copy</Text>
                  </TouchableOpacity>
                  
                  {isOwnMessage && (
                    <>
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={handleEditMessage}
                      >
                        <Ionicons name="create-outline" size={20} color={commonStyles.textPrimary} />
                        <Text style={styles.menuItemText}>Edit</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.menuItem}
                        onPress={handleDeleteMessage}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                        <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={handleReplyMessage}
                  >
                    <Ionicons name="arrow-undo-outline" size={20} color={commonStyles.textPrimary} />
                    <Text style={styles.menuItemText}>Reply</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* Seen By Modal */}
      <Modal
        visible={showSeenByModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSeenByModal(false)}
      >
        <Pressable 
          style={styles.seenByModalOverlay}
          onPress={() => setShowSeenByModal(false)}
        >
          <Pressable style={styles.seenByModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.seenByModalHeader}>
              <Text style={styles.seenByModalTitle}>Seen by</Text>
              <TouchableOpacity
                style={styles.seenByModalCloseButton}
                onPress={() => setShowSeenByModal(false)}
              >
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.seenByModalSubtitle}>
              {seenByMessageInfo.seenCount === seenByMessageInfo.totalMembers
                ? `All ${seenByMessageInfo.totalMembers} members have seen this message`
                : `${seenByMessageInfo.seenCount} of ${seenByMessageInfo.totalMembers} members have seen this message`}
            </Text>

            <FlatList
              data={seenByUsers}
              keyExtractor={(item, index) => item._id?.toString() || index.toString()}
              renderItem={({ item: user }) => {
                const hasProfilePic = user.profilePic && user.profilePic.trim() !== '';
                const userName = user.fullname || user.name || 'Unknown User';
                const userId = user._id?.toString();
                
                return (
                  <TouchableOpacity
                    style={styles.seenByUserItem}
                    onPress={() => {
                      setShowSeenByModal(false);
                      if (userId && navigation) {
                        chatStore.setSelectedUser(user);
                        chatStore.getMessages(userId);
                        navigation.navigate('Conversation', {
                          userId: userId,
                          userName: userName
                        });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.seenByUserAvatar}>
                      {hasProfilePic ? (
                        <Image
                          source={{ uri: user.profilePic }}
                          style={styles.seenByUserAvatarImage}
                        />
                      ) : (
                        <View style={styles.seenByUserAvatarPlaceholder}>
                          <Text style={styles.seenByUserAvatarText}>
                            {userName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.seenByUserName}>{userName}</Text>
                    <Ionicons 
                      name="chevron-forward" 
                      size={20} 
                      color={commonStyles.textSecondary} 
                      style={styles.seenByUserChevron}
                    />
                  </TouchableOpacity>
                );
              }}
              style={styles.seenByUserList}
              contentContainerStyle={styles.seenByUserListContent}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: commonStyles.backgroundTertiary,
  },
  header: {
    ...commonStyles.header,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -spacing.xs,
  },
  headerUserInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarPlaceholder: {
    backgroundColor: colors.primary,
  },
  avatarText: {
    color: colors.textWhite,
    fontSize: 18,
    fontWeight: '600',
  },
  headerNameContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerText: {
    ...commonStyles.headerText,
    fontSize: 18,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: 2,
  },
  headerSubtext: {
    fontSize: 12,
    color: commonStyles.textSecondary,
    fontWeight: '400',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -spacing.xs,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: commonStyles.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  messagesList: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md + 2,
  },
  messageWrapper: {
    marginBottom: spacing.sm,
    maxWidth: '85%',
    minWidth: 100,
  },
  ownMessageWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessageWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageContentWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  messageAvatarContainer: {
    marginBottom: spacing.xs,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  messageAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarText: {
    color: colors.textWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  messageAvatarSpacer: {
    width: 32,
  },
  senderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs / 2,
    marginLeft: spacing.xs + 2,
    gap: spacing.xs,
  },
  senderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  senderAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  senderAvatarText: {
    color: colors.textWhite,
    fontSize: 10,
    fontWeight: '600',
  },
  senderName: {
    color: commonStyles.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  messageBubble: {
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    borderRadius: 12,
    maxWidth: '100%',
    minWidth: 60,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  consecutiveBubble: {
    marginTop: 2,
  },
  ownBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
    borderTopRightRadius: 12,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  otherBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.1,
    includeFontPadding: false,
    marginBottom: 4,
  },
  ownMessageText: {
    color: colors.textWhite,
    fontWeight: '400',
  },
  otherMessageText: {
    color: '#000000',
    fontWeight: '400',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  messageTime: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: 'rgba(0, 0, 0, 0.4)',
  },
  readReceipt: {
    marginLeft: 2,
  },
  readReceiptContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    paddingRight: 4,
    gap: 4,
  },
  groupSeenByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingRight: 4,
    gap: spacing.xs,
  },
  groupSeenByAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupSeenByAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: commonStyles.backgroundPrimary,
    overflow: 'hidden',
    backgroundColor: commonStyles.backgroundSecondary,
  },
  groupSeenByAvatarImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  groupSeenByAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupSeenByAvatarText: {
    color: colors.textWhite,
    fontSize: 9,
    fontWeight: '600',
  },
  groupSeenByAvatarMore: {
    backgroundColor: commonStyles.backgroundSecondary,
    borderColor: commonStyles.borderColor,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupSeenByAvatarMoreText: {
    color: commonStyles.textSecondary,
    fontSize: 8,
    fontWeight: '600',
  },
  groupSeenByText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  messageTimeSmall: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    color: commonStyles.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
    letterSpacing: 0.2,
  },
  emptySubtext: {
    color: commonStyles.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  typingBubble: {
    backgroundColor: commonStyles.backgroundSecondary,
    borderRadius: 18,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: commonStyles.textSecondary,
  },
  typingText: {
    color: commonStyles.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  imageMessageContainer: {
    maxWidth: MAX_IMAGE_WIDTH,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  ownImageContainer: {
    alignSelf: 'flex-end',
  },
  otherImageContainer: {
    alignSelf: 'flex-start',
  },
  messageImage: {
    width: MAX_IMAGE_WIDTH,
    height: MAX_IMAGE_WIDTH * 0.75,
    borderRadius: 18,
  },
  imageTextOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: spacing.sm,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  imageText: {
    color: colors.textWhite,
    fontSize: 14,
    fontWeight: '500',
  },
  fileBubble: {
    padding: spacing.md,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileInfo: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs / 2,
  },
  fileSize: {
    fontSize: 12,
    opacity: 0.8,
  },
  ownFileSize: {
    color: colors.textWhite,
  },
  otherFileSize: {
    color: commonStyles.textSecondary,
  },
  fileTextContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: commonStyles.borderColor,
  },
  ownFileTextContainer: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  mediaModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaModalCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  audioBubble: {
    padding: spacing.md,
    minWidth: 200,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  audioIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  ownAudioIcon: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  otherAudioIcon: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  audioWaveform: {
    flex: 1,
    height: 4,
    backgroundColor: commonStyles.borderColor,
    borderRadius: 2,
    overflow: 'hidden',
  },
  ownAudioWaveformBg: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  audioWaveformBar: {
    height: '100%',
    borderRadius: 2,
  },
  ownAudioWaveform: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  otherAudioWaveform: {
    backgroundColor: colors.primary,
  },
  audioMicIcon: {
    marginLeft: spacing.xs,
  },
  audioTextContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: commonStyles.borderColor,
  },
  ownAudioTextContainer: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  messageMenu: {
    position: 'absolute',
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: 12,
    paddingVertical: spacing.xs,
    minWidth: 160,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  menuItemText: {
    fontSize: 16,
    color: commonStyles.textPrimary,
    fontWeight: '400',
  },
  menuItemTextDanger: {
    color: '#ef4444',
  },
  seenByModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  seenByModalContent: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  seenByModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  seenByModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: commonStyles.textPrimary,
  },
  seenByModalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seenByModalSubtitle: {
    fontSize: 14,
    color: commonStyles.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  seenByUserList: {
    maxHeight: 400,
  },
  seenByUserListContent: {
    paddingBottom: spacing.md,
  },
  seenByUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  seenByUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  seenByUserAvatarImage: {
    width: '100%',
    height: '100%',
  },
  seenByUserAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  seenByUserAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textWhite,
  },
  seenByUserName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: commonStyles.textPrimary,
  },
  seenByUserChevron: {
    marginLeft: spacing.sm,
  },
});
