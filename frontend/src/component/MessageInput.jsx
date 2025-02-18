import { useRef, useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image, Send, X, Loader } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEventRef = useRef(0);

  const { sendMessage, sendTypingStatus } = useChatStore();
  const { selectedUser } = useChatStore();
  const { authUser } = useAuthStore();
  const socket = useAuthStore.getState().socket;

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        if (selectedUser?._id) {
          sendTypingStatus(selectedUser._id, false);
        }
      }
    };
  }, [selectedUser?._id]);

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

    setIsUploading(true);
    const reader = new FileReader();

    reader.onloadend = () => {
      console.log("FileReader: Image loaded");
      setImagePreview(reader.result);
      setIsUploading(false);
    };

    reader.onerror = () => {
      console.error("FileReader: Error loading image");
      toast.error("Failed to read image file");
      setIsUploading(false);
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
    const THROTTLE_MS = 1000;

    const shouldSendTyping = now - lastTypingEventRef.current >= THROTTLE_MS;

    if (shouldSendTyping) {
      lastTypingEventRef.current = now;
      sendTypingStatus(selectedUser._id, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(selectedUser._id, false);
    }, 2000);
  }, [selectedUser?._id, sendTypingStatus]);

  const handleBlur = useCallback(() => {
    if (selectedUser?._id && !text.trim()) {
      sendTypingStatus(selectedUser._id, false);
    }
  }, [selectedUser?._id, text, sendTypingStatus]);

  return (
    <div className="p-4 w-full bg-base-200/50 backdrop-blur-sm border-t border-base-300">
      {imagePreview && (
        <div className="mb-3">
          <div className="relative inline-block group">
            <div className="relative overflow-hidden rounded-lg border-2 border-primary/20 transition-all duration-200 hover:border-primary/40">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-24 h-24 object-cover rounded-lg cursor-pointer"
                onClick={() => window.open(imagePreview, '_blank')}
              />
              <div className="absolute inset-0 bg-base-300/10 group-hover:bg-base-300/20 transition-all duration-200" />
            </div>
            <button
              onClick={removeImage}
              className="absolute -top-2 -right-2 btn btn-circle btn-xs btn-error btn-ghost animate-in fade-in zoom-in"
              type="button"
              aria-label="Remove image"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 items-center bg-base-100 rounded-full px-4 py-2 shadow-lg">
          <input
            type="text"
            className="flex-1 bg-transparent border-none focus:outline-none text-base-content placeholder:text-base-content/50"
            placeholder={selectedUser ? "Type a message..." : "Select a chat to start messaging"}
            value={text}
            onChange={handleTyping}
            onBlur={handleBlur}
            disabled={!selectedUser}
            aria-label="Message input"
          />

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageChange}
              aria-label="Upload image"
            />

            <button
              type="button"
              className={`btn btn-circle btn-ghost btn-sm ${!selectedUser ? 'opacity-50 cursor-not-allowed' : 'hover:text-primary'}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedUser || isUploading}
              aria-label="Upload image"
            >
              {isUploading ? (
                <Loader className="size-5 animate-spin" />
              ) : (
                <Image className="size-5" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className={`btn btn-circle btn-primary ${(!text.trim() && !imagePreview) || !selectedUser ? 'btn-disabled' : ''}`}
          disabled={(!text.trim() && !imagePreview) || !selectedUser}
          aria-label="Send message"
        >
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;