import { create } from "zustand";
import { axiosInstance } from "../lib/axois";
import toast from "react-hot-toast";
import { DEFAULT_FOLDER_ICON } from "../lib/folderIcons";

export const useFolderStore = create((set, get) => ({
  folders: [],
  isLoading: false,
  error: null,

  // Get all folders
  getFolders: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await axiosInstance.get("/folders");
      set({ folders: res.data.folders || [], isLoading: false });
      return res.data.folders || [];
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to load folders";
      set({ error: errorMessage, isLoading: false });
      console.error("Error loading folders:", error);
      return [];
    }
  },

  // Create a new folder
  createFolder: async (name, icon = DEFAULT_FOLDER_ICON, color = "#3b82f6") => {
    try {
      const res = await axiosInstance.post("/folders", { name, icon, color });
      const newFolder = res.data.folder;
      set((state) => ({
        folders: [...state.folders, newFolder].sort((a, b) => a.order - b.order),
      }));
      toast.success("Folder created successfully");
      return newFolder;
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to create folder";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Update a folder
  updateFolder: async (folderId, updates, showToast = true) => {
    try {
      const res = await axiosInstance.put(`/folders/${folderId}`, updates);
      const updatedFolder = res.data.folder;
      set((state) => ({
        folders: state.folders.map((f) =>
          f._id === folderId ? updatedFolder : f
        ),
      }));
      if (showToast) {
        toast.success("Folder updated successfully");
      }
      return updatedFolder;
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to update folder";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Delete a folder
  deleteFolder: async (folderId) => {
    try {
      await axiosInstance.delete(`/folders/${folderId}`);
      set((state) => ({
        folders: state.folders.filter((f) => f._id !== folderId),
      }));
      toast.success("Folder deleted successfully");
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to delete folder";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Add conversation to folder
  addConversationToFolder: async (folderId, type, conversationId) => {
    try {
      const res = await axiosInstance.post(`/folders/${folderId}/conversations`, {
        type,
        conversationId,
      });
      const updatedFolder = res.data.folder;
      set((state) => ({
        folders: state.folders.map((f) =>
          f._id === folderId ? updatedFolder : f
        ),
      }));
      return updatedFolder;
    } catch (error) {
      const errorMessage =
        error.response?.data?.error || "Failed to add conversation to folder";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Remove conversation from folder
  removeConversationFromFolder: async (folderId, type, conversationId) => {
    try {
      const res = await axiosInstance.delete(`/folders/${folderId}/conversations`, {
        data: { type, conversationId },
      });
      const updatedFolder = res.data.folder;
      set((state) => ({
        folders: state.folders.map((f) =>
          f._id === folderId ? updatedFolder : f
        ),
      }));
      return updatedFolder;
    } catch (error) {
      const errorMessage =
        error.response?.data?.error || "Failed to remove conversation from folder";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Reorder folders
  reorderFolders: async (folderOrders) => {
    try {
      const res = await axiosInstance.put("/folders/reorder", { folderOrders });
      set({ folders: res.data.folders || [] });
    } catch (error) {
      const errorMessage = error.response?.data?.error || "Failed to reorder folders";
      toast.error(errorMessage);
      throw error;
    }
  },

  // Toggle folder expansion
  toggleFolderExpansion: async (folderId) => {
    const folder = get().folders.find((f) => f._id === folderId);
    if (folder) {
      await get().updateFolder(folderId, { isExpanded: !folder.isExpanded }, false);
    }
  },

  // Get folder for a conversation
  getFolderForConversation: (type, conversationId) => {
    const folders = get().folders;
    if (!conversationId || !folders || folders.length === 0) return null;
    
    // Helper to normalize any ID format to string
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === 'string') return id.trim();
      if (typeof id === 'object' && id._id) return String(id._id);
      if (typeof id === 'object' && id.toString) return String(id.toString());
      return String(id);
    };
    
    // Normalize the conversation ID to string
    const normalizedConversationId = normalizeId(conversationId);
    if (!normalizedConversationId) return null;
    
    for (const folder of folders) {
      if (!folder.conversations || !Array.isArray(folder.conversations)) continue;
      
      const found = folder.conversations.find((conv) => {
        if (conv.type !== type) return false;
        
        // Normalize the conversation ID from folder
        const normalizedConvId = normalizeId(conv.id);
        if (!normalizedConvId) return false;
        
        // Compare normalized IDs
        return normalizedConvId === normalizedConversationId;
      });
      
      if (found) return folder;
    }
    return null;
  },
}));

