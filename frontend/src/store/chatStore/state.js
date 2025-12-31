// Initial state for the chat store
export const initialState = {
  messages: [],
  hasMoreMessages: false, // Track if there are more messages to load
  isLoadingMoreMessages: false, // Track loading state for pagination
  lastLoadBeforeMessageId: null, // Prevent duplicate pagination requests
  users: [],
  allUsers: [], // All users for contacts page (separate from users with conversations)\
  isAllUsersLoading: false,
  contacts: [],
  pendingRequests: [],
  isContactsLoading: false,
  isRequestsLoading: false,
  groups: [],
  selectedUser: null,
  selectedGroup: null,
  selectedSavedMessages: false, // Track if saved messages is selected
  isUsersLoading: false,
  isGroupsLoading: false,
  isMessagesLoading: false,
  typingUsers: [],
  editingUsers: [],
  deletingUsers: [],
  uploadingPhotoUsers: [],
  isCurrentUserUploading: false, // Track if current user is uploading
  uploadProgress: 0, // Real upload progress percentage (0-100)
  uploadType: null, // Type of upload: 'image', 'file', or null
  uploadingImagePreview: null, // Preview of image being uploaded
  groupTypingUsers: {}, // { groupId: [{ userId, senderName }] }
  groupEditingUsers: {}, // { groupId: [userId] }
  groupDeletingUsers: {}, // { groupId: [userId] }
  groupUploadingPhotoUsers: {}, // { groupId: [userId] }
  lastMessages: {},
  groupLastMessages: {},
  unreadMessages: {}, // { userId: count } or { groupId: count }
  conversationPagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasMore: false }, // Pagination for conversations (Telegram-style)
  isLoadingMoreConversations: false, // Track loading state for loading more conversations
};

