import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatDistanceToNow } from 'date-fns';
import axiosInstance from '../lib/api';

export default function UserDetailScreen({ route, navigation }) {
  const { colors, spacing, typography, commonStyles, isDark } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles, isDark);
  const { userId } = route.params || {};
  
  const chatStore = useChatStore();
  const authStore = useAuthStore();
  const users = chatStore?.users ?? [];
  const messages = chatStore?.messages ?? [];
  const authUser = authStore?.authUser ?? null;
  const onlineUsers = authStore?.onlineUsers ?? [];
  
  const [activeTab, setActiveTab] = useState('info');
  const [isMuted, setIsMuted] = useState(false);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const user = users.find((u) => u._id?.toString() === userId?.toString());
  const isCurrentUser = user?._id?.toString() === authUser?._id?.toString();

  const getUsers = useChatStore((state) => state.getUsers);
  useEffect(() => {
    if (userId && getUsers) {
      getUsers().catch(err => console.error('Error fetching users:', err));
    }
  }, [userId, getUsers]);

  // Fetch messages by type when tab changes
  useEffect(() => {
    if (!userId || activeTab === 'info') {
      setFilteredMessages([]);
      return;
    }

    const fetchMessagesByType = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await axiosInstance.get(`/messages/by-type/${userId}?type=${activeTab}`);
        setFilteredMessages(res.data || []);
      } catch (error) {
        console.error(`Error fetching ${activeTab} messages:`, error);
        // Fallback to filtering from store messages
        filterMessagesFromStore();
      } finally {
        setIsLoadingMessages(false);
      }
    };

    const filterMessagesFromStore = () => {
      const authUserId = authUser?._id?.toString();
      const targetUserId = userId?.toString();
      
      const conversationMessages = messages.filter(msg => {
        const senderId = msg.sender?._id?.toString() || 
                        (typeof msg.senderId === 'object' ? msg.senderId._id?.toString() : msg.senderId?.toString());
        const receiverId = msg.receiver?._id?.toString() || 
                          (typeof msg.receiverId === 'object' ? msg.receiverId._id?.toString() : msg.receiverId?.toString());
        
        const isInConversation = (senderId === authUserId && receiverId === targetUserId) ||
                                 (senderId === targetUserId && receiverId === authUserId);
        
        if (!isInConversation) return false;
        
        if (activeTab === 'media') return !!msg.image;
        if (activeTab === 'files') return !!msg.file;
        if (activeTab === 'links') return !!msg.link;
        if (activeTab === 'voice') return !!msg.audio;
        
        return false;
      });
      
      setFilteredMessages(conversationMessages);
    };

    fetchMessagesByType();
  }, [userId, activeTab, messages, authUser]);

  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id.toString();
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const displayPic = user.profilePic || null;
  const userIdNormalized = normalizeId(user._id);
  const isOnline = onlineUsers.includes(userIdNormalized);

  const handleCall = () => {
    // Navigate to conversation and trigger call
    navigation.navigate('Conversation', {
      userId: userId,
      userName: user.fullname,
      isGroup: false,
    });
    // You can add call logic here
  };

  const handleVideoCall = () => {
    // Navigate to conversation and trigger video call
    navigation.navigate('Conversation', {
      userId: userId,
      userName: user.fullname,
      isGroup: false,
    });
    // You can add video call logic here
  };

  const handleOpenMedia = (uri) => {
    if (uri) {
      Linking.openURL(uri).catch(err => console.error('Error opening URL:', err));
    }
  };

  const handleOpenFile = (fileUrl, fileName) => {
    if (fileUrl) {
      Linking.openURL(fileUrl).catch(err => console.error('Error opening file:', err));
    }
  };

  const handleOpenLink = (link) => {
    if (link) {
      Linking.openURL(link).catch(err => console.error('Error opening link:', err));
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={commonStyles.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {user.fullname}
          </Text>
          <Text style={styles.headerSubtitle}>
            {isOnline ? 'online' : 'offline'}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconButton}>
            <Ionicons name="search" size={22} color={commonStyles.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconButton}>
            <Ionicons name="ellipsis-vertical" size={22} color={commonStyles.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          {/* Profile Picture */}
          <View style={styles.profilePicContainer}>
            {displayPic ? (
              <Image source={{ uri: displayPic }} style={styles.profilePic} />
            ) : (
              <View style={styles.profilePicPlaceholder}>
                <Text style={styles.profilePicText}>
                  {user.fullname?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            {isOnline && (
              <View style={styles.onlineIndicator} />
            )}
          </View>

          {/* User Name and Status */}
          <Text style={styles.userName}>{user.fullname}</Text>
          <Text style={styles.userStatus}>
            {isOnline ? 'online' : 'offline'}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCall}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="call" size={24} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleVideoCall}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="videocam" size={24} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setIsMuted(!isMuted)}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons
                  name={isMuted ? 'notifications-off' : 'notifications'}
                  size={24}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.actionButtonText}>Mute</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
              </View>
              <Text style={styles.actionButtonText}>More</Text>
            </TouchableOpacity>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>info</Text>
            {user.email && (
              <View style={styles.infoItem}>
                <Ionicons name="mail" size={16} color={commonStyles.textSecondary} />
                <Text style={styles.infoText}>{user.email}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Text style={styles.infoLabelSmall}>Last seen:</Text>
              <Text style={styles.infoText}>
                {isOnline ? 'online' : 'recently'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'media' && styles.tabActive]}
              onPress={() => setActiveTab('media')}
            >
              <Text style={[styles.tabText, activeTab === 'media' && styles.tabTextActive]}>
                Media
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'files' && styles.tabActive]}
              onPress={() => setActiveTab('files')}
            >
              <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>
                Files
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'links' && styles.tabActive]}
              onPress={() => setActiveTab('links')}
            >
              <Text style={[styles.tabText, activeTab === 'links' && styles.tabTextActive]}>
                Links
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'voice' && styles.tabActive]}
              onPress={() => setActiveTab('voice')}
            >
              <Text style={[styles.tabText, activeTab === 'voice' && styles.tabTextActive]}>
                Voice
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {isLoadingMessages ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : filteredMessages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No {activeTab} found</Text>
            </View>
          ) : (
            <View style={styles.messagesGrid}>
              {filteredMessages.map((message) => (
                <View key={message._id} style={styles.messageItem}>
                  {activeTab === 'media' && message.image && (
                    <TouchableOpacity
                      onPress={() => handleOpenMedia(message.image)}
                      activeOpacity={0.9}
                    >
                      <Image source={{ uri: message.image }} style={styles.mediaImage} />
                      <View style={styles.mediaOverlay}>
                        <Text style={styles.mediaTime}>
                          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  {activeTab === 'files' && message.file && (
                    <TouchableOpacity
                      style={styles.fileItem}
                      onPress={() => handleOpenFile(message.file, message.fileName)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document" size={32} color={colors.primary} />
                      <Text style={styles.fileName} numberOfLines={1}>
                        {message.fileName || 'File'}
                      </Text>
                      {message.fileSize && (
                        <Text style={styles.fileSize}>
                          {(message.fileSize / 1024).toFixed(2)} KB
                        </Text>
                      )}
                      <Text style={styles.fileTime}>
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {activeTab === 'links' && message.link && (
                    <TouchableOpacity
                      style={styles.linkItem}
                      onPress={() => handleOpenLink(message.link)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="link" size={24} color={colors.primary} />
                      <Text style={styles.linkText} numberOfLines={2}>
                        {message.link}
                      </Text>
                      {message.text && (
                        <Text style={styles.linkPreview} numberOfLines={1}>
                          {message.text}
                        </Text>
                      )}
                      <Text style={styles.linkTime}>
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {activeTab === 'voice' && message.audio && (
                    <View style={styles.voiceItem}>
                      <Ionicons name="mic" size={24} color={colors.primary} />
                      <Text style={styles.voiceTime}>
                        {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                      </Text>
                      <Text style={styles.voiceNote}>Voice message</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors, spacing, typography, commonStyles, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundSecondary,
  },
  loadingText: {
    marginTop: spacing.md,
    color: commonStyles.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        paddingTop: spacing.xxl + 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        paddingTop: spacing.xl + 4,
        elevation: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: commonStyles.borderColor,
      },
    }),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  backText: {
    marginLeft: spacing.xs,
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.primary,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: commonStyles.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: commonStyles.textSecondary,
    marginTop: 2,
    fontWeight: '400',
    textTransform: 'capitalize',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: commonStyles.backgroundSecondary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  scrollView: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    marginBottom: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  profilePicContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  profilePic: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  profilePicPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  profilePicText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.textWhite,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    borderWidth: 4,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: spacing.xs,
  },
  userStatus: {
    fontSize: 14,
    color: commonStyles.textSecondary,
    marginBottom: spacing.xl,
    fontWeight: '400',
    textTransform: 'capitalize',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing.sm,
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: `${colors.primary}30`,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionButtonText: {
    fontSize: typography.xs + 1,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    letterSpacing: 0.2,
  },
  infoSection: {
    width: '100%',
    maxWidth: 500,
    paddingHorizontal: spacing.md,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundSecondary,
    borderRadius: 16,
    padding: spacing.md,
    marginTop: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  infoLabel: {
    fontSize: typography.sm + 1,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  infoLabelSmall: {
    fontSize: typography.sm,
    color: commonStyles.textSecondary,
    fontWeight: '500',
    minWidth: 80,
  },
  infoText: {
    fontSize: typography.sm,
    color: commonStyles.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  tabsContainer: {
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: commonStyles.borderColor,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 4,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginHorizontal: spacing.xs,
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.sm + 1,
    fontWeight: '600',
    color: commonStyles.textSecondary,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabContent: {
    flex: 1,
    minHeight: 200,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundSecondary,
  },
  emptyContainer: {
    padding: spacing.xxl * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: spacing.md,
    fontSize: 15,
    color: commonStyles.textSecondary,
    fontWeight: '400',
  },
  messagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.md,
    gap: spacing.md,
  },
  messageItem: {
    width: '48%',
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: commonStyles.borderColor,
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
  mediaOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    padding: spacing.sm,
  },
  mediaTime: {
    fontSize: typography.xs,
    color: '#fff',
    fontWeight: '600',
  },
  fileItem: {
    padding: spacing.lg,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  fileName: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  fileSize: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  fileTime: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  linkItem: {
    padding: spacing.lg,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  linkText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    marginTop: spacing.xs,
  },
  linkPreview: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  linkTime: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  voiceItem: {
    padding: spacing.lg,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  voiceTime: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  voiceNote: {
    fontSize: typography.sm,
    color: commonStyles.textPrimary,
    marginTop: 6,
    fontWeight: '600',
  },
});
