import { useAuthStore } from "../useAuthStore";

// Typing and status indicator actions
export const createTypingActions = (set) => ({
  sendTypingStatus: (receiverId, isTyping) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isTyping) {
      socket.emit("typing", { receiverId });
    } else {
      socket.emit("stopTyping", { receiverId });
    }
  },

  sendEditingStatus: (receiverId, isEditing) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isEditing) {
      socket.emit("editing", { receiverId });
    } else {
      socket.emit("stopEditing", { receiverId });
    }
  },

  sendDeletingStatus: (receiverId, isDeleting) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isDeleting) {
      socket.emit("deleting", { receiverId });
    } else {
      socket.emit("stopDeleting", { receiverId });
    }
  },

  sendUploadingPhotoStatus: (receiverId, isUploading) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    // Track current user's upload state
    set({ isCurrentUserUploading: isUploading });
    
    if (isUploading) {
      socket.emit("uploadingPhoto", { receiverId });
    } else {
      socket.emit("stopUploadingPhoto", { receiverId });
    }
  },

  // Group status indicators
  sendGroupTypingStatus: (groupId, isTyping) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isTyping) {
      socket.emit("groupTyping", { groupId });
    } else {
      socket.emit("groupStopTyping", { groupId });
    }
  },

  sendGroupEditingStatus: (groupId, isEditing) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isEditing) {
      socket.emit("groupEditing", { groupId });
    } else {
      socket.emit("groupStopEditing", { groupId });
    }
  },

  sendGroupDeletingStatus: (groupId, isDeleting) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    if (isDeleting) {
      socket.emit("groupDeleting", { groupId });
    } else {
      socket.emit("groupStopDeleting", { groupId });
    }
  },

  sendGroupUploadingPhotoStatus: (groupId, isUploading) => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    
    // Track current user's upload state
    set({ isCurrentUserUploading: isUploading });
    
    if (isUploading) {
      socket.emit("groupUploadingPhoto", { groupId });
    } else {
      socket.emit("groupStopUploadingPhoto", { groupId });
    }
  },
});

