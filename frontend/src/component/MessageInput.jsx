import { useRef, useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEventRef = useRef(0);
  
  const { sendMessage, sendTypingStatus } = useChatStore();
  const { selectedUser } = useChatStore();
  const { authUser } = useAuthStore();
  const socket = useAuthStore.getState().socket;

  // Cleanup function
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        // Ensure we stop typing when component unmounts
        if (selectedUser?._id) {
          sendTypingStatus(selectedUser._id, false);
        }
      }
    };
  }, [selectedUser?._id]);

  // Reset typing state when changing users
  useEffect(() => {
    setText("");
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  }, [selectedUser?._id]);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview) return;
    if (!selectedUser?._id) {
      toast.error("No chat selected");
      return;
    }

    try {
      await sendMessage({
        text: text.trim(),
        image: imagePreview,
      });

      setText("");
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // Clear typing state
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      sendTypingStatus(selectedUser._id, false);
      
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    }
  };

  const handleTyping = useCallback((e) => {
    const newText = e.target.value;
    setText(newText);

    if (!selectedUser?._id) return;

    const now = Date.now();
    const THROTTLE_MS = 1000; // Throttle typing events to once per second

    // Check if we should send a typing event
    const shouldSendTyping = now - lastTypingEventRef.current >= THROTTLE_MS;

    if (shouldSendTyping) {
      lastTypingEventRef.current = now;
      sendTypingStatus(selectedUser._id, true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(selectedUser._id, false);
    }, 2000);
  }, [selectedUser?._id, sendTypingStatus]);

  // Detect when user leaves the input
  const handleBlur = useCallback(() => {
    if (selectedUser?._id && !text.trim()) {
      sendTypingStatus(selectedUser._id, false);
    }
  }, [selectedUser?._id, text, sendTypingStatus]);

  return (
    <div className="p-4 w-full">
      {imagePreview && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-20 h-20 object-cover rounded-lg border border-zinc-700"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-base-300 flex items-center justify-center"
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 items-center">
          <input
            type="text"
            className="w-full input input-bordered focus:border-none focus:outline-none outline-0 focus:ring-1 rounded-lg input-sm sm:input-md"
            placeholder={selectedUser ? "Type a message..." : "Select a chat to start messaging"}
            value={text}
            onChange={handleTyping}
            onBlur={handleBlur}
            disabled={!selectedUser}
          />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImageChange}
          />

          <button
            type="button"
            className="btn btn-sm btn-circle text-zinc-400 hover:text-emerald-500 p-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedUser}
          >
            <Image size={20} />
          </button>
        </div>
        <button
          type="submit"
          className="btn btn-sm btn-circle p-2"
          disabled={(!text.trim() && !imagePreview) || !selectedUser}
        >
          <Send size={20}  />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;