import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import axiosInstance from "../lib/api";
import { useAuthStore } from "./useAuthStore";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Safety timeout for loading states (ms) */
const LOADING_SAFETY_TIMEOUT = 12000;

/** Supported audio formats with their MIME types and codecs */
const AUDIO_FORMATS = {
  m4a: { format: "m4a", codecs: "mp4a.40.2" },
  webm: { format: "webm", codecs: "opus" },
  mp3: { format: "mp3", codecs: "mp3" },
  aac: { format: "aac", codecs: "mp4a.40.2" },
};

/** Default MIME types for media */
const DEFAULT_MIME_TYPES = {
  image: "image/jpeg",
  video: "video/mp4",
  file: "application/octet-stream",
  audio: "audio/webm",
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get base64 encoding constant - handles different expo-file-system versions
 * @returns {string} The base64 encoding constant
 */
const getBase64Encoding = () => {
  try {
    if (FileSystem.EncodingType?.Base64 != null) {
      return FileSystem.EncodingType.Base64;
    }
  } catch (e) {
    // Fall through to default
  }
  if (__DEV__) {
    console.warn(
      "FileSystem.EncodingType.Base64 not found, using string fallback"
    );
  }
  return "base64";
};

/**
 * Normalize MongoDB ObjectId to string format
 * @param {string|object} id - The ID to normalize
 * @returns {string|null} Normalized ID string or null
 */
const normalizeId = (id) => {
  if (!id) return null;
  if (typeof id === "string") return id;
  if (typeof id === "object" && id._id) return id._id.toString();
  return id?.toString() ?? null;
};

/**
 * Check if error is a network-related error
 * @param {Error} error - The error to check
 * @returns {boolean} True if network error
 */
const isNetworkError = (error) => {
  const networkErrorCodes = [
    "ECONNABORTED",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ERR_NETWORK",
    "NETWORK_ERROR",
  ];
  const networkErrorMessages = [
    "timeout",
    "TIMEOUT",
    "Network",
    "Network request failed",
  ];

  return (
    networkErrorCodes.includes(error.code) ||
    error.name === "TimeoutError" ||
    networkErrorMessages.some((msg) => error.message?.includes(msg)) ||
    (!error.response && error.request)
  );
};

/**
 * Get audio format info from URI
 * @param {string} uri - Audio file URI
 * @returns {{ format: string, codecs: string }} Audio format info
 */
const getAudioFormatFromUri = (uri) => {
  const uriLower = uri.toLowerCase();
  for (const [ext, info] of Object.entries(AUDIO_FORMATS)) {
    if (uriLower.endsWith(`.${ext}`) || uriLower.includes(`.${ext}`)) {
      return info;
    }
  }
  return AUDIO_FORMATS.webm; // Default
};

/**
 * Extract MIME type from filename
 * @param {string} filename - The filename
 * @param {string} type - Media type (image/video/file)
 * @returns {string} MIME type
 */
const getMimeTypeFromFilename = (filename, type) => {
  const match = /\.(\w+)$/.exec(filename);
  if (match) {
    return `${type}/${match[1]}`;
  }
  return DEFAULT_MIME_TYPES[type] || DEFAULT_MIME_TYPES.file;
};

/**
 * Convert file to base64 data URI
 * @param {string} uri - File URI
 * @param {string} mimeType - MIME type for data URI
 * @returns {Promise<string>} Base64 data URI
 */
const fileToBase64DataUri = async (uri, mimeType) => {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: getBase64Encoding(),
  });
  return `data:${mimeType};base64,${base64}`;
};

/**
 * Create a safety timeout that clears loading state
 * @param {Function} getState - Zustand get function
 * @param {Function} setState - Zustand set function
 * @param {string} loadingKey - The loading state key
 * @param {string} context - Context for logging
 * @returns {number} Timeout ID
 */
const createLoadingSafetyTimeout = (
  getState,
  setState,
  loadingKey,
  context
) => {
  return setTimeout(() => {
    const currentState = getState();
    if (currentState[loadingKey]) {
      console.warn(
        `⚠️ ${context} safety timeout - force clearing loading state`
      );
      setState({ [loadingKey]: false });
    }
  }, LOADING_SAFETY_TIMEOUT);
};

/**
 * Handle API error with proper logging and state cleanup
 * @param {Error} error - The error
 * @param {string} context - Error context
 * @param {Function} setState - Zustand set function
 * @param {object} resetState - State to set on error
 */
const handleApiError = (error, context, setState, resetState) => {
  console.error(`Error ${context}:`, error);

  if (isNetworkError(error)) {
    console.warn(`⚠️ Network issue: ${context}. Check backend connection.`);
  }

  setState(resetState);

  if (error.response?.status === 401) {
    useAuthStore.getState().logout();
  }
};

// ============================================================================
// MEDIA CONVERSION UTILITIES
// ============================================================================

/**
 * Convert image to base64 data URI
 * @param {string} imageUri - Image file URI
 * @returns {Promise<string>} Base64 data URI
 */
const convertImageToBase64 = async (imageUri) => {
  const filename = imageUri.split("/").pop();
  const mimeType = getMimeTypeFromFilename(filename, "image");
  return fileToBase64DataUri(imageUri, mimeType);
};

/**
 * Convert video to base64 data URI
 * @param {string|object} videoUri - Video file URI or object with uri property
 * @returns {Promise<{ dataUri: string, duration?: number }>} Base64 data URI and optional duration
 */
const convertVideoToBase64 = async (videoUri) => {
  const videoUriString = typeof videoUri === "object" ? videoUri.uri : videoUri;
  const filename = videoUriString.split("/").pop();
  const mimeType = getMimeTypeFromFilename(filename, "video");
  const dataUri = await fileToBase64DataUri(videoUriString, mimeType);
  return {
    dataUri,
    duration: typeof videoUri === "object" ? videoUri.duration : undefined,
  };
};

/**
 * Convert file to base64 data URI with metadata
 * @param {object} fileUri - File object with uri, mimeType, name, size
 * @returns {Promise<object>} Object with dataUri and metadata
 */
const convertFileToBase64 = async (fileUri) => {
  const mimeType = fileUri.mimeType || DEFAULT_MIME_TYPES.file;
  const dataUri = await fileToBase64DataUri(fileUri.uri, mimeType);
  return {
    dataUri,
    fileName: fileUri.name || fileUri.uri.split("/").pop(),
    fileSize: fileUri.size || null,
    fileType: mimeType,
  };
};

/**
 * Convert audio to base64 data URI with validation
 * @param {string} audioUri - Audio file URI
 * @returns {Promise<string>} Base64 data URI
 */
const convertAudioToBase64 = async (audioUri) => {
  if (!audioUri || typeof audioUri !== "string") {
    throw new Error("Invalid audio URI");
  }

  // Validate file exists
  let fileInfo = { exists: true };
  try {
    fileInfo = await FileSystem.getInfoAsync(audioUri);
  } catch (fsError) {
    if (__DEV__) {
      console.warn(
        "⚠️ FileSystem.getInfoAsync failed, attempting direct read:",
        fsError.message
      );
    }
  }

  if (fileInfo && !fileInfo.exists) {
    throw new Error(`Audio file does not exist at: ${audioUri}`);
  }

  if (fileInfo && fileInfo.size === 0) {
    throw new Error("Audio file is empty (0 bytes)");
  }

  // Read file
  const base64 = await FileSystem.readAsStringAsync(audioUri, {
    encoding: getBase64Encoding(),
  });

  if (!base64 || base64.length === 0) {
    throw new Error("Audio file read as empty string");
  }

  // Get format and create data URI
  const { format, codecs } = getAudioFormatFromUri(audioUri);
  return `data:audio/${format};codecs=${codecs};base64,${base64}`;
};

/**
 * Build message data object from media inputs
 * @param {object} params - Parameters for building message data
 * @returns {Promise<object>} Message data object
 */
const buildMessageData = async ({
  text,
  imageUri,
  videoUri,
  fileUri,
  audioUri,
}) => {
  const messageData = {};

  if (text?.trim()) {
    messageData.text = text.trim();
  }

  if (imageUri) {
    messageData.image = await convertImageToBase64(imageUri);
  }

  if (videoUri) {
    const { dataUri, duration } = await convertVideoToBase64(videoUri);
    messageData.video = dataUri;
    if (duration) {
      messageData.videoDuration = duration;
    }
  }

  if (fileUri) {
    const { dataUri, fileName, fileSize, fileType } = await convertFileToBase64(
      fileUri
    );
    messageData.file = dataUri;
    messageData.fileName = fileName;
    messageData.fileSize = fileSize;
    messageData.fileType = fileType;
  }

  if (audioUri) {
    messageData.audio = await convertAudioToBase64(audioUri);
  }

  return messageData;
};

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
  messages: [],
  users: [],
  groups: [],
  contacts: [],
  pendingRequests: [],
  selectedUser: null,
  selectedGroup: null,
  lastMessages: {}, // { [userId]: message } - last message for each conversation
  lastGroupMessages: {}, // { [groupId]: message } - last message for each group
  isContactsLoading: false,
  isRequestsLoading: false,
  isUsersLoading: false,
  isGroupsLoading: false,
  isMessagesLoading: false,
  typingUsers: [],
};

// ============================================================================
// STORE DEFINITION
// ============================================================================

export const useChatStore = create((set, get) => ({
  ...initialState,

  // Set messages
  setMessages: (messages) => set({ messages }),

  // Add message (only if it belongs to current conversation)
  addMessage: (message) => {
    const state = get();
    const authUser = useAuthStore.getState().authUser;

    if (!authUser) return;

    // Determine the other user in the conversation
    const senderId = message.sender?._id || message.senderId;
    const receiverId = message.receiver?._id || message.receiverId;
    const authUserId = authUser._id?.toString();

    const otherUserId =
      senderId?.toString() === authUserId
        ? receiverId?.toString()
        : senderId?.toString();

    // Check if message already exists to prevent duplicates
    const messageExists = state.messages.some(
      (msg) => msg._id?.toString() === message._id?.toString()
    );

    if (messageExists) {
      // Update existing message instead
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id?.toString() === message._id?.toString() ? message : msg
        ),
        lastMessages: {
          ...state.lastMessages,
          [otherUserId]: message,
        },
      }));
    } else {
      // Add new message
      set((state) => ({
        messages: [...state.messages, message],
        lastMessages: {
          ...state.lastMessages,
          [otherUserId]: message,
        },
      }));
    }
  },

  // Set users
  setUsers: (users) => set({ users }),

  // Set contacts
  setContacts: (contacts) => set({ contacts }),

  // Set selected user
  setSelectedUser: (user) => set({ selectedUser: user }),

  // Set selected group
  setSelectedGroup: (group) => set({ selectedGroup: group }),

  // Set groups
  setGroups: (groups) => set({ groups }),

  // Fetch groups with optimized loading and caching
  getGroups: async () => {
    const authUser = useAuthStore.getState().authUser;
    const resetState = {
      groups: [],
      lastGroupMessages: {},
      isGroupsLoading: false,
    };

    if (!authUser) {
      set(resetState);
      return;
    }

    // Smart loading: Only show spinner if no cached data
    const { groups, isGroupsLoading } = get();
    const hasCache = groups?.length > 0;
    if (!hasCache && !isGroupsLoading) {
      set({ isGroupsLoading: true });
    } else if (hasCache && isGroupsLoading) {
      set({ isGroupsLoading: false });
    }

    const safetyTimeout = createLoadingSafetyTimeout(
      get,
      set,
      "isGroupsLoading",
      "getGroups"
    );

    try {
      // Parallel API calls for better performance
      const [groupsRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get("/groups/my-groups"),
        axiosInstance.get("/groups/last-messages"),
      ]);
      clearTimeout(safetyTimeout);

      // Handle auth errors
      if (groupsRes.status === 401 || lastMessagesRes.status === 401) {
        useAuthStore.getState().logout();
        set(resetState);
        return;
      }

      // Process data
      const groupsData = Array.isArray(groupsRes.data) ? groupsRes.data : [];
      const lastMessagesData = Array.isArray(lastMessagesRes.data)
        ? lastMessagesRes.data
        : [];

      // Build last messages map
      const lastGroupMessagesMap = lastMessagesData.reduce((acc, msg) => {
        const groupId = normalizeId(msg.groupId);
        if (groupId) acc[groupId] = msg;
        return acc;
      }, {});

      set({
        groups: groupsData,
        lastGroupMessages: lastGroupMessagesMap,
        isGroupsLoading: false,
      });

      if (__DEV__) {
        console.log(`✅ Loaded ${groupsData.length} groups`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      handleApiError(error, "loading groups", set, resetState);
    }
  },

  // Fetch contacts with optimized loading
  getContacts: async () => {
    const authUser = useAuthStore.getState().authUser;
    const resetState = { contacts: [], isContactsLoading: false };

    if (!authUser) {
      set(resetState);
      return;
    }

    // Smart loading: Only show spinner if no cached data
    const { contacts, isContactsLoading } = get();
    const hasCache = contacts?.length > 0;
    if (!hasCache && !isContactsLoading) {
      set({ isContactsLoading: true });
    } else if (hasCache && isContactsLoading) {
      set({ isContactsLoading: false });
    }

    const safetyTimeout = createLoadingSafetyTimeout(
      get,
      set,
      "isContactsLoading",
      "getContacts"
    );

    try {
      const res = await axiosInstance.get("/contacts");
      clearTimeout(safetyTimeout);

      if (res.status === 401) {
        useAuthStore.getState().logout();
        set(resetState);
        return;
      }

      set({ contacts: res.data || [], isContactsLoading: false });

      if (__DEV__) {
        console.log(`✅ Loaded ${(res.data || []).length} contacts`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      handleApiError(error, "loading contacts", set, resetState);
    }
  },

  // Fetch users (only people you've messaged with)
  getUsers: async () => {
    const authUser = useAuthStore.getState().authUser;
    const resetState = { users: [], lastMessages: {}, isUsersLoading: false };

    if (!authUser) {
      set(resetState);
      return;
    }

    // Smart loading: Only show spinner if no cached data
    const { users, isUsersLoading } = get();
    const hasCache = users?.length > 0;
    if (!hasCache && !isUsersLoading) {
      set({ isUsersLoading: true });
    } else if (hasCache && isUsersLoading) {
      set({ isUsersLoading: false });
    }

    const safetyTimeout = createLoadingSafetyTimeout(
      get,
      set,
      "isUsersLoading",
      "getUsers"
    );

    try {
      // Parallel API calls for better performance
      const [usersRes, lastMessagesRes] = await Promise.all([
        axiosInstance.get("/messages/users"),
        axiosInstance.get("/messages/last-messages"),
      ]);
      clearTimeout(safetyTimeout);

      // Handle auth errors
      if (usersRes.status === 401 || lastMessagesRes.status === 401) {
        useAuthStore.getState().logout();
        set(resetState);
        return;
      }

      // Process data
      const lastMessagesData = Array.isArray(lastMessagesRes.data)
        ? lastMessagesRes.data
        : [];
      const usersData = Array.isArray(usersRes.data)
        ? usersRes.data
        : usersRes.data?.users || [];
      const authUserId = normalizeId(authUser._id);

      // Build last messages map
      const lastMessagesMap = lastMessagesData.reduce((acc, msg) => {
        const senderId = normalizeId(msg.senderId?._id || msg.senderId);
        const receiverId = normalizeId(msg.receiverId?._id || msg.receiverId);
        if (!senderId || !receiverId) return acc;
        const otherUserId = senderId === authUserId ? receiverId : senderId;
        if (otherUserId) acc[otherUserId] = msg;
        return acc;
      }, {});

      // Build unique users list using Set for O(1) lookups
      const seenIds = new Set();
      const uniqueUsers = [];

      // Add users from primary endpoint
      for (const user of usersData) {
        const userId = normalizeId(user._id);
        if (userId && !seenIds.has(userId)) {
          seenIds.add(userId);
          uniqueUsers.push(user);
        }
      }

      // Add users from lastMessages (if not already added)
      for (const msg of lastMessagesData) {
        const senderId = normalizeId(msg.senderId?._id || msg.senderId);
        const receiverId = normalizeId(msg.receiverId?._id || msg.receiverId);
        if (!senderId || !receiverId) continue;

        const isOtherSender = senderId !== authUserId;
        const otherUser = isOtherSender ? msg.senderId : msg.receiverId;

        if (otherUser && typeof otherUser === "object" && otherUser._id) {
          const userId = normalizeId(otherUser._id);
          if (userId && !seenIds.has(userId)) {
            seenIds.add(userId);
            uniqueUsers.push(otherUser);
          }
        }
      }

      set({
        users: uniqueUsers,
        lastMessages: lastMessagesMap,
        isUsersLoading: false,
      });

      if (__DEV__) {
        console.log(`✅ Loaded ${uniqueUsers.length} users`);
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      handleApiError(error, "loading users", set, resetState);
    }
  },

  // Fetch pending contact requests
  getPendingRequests: async () => {
    const authUser = useAuthStore.getState().authUser;
    if (!authUser) {
      set({ pendingRequests: [], isRequestsLoading: false });
      return;
    }

    set({ isRequestsLoading: true });
    try {
      const res = await axiosInstance.get("/contacts/requests");
      set({ pendingRequests: res.data || [], isRequestsLoading: false });
    } catch (error) {
      console.error("Error loading pending requests:", error);
      set({
        pendingRequests:
          error.response?.status === 401 ? [] : get().pendingRequests,
        isRequestsLoading: false,
      });
    }
  },

  // Send contact request by email
  sendContactRequest: async (email) => {
    if (!email?.trim()) {
      throw new Error("Email is required");
    }
    try {
      const res = await axiosInstance.post("/contacts/request", {
        email: email.trim(),
      });
      get().getPendingRequests();
      return res.data;
    } catch (error) {
      console.error("Error sending contact request:", error);
      throw error;
    }
  },

  // Accept contact request
  acceptContactRequest: async (requestId) => {
    if (!requestId) {
      throw new Error("Request ID is required");
    }
    try {
      const res = await axiosInstance.post("/contacts/accept", { requestId });
      // Refresh both contacts and pending requests in parallel
      await Promise.all([get().getContacts(), get().getPendingRequests()]);
      return res.data;
    } catch (error) {
      console.error("Error accepting contact request:", error);
      throw error;
    }
  },

  // Reject contact request
  rejectContactRequest: async (requestId) => {
    if (!requestId) {
      throw new Error("Request ID is required");
    }
    try {
      const res = await axiosInstance.post("/contacts/reject", { requestId });
      get().getPendingRequests();
      return res.data;
    } catch (error) {
      console.error("Error rejecting contact request:", error);
      throw error;
    }
  },

  // Fetch messages for a conversation
  getMessages: async (userId) => {
    const authUser = useAuthStore.getState().authUser;
    const resetState = { messages: [], isMessagesLoading: false };

    if (!authUser || !userId) {
      set(resetState);
      return;
    }

    // Clear stale messages and show loading
    set({ isMessagesLoading: true, messages: [] });

    const safetyTimeout = createLoadingSafetyTimeout(
      get,
      set,
      "isMessagesLoading",
      "getMessages"
    );

    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      clearTimeout(safetyTimeout);

      const messagesData = Array.isArray(res.data)
        ? res.data
        : res.data?.messages || [];
      set({ messages: messagesData, isMessagesLoading: false });

      if (__DEV__) {
        console.log(
          `✅ Loaded ${messagesData.length} messages for user ${userId}`
        );
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      handleApiError(error, "loading messages", set, resetState);
    }
  },

  // Fetch messages for a group
  getGroupMessages: async (groupId) => {
    const authUser = useAuthStore.getState().authUser;
    const resetState = { messages: [], isMessagesLoading: false };

    if (!authUser || !groupId) {
      set(resetState);
      return;
    }

    // Clear stale messages and show loading
    set({ isMessagesLoading: true, messages: [] });

    const safetyTimeout = createLoadingSafetyTimeout(
      get,
      set,
      "isMessagesLoading",
      "getGroupMessages"
    );

    try {
      const res = await axiosInstance.get(`/groups/${groupId}/messages`);
      clearTimeout(safetyTimeout);

      const messagesData = Array.isArray(res.data)
        ? res.data
        : res.data?.messages || [];
      set({ messages: messagesData, isMessagesLoading: false });

      if (__DEV__) {
        console.log(
          `✅ Loaded ${messagesData.length} messages for group ${groupId}`
        );
      }
    } catch (error) {
      clearTimeout(safetyTimeout);
      handleApiError(error, "loading group messages", set, resetState);
    }
  },

  // Send message with support for multiple media types
  sendMessage: async (
    receiverId,
    text,
    imageUris = [],
    videoUris = [],
    fileUris = [],
    audioUri = null
  ) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    // Normalize to arrays
    const images = Array.isArray(imageUris)
      ? imageUris
      : imageUris
      ? [imageUris]
      : [];
    const videos = Array.isArray(videoUris)
      ? videoUris
      : videoUris
      ? [videoUris]
      : [];
    const files = Array.isArray(fileUris)
      ? fileUris
      : fileUris
      ? [fileUris]
      : [];

    const hasContent =
      text?.trim() ||
      images.length ||
      videos.length ||
      files.length ||
      audioUri;
    if (!authUser || !receiverId || !hasContent) {
      throw new Error("Invalid message data");
    }

    const messages = [];
    const totalMedia = images.length + videos.length + files.length;
    const shouldSendTextSeparately = text?.trim() && totalMedia > 0;

    // Send text separately if there are multiple media items
    if (shouldSendTextSeparately) {
      try {
        const res = await axiosInstance.post(`/messages/send/${receiverId}`, {
          text: text.trim(),
        });
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error("Error sending text message:", error);
      }
    }

    // Build media queue
    const mediaQueue = [
      ...images.map((uri) => ({ type: "image", uri })),
      ...videos.map((video) => ({
        type: "video",
        ...(typeof video === "object" ? video : { uri: video }),
      })),
      ...files.map((file) => ({
        type: "file",
        ...(typeof file === "object" ? file : { uri: file }),
      })),
    ];

    // Include text with single media item
    if (mediaQueue.length === 1 && !shouldSendTextSeparately && text?.trim()) {
      mediaQueue[0].text = text.trim();
    }

    // Process media queue
    for (const media of mediaQueue) {
      try {
        const messageData = media.text ? { text: media.text } : {};

        if (media.type === "image") {
          messageData.image = await convertImageToBase64(media.uri);
        } else if (media.type === "video") {
          const { dataUri, duration } = await convertVideoToBase64(media);
          messageData.video = dataUri;
          if (duration) messageData.videoDuration = duration;
        } else if (media.type === "file") {
          const fileData = await convertFileToBase64(media);
          Object.assign(messageData, {
            file: fileData.dataUri,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
          });
        }

        const res = await axiosInstance.post(
          `/messages/send/${receiverId}`,
          messageData
        );
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error(`Error sending ${media.type}:`, error);
      }
    }

    // Handle audio separately
    if (audioUri) {
      try {
        const audioData = await convertAudioToBase64(audioUri);
        const res = await axiosInstance.post(`/messages/send/${receiverId}`, {
          audio: audioData,
        });
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error("Error sending audio:", error);
      }
    }

    // Emit socket event for real-time delivery
    if (socket?.connected && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      socket.emit("sendMessage", {
        receiverId,
        text: lastMessage.text,
        image: lastMessage.image,
        video: lastMessage.video,
        file: lastMessage.file,
        audio: lastMessage.audio,
      });
    }

    return messages.length > 0 ? messages : null;
  },

  // Internal helper for single media message
  _sendSingleMediaMessage: async (
    receiverId,
    text,
    imageUri = null,
    videoUri = null,
    fileUri = null,
    audioUri = null
  ) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    const hasContent =
      text?.trim() || imageUri || videoUri || fileUri || audioUri;
    if (!authUser || !receiverId || !hasContent) {
      throw new Error("Invalid message data");
    }

    try {
      const messageData = await buildMessageData({
        text,
        imageUri,
        videoUri,
        fileUri,
        audioUri,
      });
      const res = await axiosInstance.post(
        `/messages/send/${receiverId}`,
        messageData
      );
      const message = res.data;

      get().addMessage(message);

      // Emit socket event
      if (socket?.connected) {
        socket.emit("sendMessage", { receiverId, ...messageData });
      }

      return message;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  },

  // Send group message with support for multiple media types
  sendGroupMessage: async (
    groupId,
    text,
    imageUris = [],
    videoUris = [],
    fileUris = [],
    audioUri = null
  ) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    // Normalize to arrays
    const images = Array.isArray(imageUris)
      ? imageUris
      : imageUris
      ? [imageUris]
      : [];
    const videos = Array.isArray(videoUris)
      ? videoUris
      : videoUris
      ? [videoUris]
      : [];
    const files = Array.isArray(fileUris)
      ? fileUris
      : fileUris
      ? [fileUris]
      : [];

    const hasContent =
      text?.trim() ||
      images.length ||
      videos.length ||
      files.length ||
      audioUri;
    if (!authUser || !groupId || !hasContent) {
      throw new Error("Invalid message data");
    }

    const messages = [];
    const totalMedia = images.length + videos.length + files.length;
    const shouldSendTextSeparately = text?.trim() && totalMedia > 0;

    // Send text separately if there are multiple media items
    if (shouldSendTextSeparately) {
      try {
        const res = await axiosInstance.post(`/groups/${groupId}/send`, {
          text: text.trim(),
        });
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error("Error sending text message:", error);
      }
    }

    // Build media queue
    const mediaQueue = [
      ...images.map((uri) => ({ type: "image", uri })),
      ...videos.map((video) => ({
        type: "video",
        ...(typeof video === "object" ? video : { uri: video }),
      })),
      ...files.map((file) => ({
        type: "file",
        ...(typeof file === "object" ? file : { uri: file }),
      })),
    ];

    // Include text with single media item
    if (mediaQueue.length === 1 && !shouldSendTextSeparately && text?.trim()) {
      mediaQueue[0].text = text.trim();
    }

    // Process media queue
    for (const media of mediaQueue) {
      try {
        const messageData = media.text ? { text: media.text } : {};

        if (media.type === "image") {
          messageData.image = await convertImageToBase64(media.uri);
        } else if (media.type === "video") {
          const { dataUri, duration } = await convertVideoToBase64(media);
          messageData.video = dataUri;
          if (duration) messageData.videoDuration = duration;
        } else if (media.type === "file") {
          const fileData = await convertFileToBase64(media);
          Object.assign(messageData, {
            file: fileData.dataUri,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
          });
        }

        const res = await axiosInstance.post(
          `/groups/${groupId}/send`,
          messageData
        );
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error(`Error sending ${media.type}:`, error);
      }
    }

    // Handle audio separately
    if (audioUri) {
      try {
        const audioData = await convertAudioToBase64(audioUri);
        const res = await axiosInstance.post(`/groups/${groupId}/send`, {
          audio: audioData,
        });
        get().addMessage(res.data);
        messages.push(res.data);
      } catch (error) {
        console.error("Error sending audio:", error);
      }
    }

    // Emit socket event for real-time delivery
    if (socket?.connected && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      socket.emit("sendGroupMessage", {
        groupId,
        text: lastMessage.text,
        image: lastMessage.image,
        video: lastMessage.video,
        file: lastMessage.file,
        audio: lastMessage.audio,
      });
    }

    return messages.length > 0 ? messages : null;
  },

  // Internal helper for single group message
  _sendSingleGroupMessage: async (
    groupId,
    text,
    imageUri = null,
    videoUri = null,
    fileUri = null,
    audioUri = null
  ) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    const hasContent =
      text?.trim() || imageUri || videoUri || fileUri || audioUri;
    if (!authUser || !groupId || !hasContent) {
      throw new Error("Invalid message data");
    }

    try {
      const messageData = await buildMessageData({
        text,
        imageUri,
        videoUri,
        fileUri,
        audioUri,
      });
      const res = await axiosInstance.post(
        `/groups/${groupId}/send`,
        messageData
      );
      const message = res.data;

      get().addMessage(message);

      // Emit socket event
      if (socket?.connected) {
        socket.emit("sendGroupMessage", { groupId, ...messageData });
      }

      return message;
    } catch (error) {
      console.error("Error sending group message:", error);
      throw error;
    }
  },

  // Edit message
  editMessage: async (messageId, text) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!authUser || !messageId || !text?.trim()) {
      throw new Error("Invalid message data");
    }

    try {
      const res = await axiosInstance.put(`/messages/${messageId}`, {
        text: text.trim(),
      });

      const updatedMessage = res.data;

      // Update message in local state
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id?.toString() === messageId ? updatedMessage : msg
        ),
      }));

      // Emit via socket
      if (socket && socket.connected) {
        socket.emit("editMessage", {
          messageId,
          text: text.trim(),
        });
      }

      return updatedMessage;
    } catch (error) {
      console.error("Error editing message:", error);
      throw error;
    }
  },

  // Delete message
  deleteMessage: async (messageId) => {
    const authUser = useAuthStore.getState().authUser;
    const socket = useAuthStore.getState().socket;

    if (!authUser || !messageId) {
      throw new Error("Invalid message data");
    }

    try {
      await axiosInstance.delete(`/messages/${messageId}`);

      // Remove message from local state
      set((state) => ({
        messages: state.messages.filter(
          (msg) => msg._id?.toString() !== messageId
        ),
      }));

      // Emit via socket
      if (socket && socket.connected) {
        socket.emit("deleteMessage", { messageId });
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      throw error;
    }
  },

  // Subscribe to socket events for real-time updates (like web)
  subscribeToMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) {
      if (__DEV__) {
        console.log("⚠️ subscribeToMessages: No socket available");
      }
      return () => {}; // Return empty cleanup function
    }

    if (__DEV__) {
      console.log("✅ Setting up socket listeners for real-time messages");
    }

    // Remove existing listeners first to prevent duplicates (like web)
    socket.off("newMessage");
    socket.off("messageSeenUpdate");
    socket.off("messageEdited");
    socket.off("messageDeleted");
    socket.off("conversationDeleted");
    socket.off("messageReactionAdded");
    socket.off("messageReactionRemoved");
    socket.off("reaction-update");

    // Normalize ID helper
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === "string") return id;
      if (typeof id === "object" && id._id) return id._id.toString();
      return id?.toString();
    };

    const handleNewMessage = (message) => {
      // Always log in production too (for debugging real-time issues)
      console.log("📨 New message received (global):", {
        messageId: message._id,
        senderId: message.senderId || message.sender?._id,
        receiverId: message.receiverId || message.receiver?._id,
        text: message.text?.substring(0, 50),
        hasSocket: !!socket,
        socketConnected: socket?.connected,
      });

      const authUser = useAuthStore.getState().authUser;
      if (!authUser || !authUser._id) {
        console.warn("⚠️ No authUser in handleNewMessage");
        return;
      }

      const authUserId = normalizeId(authUser._id);
      const senderId = normalizeId(message.senderId || message.sender?._id);
      const receiverId = normalizeId(
        message.receiverId || message.receiver?._id
      );

      if (!senderId || !receiverId) return;

      // Determine the other user (not the current user)
      const otherUserId = senderId === authUserId ? receiverId : senderId;

      // IMPORTANT: Always update lastMessages for chat list
      // Also add to messages array if it matches current conversation
      // ConversationScreen will also handle adding, but this ensures it works even if ConversationScreen handler fails
      set((state) => {
        // Update lastMessages always (for chat list)
        const updatedLastMessages = {
          ...state.lastMessages,
          [otherUserId]: message,
        };

        // Check if this message should be added to messages array
        // This happens if:
        // 1. It's for the currently selected user/group, OR
        // 2. It's a direct message and matches the conversation pattern
        const currentSelectedUser = state.selectedUser;
        const currentSelectedGroup = state.selectedGroup;
        let shouldAddToMessages = false;

        // Check if it's a group message for selected group
        if (currentSelectedGroup && message.groupId) {
          const msgGroupId = normalizeId(message.groupId);
          const selectedGroupId = normalizeId(currentSelectedGroup._id);
          if (msgGroupId === selectedGroupId) {
            shouldAddToMessages = true;
          }
        }
        // Check if it's a direct message for selected user
        else if (currentSelectedUser) {
          const selectedUserId = normalizeId(currentSelectedUser._id);
          if (selectedUserId === otherUserId) {
            shouldAddToMessages = true;
          }
        }
        // Also check if message matches any conversation in messages array
        // This handles case where selectedUser might not be set but we're viewing a conversation
        else if (state.messages.length > 0) {
          // Check if any existing message in array is from/to this user
          const hasConversationWithUser = state.messages.some((msg) => {
            const msgSenderId = normalizeId(msg.senderId || msg.sender?._id);
            const msgReceiverId = normalizeId(
              msg.receiverId || msg.receiver?._id
            );
            return (
              (msgSenderId === otherUserId || msgReceiverId === otherUserId) &&
              (msgSenderId === authUserId || msgReceiverId === authUserId)
            );
          });
          if (hasConversationWithUser) {
            shouldAddToMessages = true;
          }
        }

        // Only add to messages array if it's for the current conversation
        let updatedMessages = state.messages;
        if (shouldAddToMessages) {
          const messageExists = state.messages.some(
            (msg) => normalizeId(msg._id) === normalizeId(message._id)
          );
          if (!messageExists) {
            updatedMessages = [...state.messages, message];
            if (__DEV__) {
              console.log(
                "✅ Added message to array (global handler):",
                message._id
              );
            }
          } else {
            // Update existing message
            updatedMessages = state.messages.map((msg) =>
              normalizeId(msg._id) === normalizeId(message._id) ? message : msg
            );
          }
        }

        return {
          messages: updatedMessages,
          lastMessages: updatedLastMessages,
        };
      });
    };

    const handleMessageSeenUpdate = ({ messageId, seenAt }) => {
      if (__DEV__) {
        console.log("👁️ Message seen update:", { messageId, seenAt });
      }
      get().updateMessageSeen(messageId, seenAt);
    };

    const handleMessageEdited = (editedMessage) => {
      if (__DEV__) {
        console.log("📝 Message edited:", editedMessage);
      }
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id?.toString() === editedMessage._id?.toString()
            ? {
                ...msg,
                text: editedMessage.text,
                edited: true,
                editedAt: editedMessage.editedAt,
              }
            : msg
        ),
        // Also update last message if it's the edited one
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).map(([userId, lastMsg]) => [
            userId,
            lastMsg._id?.toString() === editedMessage._id?.toString()
              ? {
                  ...lastMsg,
                  text: editedMessage.text,
                  edited: true,
                  editedAt: editedMessage.editedAt,
                }
              : lastMsg,
          ])
        ),
      }));
    };

    const handleMessageDeleted = ({ messageId }) => {
      if (__DEV__) {
        console.log("🗑️ Message deleted:", messageId);
      }
      set((state) => ({
        messages: state.messages.filter(
          (msg) => msg._id?.toString() !== messageId?.toString()
        ),
        // Also remove from last messages if it's the deleted one
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages)
            .map(([userId, lastMsg]) => [
              userId,
              lastMsg._id?.toString() === messageId?.toString()
                ? null
                : lastMsg,
            ])
            .filter(([_, msg]) => msg !== null)
        ),
      }));
    };

    const handleConversationDeleted = ({ userId }) => {
      if (__DEV__) {
        console.log("🗑️ Conversation deleted:", userId);
      }
      const normalizedUserId = normalizeId(userId);
      set((state) => ({
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).filter(
            ([key]) => normalizeId(key) !== normalizedUserId
          )
        ),
      }));
    };

    const handleMessageReactionAdded = ({
      messageId,
      reaction,
      emoji,
      userId,
      reactions,
    }) => {
      if (__DEV__) {
        console.log("👍 Reaction added:", {
          messageId,
          reaction,
          emoji,
          userId,
          reactions,
        });
      }

      // If reactions array is provided (from reaction-update), use it directly
      if (reactions && Array.isArray(reactions)) {
        set((state) => ({
          messages: state.messages.map((msg) => {
            if (msg._id?.toString() === messageId?.toString()) {
              return { ...msg, reactions: reactions };
            }
            return msg;
          }),
        }));
        return;
      }

      // Legacy handling for individual reaction
      const emojiToAdd = emoji || reaction;
      set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg._id?.toString() === messageId?.toString()) {
            const reactions = msg.reactions || [];
            const existingReactionIndex = reactions.findIndex(
              (r) => r.userId?.toString() === userId?.toString()
            );

            if (existingReactionIndex >= 0) {
              // Update existing reaction
              const updatedReactions = [...reactions];
              updatedReactions[existingReactionIndex] = {
                userId,
                emoji: emojiToAdd,
                createdAt: new Date().toISOString(),
              };
              return { ...msg, reactions: updatedReactions };
            } else {
              // Add new reaction
              return {
                ...msg,
                reactions: [
                  ...reactions,
                  {
                    userId,
                    emoji: emojiToAdd,
                    createdAt: new Date().toISOString(),
                  },
                ],
              };
            }
          }
          return msg;
        }),
      }));
    };

    const handleMessageReactionRemoved = ({ messageId, userId, reactions }) => {
      if (__DEV__) {
        console.log("👎 Reaction removed:", { messageId, userId, reactions });
      }

      // If reactions array is provided (from reaction-update), use it directly
      if (reactions && Array.isArray(reactions)) {
        set((state) => ({
          messages: state.messages.map((msg) => {
            if (msg._id?.toString() === messageId?.toString()) {
              return { ...msg, reactions: reactions };
            }
            return msg;
          }),
        }));
        return;
      }

      // Legacy handling for individual reaction removal
      set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg._id?.toString() === messageId?.toString()) {
            const reactions = (msg.reactions || []).filter(
              (r) => r.userId?.toString() !== userId?.toString()
            );
            return { ...msg, reactions };
          }
          return msg;
        }),
      }));
    };

    // Register all event listeners
    socket.on("newMessage", handleNewMessage);
    socket.on("messageSeenUpdate", handleMessageSeenUpdate);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);
    socket.on("conversationDeleted", handleConversationDeleted);
    socket.on("messageReactionAdded", handleMessageReactionAdded);
    socket.on("messageReactionRemoved", handleMessageReactionRemoved);
    socket.on("reaction-update", (data) => {
      if (__DEV__) {
        console.log("⚡ Reaction update received:", data);
      }

      // Backend sends: { messageId, reactions, message, actionType, userId }
      // actionType can be 'added' or 'removed'

      // Update the message with the new reactions array
      set((state) => ({
        messages: state.messages.map((msg) => {
          if (msg._id?.toString() === data.messageId?.toString()) {
            return {
              ...msg,
              reactions: data.reactions || [],
            };
          }
          return msg;
        }),
        // Also update last messages if it's there
        lastMessages: Object.fromEntries(
          Object.entries(state.lastMessages).map(([userId, lastMsg]) => [
            userId,
            lastMsg._id?.toString() === data.messageId?.toString()
              ? { ...lastMsg, reactions: data.reactions || [] }
              : lastMsg,
          ])
        ),
        lastGroupMessages: Object.fromEntries(
          Object.entries(state.lastGroupMessages).map(([groupId, lastMsg]) => [
            groupId,
            lastMsg._id?.toString() === data.messageId?.toString()
              ? { ...lastMsg, reactions: data.reactions || [] }
              : lastMsg,
          ])
        ),
      }));
    });

    // Debug: Verify socket connection and listeners
    console.log("🔌 Socket connection status:", {
      connected: socket.connected,
      id: socket.id,
      disconnected: socket.disconnected,
    });

    // Verify socket is actually connected
    if (!socket.connected) {
      console.warn(
        "⚠️ Socket is not connected! Real-time messages will not work."
      );
      console.warn("   Attempting to reconnect...");
      socket.connect();
    }

    // Return cleanup function
    return () => {
      socket.off("newMessage", handleNewMessage);
      socket.off("messageSeenUpdate", handleMessageSeenUpdate);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("conversationDeleted", handleConversationDeleted);
      socket.off("messageReactionAdded", handleMessageReactionAdded);
      socket.off("messageReactionRemoved", handleMessageReactionRemoved);
      socket.off("reaction-update");
      if (__DEV__) {
        console.log("🧹 Cleaned up socket listeners for messages");
      }
    };
  },

  // Update message seen status
  updateMessageSeen: (messageId, seenAt) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id?.toString() === messageId?.toString()
          ? { ...msg, seen: true, seenAt: seenAt || new Date().toISOString() }
          : msg
      ),
    }));
  },

  // Update group message seenBy
  updateGroupMessageSeenBy: (messageId, seenBy) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg._id?.toString() === messageId?.toString()
          ? { ...msg, seenBy: seenBy || [] }
          : msg
      ),
    }));
  },

  // Unsubscribe from socket events
  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    // Remove all message-related listeners
    socket.off("newMessage");
    socket.off("messageSeenUpdate");
    socket.off("messageEdited");
    socket.off("messageDeleted");
    socket.off("conversationDeleted");
    socket.off("messageReactionAdded");
    socket.off("messageReactionRemoved");
    socket.off("reaction-update");

    if (__DEV__) {
      console.log("🧹 Unsubscribed from all message socket events");
    }
  },

  // Update group info
  updateGroupInfo: async (groupId, groupData) => {
    if (!groupId || !groupData) {
      throw new Error("Group ID and data are required");
    }

    try {
      const res = await axiosInstance.put(`/groups/${groupId}/info`, groupData);
      const groupIdStr = normalizeId(groupId);

      set((state) => ({
        groups: state.groups.map((g) =>
          normalizeId(g._id) === groupIdStr ? res.data : g
        ),
        selectedGroup:
          state.selectedGroup &&
          normalizeId(state.selectedGroup._id) === groupIdStr
            ? res.data
            : state.selectedGroup,
      }));

      return res.data;
    } catch (error) {
      console.error("Error updating group info:", error);
      throw error;
    }
  },

  // Leave group
  leaveGroup: async (groupId) => {
    if (!groupId) {
      throw new Error("Group ID is required");
    }

    try {
      await axiosInstance.post(`/groups/${groupId}/leave`);
      const groupIdStr = normalizeId(groupId);

      set((state) => {
        const updatedGroups = state.groups.filter(
          (group) => normalizeId(group._id) !== groupIdStr
        );

        const { [groupIdStr]: removed, ...updatedLastGroupMessages } =
          state.lastGroupMessages;

        return {
          groups: updatedGroups,
          lastGroupMessages: updatedLastGroupMessages,
          selectedGroup:
            state.selectedGroup &&
            normalizeId(state.selectedGroup._id) === groupIdStr
              ? null
              : state.selectedGroup,
        };
      });
    } catch (error) {
      console.error("Error leaving group:", error);
      throw error;
    }
  },
}));
