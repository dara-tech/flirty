import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaBookmark, FaSpinner, FaTimes } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import { formatMessageTime, normalizeId } from "../lib/utils";
import ChatContainer from "./ChatContainer";

const SavedMessages = () => {
  const { getSavedMessages, unsaveMessage } = useChatStore();
  const { authUser } = useAuthStore();
  const [savedMessages, setSavedMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadSavedMessages();
  }, []);

  const loadSavedMessages = async () => {
    try {
      setIsLoading(true);
      const data = await getSavedMessages(page, 50);
      if (page === 1) {
        setSavedMessages(data.messages || []);
      } else {
        setSavedMessages(prev => [...prev, ...(data.messages || [])]);
      }
      setHasMore(data.hasMore || false);
    } catch (error) {
      console.error("Failed to load saved messages:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsave = async (messageId) => {
    try {
      await unsaveMessage(messageId);
      setSavedMessages(prev => prev.filter(m => normalizeId(m._id) !== normalizeId(messageId)));
    } catch (error) {
      console.error("Failed to unsave message:", error);
    }
  };

  const getMessagePreview = (message) => {
    if (message.text) return message.text;
    if (message.image) return "📷 Photo";
    if (message.video) return "🎥 Video";
    if (message.audio) return "🎤 Voice message";
    if (message.file) return `📎 ${message.fileName || "File"}`;
    return "Message";
  };

  const getSenderName = (message) => {
    if (typeof message.senderId === 'object' && message.senderId.fullname) {
      return message.senderId.fullname;
    }
    const isMyMessage = normalizeId(message.senderId?._id || message.senderId) === normalizeId(authUser?._id);
    return isMyMessage ? "You" : "Unknown";
  };

  const getSenderPic = (message) => {
    if (typeof message.senderId === 'object' && message.senderId.profilePic) {
      return message.senderId.profilePic;
    }
    return "/avatar.png";
  };

  if (selectedMessage) {
    // Show chat view for the selected message
    return (
      <div className="flex-1 flex flex-col h-full">
        <div className="px-4 py-3 border-b border-base-200/50 flex items-center justify-between bg-base-100/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedMessage(null)}
              className="btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
            >
              <FaTimes className="size-5 text-base-content/60" />
            </button>
            <h3 className="font-semibold text-base text-base-content">Saved Message</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto">
            {/* Render the message */}
            <div className="bg-base-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <ProfileImage
                  src={getSenderPic(selectedMessage)}
                  alt={getSenderName(selectedMessage)}
                  className="w-8 h-8 rounded-full"
                />
                <div>
                  <p className="font-medium text-sm text-base-content">{getSenderName(selectedMessage)}</p>
                  <p className="text-xs text-base-content/60">{formatMessageTime(selectedMessage.createdAt)}</p>
                </div>
              </div>
              <div className="mt-3">
                {selectedMessage.text && (
                  <p className="text-sm text-base-content mb-2">{selectedMessage.text}</p>
                )}
                {selectedMessage.image && (
                  <img src={selectedMessage.image} alt="Saved" className="max-w-full rounded-lg mb-2" />
                )}
                {selectedMessage.video && (
                  <video src={selectedMessage.video} controls className="max-w-full rounded-lg mb-2" />
                )}
                {selectedMessage.audio && (
                  <audio src={selectedMessage.audio} controls className="w-full mb-2" />
                )}
                {selectedMessage.file && (
                  <div className="bg-base-100 p-3 rounded-lg mb-2">
                    <p className="text-sm font-medium text-base-content">{selectedMessage.fileName || "File"}</p>
                    <a href={selectedMessage.file} download className="text-xs text-primary hover:underline">
                      Download
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-base-200/50 bg-base-100/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FaBookmark className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-base-content">Saved Messages</h2>
            <p className="text-xs text-base-content/60">
              {savedMessages.length} {savedMessages.length === 1 ? 'message' : 'messages'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <FaSpinner className="size-6 text-primary animate-spin" />
          </div>
        ) : savedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <FaBookmark className="size-12 text-base-content/30 mb-4" />
            <p className="text-base-content/60">No saved messages yet</p>
            <p className="text-sm text-base-content/40 mt-2">
              Save messages by clicking the menu button on any message
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {savedMessages.map((message) => (
              <div
                key={message._id}
                onClick={() => setSelectedMessage(message)}
                className="bg-base-100 rounded-lg p-4 hover:bg-base-200 transition-colors cursor-pointer border border-base-200"
              >
                <div className="flex items-start gap-3">
                  <ProfileImage
                    src={getSenderPic(message)}
                    alt={getSenderName(message)}
                    className="w-10 h-10 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm text-base-content">{getSenderName(message)}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsave(message._id);
                        }}
                        className="p-1 hover:bg-base-300 rounded transition-colors"
                        title="Unsave"
                      >
                        <FaBookmark className="size-4 text-primary" />
                      </button>
                    </div>
                    <p className="text-xs text-base-content/60 mb-1">
                      {formatMessageTime(message.createdAt)}
                    </p>
                    <p className="text-sm text-base-content/80 line-clamp-2">
                      {getMessagePreview(message)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => {
                  setPage(prev => prev + 1);
                  loadSavedMessages();
                }}
                className="w-full py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedMessages;

