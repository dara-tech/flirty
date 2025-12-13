import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Platform, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { useTheme } from '../theme';

export default function ContactsScreen({ navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const chatStore = useChatStore();
  const authStore = useAuthStore();
  const contacts = chatStore?.contacts ?? [];
  const pendingRequests = chatStore?.pendingRequests ?? [];
  const isContactsLoading = chatStore?.isContactsLoading ?? false;
  const isRequestsLoading = chatStore?.isRequestsLoading ?? false;
  const onlineUsers = authStore?.onlineUsers ?? [];
  
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' or 'requests'
  const [searchQuery, setSearchQuery] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Fetch contacts and requests on mount
  useEffect(() => {
    chatStore.getContacts();
    chatStore.getPendingRequests();
  }, []);

  const handleContactPress = (contact) => {
    chatStore.setSelectedUser(contact);
    chatStore.getMessages(contact._id);
    navigation?.navigate('Conversation', { 
      userId: contact._id, 
      userName: contact.fullname 
    });
  };

  const handleSendRequest = async () => {
    if (!emailInput.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    setIsSendingRequest(true);
    try {
      await chatStore.sendContactRequest(emailInput.trim());
      setEmailInput('');
      Alert.alert('Success', 'Contact request sent successfully');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to send request';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      await chatStore.acceptContactRequest(requestId);
      Alert.alert('Success', 'Contact request accepted');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to accept request';
      Alert.alert('Error', errorMessage);
    }
  };

  const handleRejectRequest = async (requestId) => {
    Alert.alert(
      'Reject Request',
      'Are you sure you want to reject this request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatStore.rejectContactRequest(requestId);
            } catch (error) {
              const errorMessage = error.response?.data?.message || error.message || 'Failed to reject request';
              Alert.alert('Error', errorMessage);
            }
          },
        },
      ]
    );
  };

  const isOnline = (userId) => {
    const userIdStr = userId?.toString();
    return onlineUsers.includes(userIdStr);
  };

  // Filter contacts based on search
  const filteredContacts = contacts.filter((contact) => {
    const query = searchQuery.toLowerCase();
    return (
      contact.fullname?.toLowerCase().includes(query) ||
      contact.email?.toLowerCase().includes(query)
    );
  });

  // Filter requests based on search
  const filteredRequests = pendingRequests.filter((request) => {
    const sender = request.senderId;
    if (!sender) return false;
    const query = searchQuery.toLowerCase();
    return (
      sender.fullname?.toLowerCase().includes(query) ||
      sender.email?.toLowerCase().includes(query)
    );
  });

  if (isContactsLoading || isRequestsLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Contacts</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Contacts</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'contacts' && styles.activeTab]}
          onPress={() => setActiveTab('contacts')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'contacts' && styles.activeTabText]}>
            Contacts ({contacts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
          onPress={() => setActiveTab('requests')}
          activeOpacity={0.7}
        >
          <View style={styles.tabWithBadge}>
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests
            </Text>
            {pendingRequests.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRequests.length}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={commonStyles.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor={commonStyles.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Email Input for Requests Tab */}
      {activeTab === 'requests' && (
        <View style={styles.emailInputContainer}>
          <TextInput
            style={styles.emailInput}
            placeholder="Enter email to send request"
            placeholderTextColor={commonStyles.textTertiary}
            value={emailInput}
            onChangeText={setEmailInput}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, isSendingRequest && styles.sendButtonDisabled]}
            onPress={handleSendRequest}
            disabled={isSendingRequest}
            activeOpacity={0.7}
          >
            <Ionicons name="send" size={20} color={colors.textWhite} />
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={activeTab === 'contacts' ? filteredContacts : filteredRequests}
        keyExtractor={(item) => {
          if (activeTab === 'contacts') {
            return item._id?.toString() || Math.random().toString();
          } else {
            return item._id?.toString() || Math.random().toString();
          }
        }}
        renderItem={({ item }) => {
          if (activeTab === 'contacts') {
            return renderContactItem(item);
          } else {
            return renderRequestItem(item);
          }
        }}
        contentContainerStyle={(activeTab === 'contacts' ? filteredContacts : filteredRequests).length === 0 ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'contacts' ? '👥' : '📩'}
              </Text>
            </View>
            <Text style={styles.emptyText}>
              {activeTab === 'contacts' 
                ? (searchQuery ? 'No contacts found' : 'No contacts yet')
                : (searchQuery ? 'No requests found' : 'No pending requests')}
            </Text>
            <Text style={styles.emptySubtext}>
              {activeTab === 'contacts'
                ? 'Add contacts to start chatting'
                : 'You have no pending contact requests'}
            </Text>
          </View>
        }
      />
    </View>
  );

  function renderContactItem(contact) {
    const online = isOnline(contact._id);
    const hasProfilePic = contact.profilePic && contact.profilePic.trim() !== '';
    
    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleContactPress(contact)}
        activeOpacity={0.6}
      >
        <View style={styles.avatarContainer}>
          {hasProfilePic ? (
            <Image
              source={{ uri: contact.profilePic }}
              style={[styles.avatarImage, online && styles.avatarOnline]}
            />
          ) : (
            <View style={[styles.avatar, online && styles.avatarOnline]}>
              <Text style={styles.avatarText}>
                {contact.fullname?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>
        
        <View style={styles.contactInfo}>
          <View style={styles.contactInfoHeader}>
            <Text style={styles.contactName} numberOfLines={1}>
              {contact.fullname || 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.emailPreview}>
            <Text style={styles.contactEmail} numberOfLines={1}>
              {contact.email}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderRequestItem(request) {
    const sender = request.senderId;
    if (!sender) return null;
    
    const online = isOnline(sender._id);
    const hasProfilePic = sender.profilePic && sender.profilePic.trim() !== '';
    
    return (
      <View style={styles.requestItem}>
        <View style={styles.avatarContainer}>
          {hasProfilePic ? (
            <Image
              source={{ uri: sender.profilePic }}
              style={[styles.avatarImage, online && styles.avatarOnline]}
            />
          ) : (
            <View style={[styles.avatar, online && styles.avatarOnline]}>
              <Text style={styles.avatarText}>
                {sender.fullname?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>
        
        <View style={styles.contactInfo}>
          <View style={styles.contactInfoHeader}>
            <Text style={styles.contactName} numberOfLines={1}>
              {sender.fullname || 'Unknown'}
            </Text>
          </View>
          
          <View style={styles.emailPreview}>
            <Text style={styles.contactEmail} numberOfLines={1}>
              {sender.email}
            </Text>
          </View>
        </View>

        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.requestButton, styles.acceptButton]}
            onPress={() => handleAcceptRequest(request._id)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={20} color={colors.textWhite} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestButton, styles.rejectButton]}
            onPress={() => handleRejectRequest(request._id)}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={colors.textWhite} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }
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
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: commonStyles.backgroundPrimary,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: commonStyles.backgroundSecondary,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: commonStyles.textSecondary,
  },
  activeTabText: {
    color: colors.textWhite,
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    backgroundColor: colors.error || '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: colors.textWhite,
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: commonStyles.backgroundSecondary,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    height: 44,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: commonStyles.textPrimary,
    paddingVertical: 0,
  },
  emailInputContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  emailInput: {
    flex: 1,
    backgroundColor: commonStyles.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: commonStyles.textPrimary,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
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
  contactItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: commonStyles.backgroundPrimary,
  },
  requestItem: {
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
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  contactName: {
    color: commonStyles.textPrimary,
    fontWeight: '600',
    fontSize: 17,
    flex: 1,
    marginRight: spacing.sm,
    letterSpacing: 0.1,
  },
  emailPreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactEmail: {
    color: commonStyles.textSecondary,
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  requestButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#34A853',
  },
  rejectButton: {
    backgroundColor: colors.error || '#EF4444',
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
});

