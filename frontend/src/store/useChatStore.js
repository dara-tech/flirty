import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axois";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  typingUsers: [],
  setTypingUsers: (users) => set({ typingUsers: users }),

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });

      const authUser = useAuthStore.getState().authUser;
      const unseenMessages = res.data.filter(msg => !msg.seen && msg.senderId !== authUser._id);
      if (unseenMessages.length > 0) {
        const socket = useAuthStore.getState().socket;
        unseenMessages.forEach((msg) => {
          socket.emit("messageSeen", { messageId: msg._id, senderId: msg.senderId });
        });
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },

  sendMessage: async (messageData) => {
    const { selectedUser, messages } = get();
    try {
      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, messageData);
      set({ messages: [...messages, res.data] });
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;
    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;
      set({ messages: [...get().messages, newMessage] });
    });

    socket.on("messageSeenUpdate", ({ messageId }) => {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === messageId ? { ...msg, seen: true } : msg
        ),
      }));
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageSeenUpdate");
  },

  subscribeToTyping: () => {
    const socket = useAuthStore.getState().socket;
    set({ typingUsers: new Set() });

    socket.on("typing", ({ senderId }) => {
      set((state) => ({
        typingUsers: [...new Set([...state.typingUsers, senderId])]
      }));
    });

    socket.on("stopTyping", ({ senderId }) => {
      set((state) => {
        const updatedTypingUsers = new Set(state.typingUsers);
        updatedTypingUsers.delete(senderId);
        return { typingUsers: [...updatedTypingUsers] };
      });
    });
  },

  unsubscribeFromTyping: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("typing");
    socket.off("stopTyping");
  },

  sendTypingStatus: (receiverId, isTyping) => {
    const socket = useAuthStore.getState().socket;
    if (isTyping) {
      socket.emit("typing", { receiverId });
    } else {
      socket.emit("stopTyping", { receiverId });
    }
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));
