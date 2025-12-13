import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';

export default function ChatScreen({ navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  
  // Use selectors instead of entire store to prevent re-renders
  const users = useChatStore((state) => state.users ?? []);
  const groups = useChatStore((state) => state.groups ?? []);
  const lastMessages = useChatStore((state) => state.lastMessages ?? {});
  const lastGroupMessages = useChatStore((state) => state.lastGroupMessages ?? {});
  const isUsersLoading = useChatStore((state) => state.isUsersLoading ?? false);
  const isGroupsLoading = useChatStore((state) => state.isGroupsLoading ?? false);
  const onlineUsers = useAuthStore((state) => state.onlineUsers ?? []);
  
  const [activeTab, setActiveTab] = useState('person'); // 'person' or 'group'

  // Ensure users are fetched on mount
  useEffect(() => {
    if (users.length === 0 && !isUsersLoading) {
      const { getUsers } = useChatStore.getState();
      getUsers?.();
    }
  }, [users.length, isUsersLoading]);

  // Fetch data based on active tab
  // Use ref to prevent multiple calls
  const fetchInProgressRef = useRef(false);
  
  useEffect(() => {
    // Prevent multiple simultaneous fetches
    if (fetchInProgressRef.current) {
      return;
    }
    
    // Reset loading timeout when tab changes
    setLoadingTimeout(false);
    loadingStartTimeRef.current = null;
    
    // Don't manually set loading state - let getUsers/getGroups handle it
    // This prevents state toggling that causes infinite loops
    
    // Note: Timeout is handled in separate useEffect (line 295) - don't duplicate here
    
    try {
      fetchInProgressRef.current = true;
      
      // Get functions from store to avoid dependency on entire store object
      const { getUsers, getGroups } = useChatStore.getState();
      
      if (activeTab === 'person') {
        // Add error handler to ensure loading state is cleared even if promise rejects
        getUsers?.().catch((error) => {
          console.error('Error in getUsers promise:', error);
          useChatStore.setState({ isUsersLoading: false });
          setLoadingTimeout(true);
        }).finally(() => {
          fetchInProgressRef.current = false;
        });
      } else {
        // Add error handler to ensure loading state is cleared even if promise rejects
        getGroups?.().catch((error) => {
          console.error('Error in getGroups promise:', error);
          useChatStore.setState({ isGroupsLoading: false });
          setLoadingTimeout(true);
        }).finally(() => {
          fetchInProgressRef.current = false;
        });
      }
      // Note: subscribeToMessages is handled globally in App.js, don't subscribe here
    } catch (error) {
      console.error('Error fetching chat data:', error);
      fetchInProgressRef.current = false;
      // Clear loading state on error
      if (activeTab === 'person') {
        useChatStore.setState({ isUsersLoading: false });
      } else {
        useChatStore.setState({ isGroupsLoading: false });
      }
      setLoadingTimeout(true);
    }
    
    return () => {
      fetchInProgressRef.current = false;
    };
  }, [activeTab]); // Only depend on activeTab, not chatStore

  const handleUserPress = (user) => {
    const { setSelectedUser, getMessages } = useChatStore.getState();
    setSelectedUser?.(user);
    getMessages?.(user._id);
    navigation?.navigate('Conversation', { userId: user._id, userName: user.fullname });
  };

  const handleGroupPress = (group) => {
    const { setSelectedGroup } = useChatStore.getState();
    setSelectedGroup?.(group);
    // TODO: Navigate to group conversation screen
    // For now, we can reuse ConversationScreen with groupId
    navigation?.navigate('Conversation', { 
      groupId: group._id, 
      groupName: group.name,
      isGroup: true 
    });
  };

  const getLastMessage = (userId) => {
    const userIdStr = userId?.toString();
    return lastMessages[userIdStr] || null;
  };

  const isOnline = (userId) => {
    const userIdStr = userId?.toString();
    return onlineUsers.includes(userIdStr);
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isToday(date)) {
        return format(date, 'HH:mm');
      } else if (isYesterday(date)) {
        return 'Yesterday';
      } else {
        const diffInDays = (new Date() - date) / (1000 * 60 * 60 * 24);
        if (diffInDays < 7) {
          return format(date, 'EEE');
        } else {
          return format(date, 'MMM d');
        }
      }
    } catch (error) {
      return '';
    }
  };

  const getLastGroupMessage = (groupId) => {
    const groupIdStr = groupId?.toString();
    return lastGroupMessages[groupIdStr] || null;
  };

  const renderUserItem = ({ item }) => {
    const lastMessage = getLastMessage(item._id);
    const online = isOnline(item._id);
    const hasProfilePic = item.profilePic && item.profilePic.trim() !== '';
    
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleUserPress(item)}
        activeOpacity={0.6}
      >
        <View style={styles.avatarContainer}>
          {hasProfilePic ? (
            <Image
              source={{ uri: item.profilePic }}
              style={[styles.avatarImage, online && styles.avatarOnline]}
            />
          ) : (
            <View style={[styles.avatar, online && styles.avatarOnline]}>
              <Text style={styles.avatarText}>
                {item.fullname?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.userInfoHeader}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.fullname || 'Unknown'}
            </Text>
            {lastMessage && (
              <Text style={styles.messageTime}>
                {formatTime(lastMessage.createdAt)}
              </Text>
            )}
          </View>
          
          <View style={styles.messagePreview}>
            {lastMessage ? (
              <Text style={styles.lastMessage} numberOfLines={1}>
                {lastMessage.text || '📎 Media'}
              </Text>
            ) : (
              <Text style={styles.noMessage} numberOfLines={1}>
                Tap to start conversation
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupItem = ({ item }) => {
    const lastMessage = getLastGroupMessage(item._id);
    const memberCount = item.members?.length || 0;
    const hasGroupPic = item.groupPic && item.groupPic.trim() !== '';
    
    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleGroupPress(item)}
        activeOpacity={0.6}
      >
        <View style={styles.avatarContainer}>
          {hasGroupPic ? (
            <Image
              source={{ uri: item.groupPic }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={[styles.avatar, styles.groupAvatar]}>
              <Ionicons name="people" size={28} color={colors.textWhite} />
            </View>
          )}
        </View>
        
        <View style={styles.userInfo}>
          <View style={styles.userInfoHeader}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.name || 'Unnamed Group'}
            </Text>
            {lastMessage && (
              <Text style={styles.messageTime}>
                {formatTime(lastMessage.createdAt)}
              </Text>
            )}
          </View>
          
          <View style={styles.messagePreview}>
            {lastMessage ? (
              <>
                <Text style={styles.lastMessage} numberOfLines={1}>
                  {lastMessage.senderId?.fullname || 'Someone'}: {lastMessage.text || '📎 Media'}
                </Text>
              </>
            ) : (
              <Text style={styles.noMessage} numberOfLines={1}>
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isLoading = activeTab === 'person' ? isUsersLoading : isGroupsLoading;
  // Filter users to show only those who have chatted (have messages) - like web
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id?.toString();
  };
  
  // Only show users who have messages (like web Sidebar.jsx)
  const usersWithMessages = users.filter((user) => {
    const userId = normalizeId(user._id);
    // Check if user has a last message
    return lastMessages[userId] || lastMessages[user._id];
  });
  
  // Sort users by most recent message first (like web)
  const sortedUsersWithMessages = [...usersWithMessages].sort((a, b) => {
    const aId = normalizeId(a._id);
    const bId = normalizeId(b._id);
    const aMessage = lastMessages[aId] || lastMessages[a._id];
    const bMessage = lastMessages[bId] || lastMessages[b._id];
    
    if (!aMessage && !bMessage) return 0;
    if (!aMessage) return 1;
    if (!bMessage) return -1;
    
    // Sort by most recent message first
    const aDate = aMessage.createdAt ? new Date(aMessage.createdAt) : new Date(0);
    const bDate = bMessage.createdAt ? new Date(bMessage.createdAt) : new Date(0);
    return bDate - aDate;
  });
  
  const data = activeTab === 'person' ? sortedUsersWithMessages : groups;
  const isEmpty = data.length === 0;
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  // Track when loading starts - ONLY use ref, NO state updates to prevent infinite loops
  const loadingStartTimeRef = useRef(null);
  const lastIsLoadingRef = useRef(isLoading);
  
  useEffect(() => {
    // Only update if isLoading actually changed (not just re-render)
    if (isLoading !== lastIsLoadingRef.current) {
      lastIsLoadingRef.current = isLoading;
      
      if (isLoading && !loadingStartTimeRef.current) {
        loadingStartTimeRef.current = Date.now();
      } else if (!isLoading && loadingStartTimeRef.current) {
        loadingStartTimeRef.current = null;
        setLoadingTimeout(false);
      }
    }
  }, [isLoading]); // Only depend on isLoading

  // ULTRA AGGRESSIVE timeout: Force clear loading after 1 second
  // This works in production even if console.log is stripped
  useEffect(() => {
    if (isLoading && data.length === 0) {
      const timeout = setTimeout(() => {
        setLoadingTimeout(true);
        // Force stop loading using Zustand's setState
        // This works in production - doesn't depend on console logs
        if (activeTab === 'person') {
          useChatStore.setState({ isUsersLoading: false });
        } else {
          useChatStore.setState({ isGroupsLoading: false });
        }
      }, 1000); // 1 second timeout (ULTRA aggressive)

      return () => clearTimeout(timeout);
    } else {
      // Clear timeout if loading stops or we get data
      setLoadingTimeout(false);
    }
  }, [isLoading, data.length, activeTab]);
  
  // Additional safety: Clear loading on unmount or tab change
  useEffect(() => {
    return () => {
      setLoadingTimeout(false);
      loadingStartTimeRef.current = null;
      if (activeTab === 'person') {
        useChatStore.setState({ isUsersLoading: false });
      } else {
        useChatStore.setState({ isGroupsLoading: false });
      }
    };
  }, [activeTab]);

  // Don't show loading if:
  // 1. Timeout reached (loadingTimeout is true) - PRIORITY: Always hide if timed out
  // 2. We have data
  // 3. Loading has been going for more than 1 second (based on time)
  // Calculate loadingTime only when needed, not on every render to prevent infinite loops
  const loadingTime = loadingStartTimeRef.current ? Date.now() - loadingStartTimeRef.current : 0;
  // ULTRA AGGRESSIVE: Force timeout after 1 second - this ALWAYS works in production
  const hasTimedOut = loadingTimeout || (loadingStartTimeRef.current && loadingTime > 1000);
  
  // CRITICAL: If timed out, NEVER show loading, regardless of store state
  // This ensures UI always responds even if store update is delayed
  // COMPONENT-LEVEL OVERRIDE: Ignore store state completely if timed out
  const shouldShowLoading = !hasTimedOut && isLoading && data.length === 0;
  
  // ULTRA SAFETY: Force clear loading state if timed out (works even if store doesn't update)
  useEffect(() => {
    if (hasTimedOut && isLoading) {
      // Force clear immediately - don't wait for store
      if (activeTab === 'person') {
        useChatStore.setState({ isUsersLoading: false });
      } else {
        useChatStore.setState({ isGroupsLoading: false });
      }
    }
  }, [hasTimedOut, isLoading, activeTab]);
  
  // Extra safety: Force clear if loading for more than 1.5 seconds
  // Use useRef to track if we've already cleared to prevent infinite loops
  const hasClearedRef = useRef(false);
  useEffect(() => {
    if (isLoading && data.length === 0 && loadingTime > 1500 && !hasClearedRef.current) {
      hasClearedRef.current = true;
      setLoadingTimeout(true);
      if (activeTab === 'person') {
        useChatStore.setState({ isUsersLoading: false });
      } else {
        useChatStore.setState({ isGroupsLoading: false });
      }
    } else if (!isLoading) {
      hasClearedRef.current = false;
    }
  }, [isLoading, data.length, activeTab]); // Removed loadingTime from deps to prevent infinite loop
  
  // CRITICAL FIX: Also force clear loading state immediately if timed out
  // Use ref to prevent multiple calls
  const hasForceClearedRef = useRef(false);
  useEffect(() => {
    if (hasTimedOut && isLoading && !hasForceClearedRef.current) {
      hasForceClearedRef.current = true;
      if (activeTab === 'person') {
        useChatStore.setState({ isUsersLoading: false });
      } else {
        useChatStore.setState({ isGroupsLoading: false });
      }
    } else if (!isLoading) {
      hasForceClearedRef.current = false;
    }
  }, [loadingTimeout, isLoading, activeTab]); // Use loadingTimeout instead of hasTimedOut to prevent recalc

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Chats</Text>
      </View>
      
      {/* Tab Switcher - Always visible */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'person' && styles.activeTab]}
          onPress={() => {
            console.log('Switching to person tab');
            setActiveTab('person');
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="person" 
            size={18} 
            color={activeTab === 'person' ? colors.primary : commonStyles.textSecondary} 
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === 'person' && styles.activeTabText]}>
            Person
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'group' && styles.activeTab]}
          onPress={() => {
            console.log('Switching to group tab');
            setActiveTab('group');
          }}
          activeOpacity={0.7}
        >
          <Ionicons 
            name="people" 
            size={18} 
            color={activeTab === 'group' ? colors.primary : commonStyles.textSecondary} 
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
            Group
          </Text>
        </TouchableOpacity>
      </View>
      
      {/* Show loading only if no data and still loading AND not timed out */}
      {/* CRITICAL: Use shouldShowLoading which respects timeout in production */}
      {/* FINAL SAFETY: Double-check timeout in render - NEVER show loading if timed out */}
      {shouldShowLoading && !hasTimedOut ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      ) : (
        <FlatList
        data={data}
        keyExtractor={(item) => item._id?.toString() || Math.random().toString()}
        renderItem={activeTab === 'person' ? renderUserItem : renderGroupItem}
        contentContainerStyle={isEmpty ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'person' ? '💬' : '👥'}
              </Text>
            </View>
            <Text style={styles.emptyText}>
              {activeTab === 'person' ? 'No conversations yet' : 'No groups yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'person' 
                ? 'Start chatting with your contacts' 
                : 'Create or join a group to start chatting'}
            </Text>
          </View>
        }
      />
      )}
    </View>
  );
}
const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: commonStyles.backgroundPrimary,
  },
  header: {
    ...commonStyles.header,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
  },
  headerText: {
    ...commonStyles.headerText,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  loadingText: {
    color: commonStyles.textSecondary,
    fontSize: 15,
    marginTop: spacing.md,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: spacing.md,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: commonStyles.borderColorLight,
    marginLeft: 80,
  },
  userItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: commonStyles.backgroundPrimary,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md + 4,
  },
  avatar: {
    width: commonStyles.avatarSize,
    height: commonStyles.avatarSize,
    backgroundColor: colors.primary,
    borderRadius: commonStyles.avatarSize / 2,
    alignItems: 'center',
    justifyContent: 'center',
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
  avatarImage: {
    width: commonStyles.avatarSize,
    height: commonStyles.avatarSize,
    borderRadius: commonStyles.avatarSize / 2,
    backgroundColor: commonStyles.backgroundSecondary,
  },
  avatarOnline: {
    borderWidth: 3,
    borderColor: '#34A853',
  },
  avatarText: {
    color: colors.textWhite,
    fontWeight: '700',
    fontSize: 24,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    backgroundColor: '#34A853',
    borderRadius: 8,
    borderWidth: 3,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  userName: {
    color: commonStyles.textPrimary,
    fontWeight: '600',
    fontSize: 17,
    flex: 1,
    marginRight: spacing.sm,
    letterSpacing: 0.1,
  },
  messageTime: {
    color: commonStyles.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    color: commonStyles.textSecondary,
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  noMessage: {
    color: commonStyles.textTertiary,
    fontSize: 15,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 3,
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: commonStyles.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg + 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  emptyIcon: {
    fontSize: 56,
  },
  emptyText: {
    color: commonStyles.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: spacing.xs + 2,
    letterSpacing: 0.2,
  },
  emptySubtext: {
    color: commonStyles.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: commonStyles.backgroundPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: commonStyles.borderColor,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: commonStyles.backgroundSecondary,
    gap: spacing.xs,
  },
  activeTab: {
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  tabIcon: {
    marginRight: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: commonStyles.textSecondary,
  },
  activeTabText: {
    color: colors.primary,
  },
  groupAvatar: {
    backgroundColor: colors.primary,
  },
});

