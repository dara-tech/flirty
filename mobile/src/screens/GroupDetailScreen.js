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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatDistanceToNow } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import axiosInstance from '../lib/api';

export default function GroupDetailScreen({ route, navigation }) {
  const { colors, spacing, typography, commonStyles, isDark } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles, isDark);
  const { groupId } = route.params || {};
  
  const chatStore = useChatStore();
  const authStore = useAuthStore();
  const groups = chatStore?.groups ?? [];
  const messages = chatStore?.messages ?? [];
  const users = chatStore?.users ?? [];
  const authUser = authStore?.authUser ?? null;
  const onlineUsers = authStore?.onlineUsers ?? [];
  
  const [activeTab, setActiveTab] = useState('members');
  const [editingField, setEditingField] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const group = groups.find((g) => g._id?.toString() === groupId?.toString());
  const isAdmin = group?.admin?._id?.toString() === authUser?._id?.toString() ||
                  group?.admin?.toString() === authUser?._id?.toString();

  const getGroups = useChatStore((state) => state.getGroups);
  useEffect(() => {
    if (groupId && getGroups) {
      getGroups().catch(err => console.error('Error fetching groups:', err));
    }
  }, [groupId, getGroups]);

  useEffect(() => {
    if (group) {
      setEditedName(group.name || '');
      setEditedDescription(group.description || '');
      setGroupPicPreview(null);
      setGroupPic(null);
      setEditingField(null);
    }
  }, [group]);

  // Fetch messages by type when tab changes
  useEffect(() => {
    if (!groupId || activeTab === 'members') {
      setFilteredMessages([]);
      return;
    }

    const fetchMessagesByType = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await axiosInstance.get(`/messages/by-type/${groupId}?type=${activeTab}`);
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
      const groupIdStr = groupId?.toString();
      
      const groupMessages = messages.filter(msg => {
        const msgGroupId = msg.groupId?._id?.toString() || 
                          (typeof msg.groupId === 'object' ? msg.groupId._id?.toString() : msg.groupId?.toString());
        
        if (msgGroupId !== groupIdStr) return false;
        
        if (activeTab === 'media') return !!msg.image;
        if (activeTab === 'files') return !!msg.file;
        if (activeTab === 'links') return !!msg.link;
        if (activeTab === 'voice') return !!msg.audio;
        
        return false;
      });
      
      setFilteredMessages(groupMessages);
    };

    fetchMessagesByType();
  }, [groupId, activeTab, messages]);

  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id.toString();
  };

  const handleImageChange = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        setGroupPic(file);
        setGroupPicPreview(file.uri);
        handleUpdateImage(file);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleUpdateImage = async (file) => {
    setIsUpdating(true);
    try {
      // Convert image to base64 using expo-file-system
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Determine mime type from file extension
      const filename = file.uri.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1]}` : 'image/jpeg';

      await chatStore.updateGroupInfo(groupId, {
        groupPic: `data:${mimeType};base64,${base64}`,
      });

      Alert.alert('Success', 'Photo updated');
      setGroupPic(null);
      setGroupPicPreview(null);
    } catch (error) {
      console.error('Error updating image:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update photo');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    setIsUpdating(true);
    try {
      await chatStore.updateGroupInfo(groupId, {
        name: editedName.trim(),
      });
      Alert.alert('Success', 'Name updated');
      setEditingField(null);
    } catch (error) {
      console.error('Error updating name:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update name');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveDescription = async () => {
    setIsUpdating(true);
    try {
      await chatStore.updateGroupInfo(groupId, {
        description: editedDescription.trim(),
      });
      Alert.alert('Success', 'Description updated');
      setEditingField(null);
    } catch (error) {
      console.error('Error updating description:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update description');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLeaveGroup = async () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await chatStore.leaveGroup(groupId);
              Alert.alert('Success', 'Left group successfully');
              navigation.goBack();
            } catch (error) {
              console.error('Error leaving group:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to leave group');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ]
    );
  };

  if (!group) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading group info...</Text>
        </View>
      </View>
    );
  }

  // Get all members - admin is separate from members array
  const adminId = normalizeId(group.admin?._id || group.admin);
  const allMembers = [];
  
  // Add admin if exists
  if (group.admin) {
    allMembers.push(group.admin);
  }
  
  // Add members, excluding admin if it's mistakenly in members array
  if (group.members && Array.isArray(group.members)) {
    group.members.forEach((member) => {
      const memberId = normalizeId(member._id || member);
      if (memberId !== adminId) {
        allMembers.push(member);
      }
    });
  }

  const displayPic = groupPicPreview || group.groupPic || null;
  const authUserId = normalizeId(authUser?._id);

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

  const handleMemberPress = (memberId) => {
    navigation.navigate('UserDetail', { userId: memberId });
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
            {group.name}
          </Text>
          <Text style={styles.headerSubtitle}>
            {allMembers.length} {allMembers.length === 1 ? 'member' : 'members'}
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
                <Ionicons name="people" size={48} color={colors.textWhite} />
              </View>
            )}
            {isAdmin && (
              <TouchableOpacity
                style={styles.editPicButton}
                onPress={handleImageChange}
                disabled={isUpdating}
              >
                <Ionicons name="camera" size={16} color={colors.textWhite} />
              </TouchableOpacity>
            )}
          </View>

          {/* Group Name */}
          {editingField === 'name' ? (
            <View style={styles.editNameContainer}>
              <TextInput
                style={styles.editNameInput}
                value={editedName}
                onChangeText={setEditedName}
                placeholder="Group name"
                autoFocus
                onBlur={() => {
                  if (editedName.trim() && editedName !== group.name) {
                    handleSaveName();
                  } else {
                    setEditingField(null);
                    setEditedName(group.name || '');
                  }
                }}
                onSubmitEditing={handleSaveName}
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveName}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => isAdmin && setEditingField('name')}
              disabled={!isAdmin}
            >
              <Text style={styles.groupName}>{group.name}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.memberCount}>
            {allMembers.length} {allMembers.length === 1 ? 'member' : 'members'}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            {isAdmin && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  // Navigate to add member screen or show modal
                  Alert.alert('Add Member', 'Feature coming soon');
                }}
                activeOpacity={0.7}
              >
                <View style={styles.actionIconContainer}>
                  <Ionicons name="person-add" size={24} color={colors.primary} />
                </View>
                <Text style={styles.actionButtonText}>Add</Text>
              </TouchableOpacity>
            )}
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

          {/* Description Section */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>info</Text>
            {editingField === 'description' ? (
              <View style={styles.editDescriptionContainer}>
                <TextInput
                  style={styles.editDescriptionInput}
                  value={editedDescription}
                  onChangeText={setEditedDescription}
                  placeholder="Add a description..."
                  multiline
                  numberOfLines={3}
                  autoFocus
                />
                <View style={styles.editDescriptionActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setEditingField(null);
                      setEditedDescription(group.description || '');
                    }}
                    disabled={isUpdating}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveDescriptionButton}
                    onPress={handleSaveDescription}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color={colors.textWhite} />
                    ) : (
                      <Text style={styles.saveDescriptionButtonText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => isAdmin && setEditingField('description')}
                disabled={!isAdmin}
                style={isAdmin && styles.editableDescription}
              >
                <Text style={styles.descriptionText}>
                  {group.description || (isAdmin ? 'Tap to add a description...' : 'No description')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'members' && styles.tabActive]}
              onPress={() => setActiveTab('members')}
            >
              <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>
                Members
              </Text>
            </TouchableOpacity>
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
          {activeTab === 'members' && (
            <View style={styles.membersList}>
              {/* Admin */}
              {group.admin && (
                <TouchableOpacity
                  style={styles.memberItem}
                  onPress={() => handleMemberPress(group.admin._id || group.admin)}
                  activeOpacity={0.7}
                >
                  <View style={styles.memberAvatarContainer}>
                    {group.admin.profilePic ? (
                      <Image
                        source={{ uri: group.admin.profilePic }}
                        style={styles.memberAvatar}
                      />
                    ) : (
                      <View style={styles.memberAvatarPlaceholder}>
                        <Text style={styles.memberAvatarText}>
                          {group.admin.fullname?.charAt(0)?.toUpperCase() || 'A'}
                        </Text>
                      </View>
                    )}
                    {onlineUsers.includes(normalizeId(group.admin._id || group.admin)) && (
                      <View style={styles.memberOnlineIndicator} />
                    )}
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{group.admin.fullname}</Text>
                    <Text style={styles.memberStatus}>
                      {onlineUsers.includes(normalizeId(group.admin._id || group.admin)) ? 'online' : 'offline'}
                    </Text>
                  </View>
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Members */}
              {group.members?.map((member) => {
                const memberId = normalizeId(member._id || member);
                const memberObj = typeof member === 'object' ? member : users.find(u => u._id?.toString() === memberId);
                const isOnline = onlineUsers.includes(memberId);

                return (
                  <TouchableOpacity
                    key={memberId}
                    style={styles.memberItem}
                    onPress={() => handleMemberPress(memberId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.memberAvatarContainer}>
                      {memberObj?.profilePic ? (
                        <Image
                          source={{ uri: memberObj.profilePic }}
                          style={styles.memberAvatar}
                        />
                      ) : (
                        <View style={styles.memberAvatarPlaceholder}>
                          <Text style={styles.memberAvatarText}>
                            {memberObj?.fullname?.charAt(0)?.toUpperCase() || 'M'}
                          </Text>
                        </View>
                      )}
                      {isOnline && (
                        <View style={styles.memberOnlineIndicator} />
                      )}
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {memberObj?.fullname || 'Unknown'}
                      </Text>
                      <Text style={styles.memberStatus}>
                        {isOnline ? 'online' : 'offline'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {(activeTab === 'media' || activeTab === 'files' || activeTab === 'links' || activeTab === 'voice') && (
            <>
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
            </>
          )}
        </View>

        {/* Leave Group Button */}
        {!isAdmin && (
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={handleLeaveGroup}
            disabled={isLeaving}
            activeOpacity={0.7}
          >
            {isLeaving ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                <Text style={styles.leaveButtonText}>Leave Group</Text>
              </>
            )}
          </TouchableOpacity>
        )}
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
  editPicButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  groupName: {
    fontSize: 20,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  editNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  editNameInput: {
    fontSize: 20,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.xs,
    minWidth: 200,
    textAlign: 'center',
  },
  saveButton: {
    padding: spacing.sm,
    borderRadius: 20,
    backgroundColor: `${colors.primary}15`,
  },
  memberCount: {
    fontSize: 14,
    color: commonStyles.textSecondary,
    marginBottom: spacing.lg,
    fontWeight: '400',
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
  editableDescription: {
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
  },
  descriptionText: {
    fontSize: typography.sm,
    color: commonStyles.textSecondary,
    lineHeight: 22,
    fontWeight: '500',
  },
  editDescriptionContainer: {
    marginTop: spacing.xs,
  },
  editDescriptionInput: {
    fontSize: typography.sm,
    color: commonStyles.textPrimary,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    fontWeight: '400',
  },
  editDescriptionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundSecondary,
  },
  cancelButtonText: {
    fontSize: typography.sm,
    color: commonStyles.textSecondary,
    fontWeight: '600',
  },
  saveDescriptionButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  saveDescriptionButtonText: {
    fontSize: typography.sm,
    color: colors.textWhite,
    fontWeight: '700',
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
  membersList: {
    padding: spacing.lg,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    marginBottom: spacing.sm,
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
  memberAvatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  memberAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: commonStyles.borderColor,
  },
  memberAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: commonStyles.borderColor,
  },
  memberAvatarText: {
    fontSize: typography.xl,
    fontWeight: 'bold',
    color: colors.textWhite,
  },
  memberOnlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: commonStyles.backgroundPrimary,
    ...Platform.select({
      ios: {
        shadowColor: '#10b981',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: typography.base,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    letterSpacing: 0.2,
  },
  memberStatus: {
    fontSize: typography.xs,
    color: commonStyles.textSecondary,
    marginTop: 4,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  adminBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  adminBadgeText: {
    fontSize: typography.xs,
    fontWeight: '700',
    color: colors.textWhite,
    letterSpacing: 0.5,
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
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ef4444',
    backgroundColor: isDark ? commonStyles.backgroundTertiary : commonStyles.backgroundPrimary,
    gap: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  leaveButtonText: {
    fontSize: typography.base,
    fontWeight: '700',
    color: '#ef4444',
    letterSpacing: 0.3,
  },
});
