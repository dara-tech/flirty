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
typingUsers: [], // Initialize as an empty array
setTypingUsers: (users) => set({ typingUsers: users }),// Added typingUsers state
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

// Mark messages as seen if they are from the selected user
const unseenMessages = res.data.filter((msg) => !msg.seen);
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

// Listen for new messages
socket.on("newMessage", (newMessage) => {
const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
if (!isMessageSentFromSelectedUser) return;
set({ messages: [...get().messages, newMessage] });
});

// Listen for message seen updates
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
socket.off("messageSeenUpdate"); // Unsubscribe from seen updates
 },
subscribeToTyping: () => {
const socket = useAuthStore.getState().socket;
set({ typingUsers: new Set() });
const handleTyping = (e) => {
setText(e.target.value);
if (!isTyping) {
setIsTyping(true);
onTyping(true); // Custom typing function
// Ensure selectedUser is not null and has _id
if (selectedUser?._id) {
console.log("Emitting typing event", {
senderId: authUser._id,
receiverId: selectedUser._id,
 });
socket.emit("typing", {
senderId: authUser._id, // Sender ID
receiverId: selectedUser._id, // Receiver ID
 });
 } else {
console.error("selectedUser is not defined", selectedUser);
 }
 }
// Stop typing timeout handling
if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
 typingTimeoutRef.current = setTimeout(() => {
setIsTyping(false);
onTyping(false);
console.log("Emitting stopTyping event to server...");
socket.emit("stopTyping", {
senderId: authUser._id,
receiverId: selectedUser._id,
 });
 }, 2000);
 };
socket.on("stopTyping", ({ senderId, receiverId }) => {
set((state) => {
const updatedTypingUsers = new Set(state.typingUsers); // Create a new Set
updatedTypingUsers.delete(senderId);
return { typingUsers: [...updatedTypingUsers] }; // Force state update
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
