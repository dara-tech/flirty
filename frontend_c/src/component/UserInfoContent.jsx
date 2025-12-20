import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { FaTimes, FaAngleLeft, FaSearch, FaEllipsisV, FaBell, FaBellSlash, FaImage, FaSpinner, FaPhone, FaVideo, FaEnvelope, FaFile, FaLink, FaMicrophone, FaDownload } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { axiosInstance } from "../lib/axois";

// Shared content component - can be used as page or embedded
const UserInfoContent = ({ userId, onClose, embedded = false }) => {
  const navigate = useNavigate();
  const { users, getUsers } = useChatStore();
  const { authUser, onlineUsers } = useAuthStore();
  const { initiateCall } = useCallStore();
  const [activeTab, setActiveTab] = useState("info");
  const [isMuted, setIsMuted] = useState(false);
  const [userPic, setUserPic] = useState(null);
  const [userPicPreview, setUserPicPreview] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [filteredMessages, setFilteredMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const user = users.find((u) => u._id === userId);
  const isCurrentUser = user?._id === authUser?._id;

  useEffect(() => {
    if (userId) {
      getUsers();
    }
  }, [userId, getUsers]);

  useEffect(() => {
    if (user) {
      setUserPicPreview(null);
      setUserPic(null);
    }
  }, [user]);

  // Fetch messages by type when tab changes
  useEffect(() => {
    if (!userId || activeTab === "info") {
      setFilteredMessages([]);
      return;
    }

    const fetchMessagesByType = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await axiosInstance.get(`/messages/by-type/${userId}?type=${activeTab}`);
        setFilteredMessages(res.data || []);
      } catch (error) {
        console.error(`Error fetching ${activeTab} messages:`, error);
        toast.error(`Failed to load ${activeTab}`);
        setFilteredMessages([]);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessagesByType();
  }, [userId, activeTab]);

  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id.toString();
  };

  const handleBack = () => {
    if (embedded && onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  if (!user) {
    return (
      <div className={`${embedded ? 'h-full' : 'min-h-screen'} flex items-center justify-center bg-base-100`}>
        <div className="text-center">
          <FaSpinner className="animate-spin size-8 mx-auto mb-2 text-base-content/50" />
          <p className="text-sm text-base-content/50">Loading...</p>
        </div>
      </div>
    );
  }

  const displayPic = userPicPreview || user.profilePic || "/avatar.png";
  const authUserId = normalizeId(authUser?._id);
  const userIdNormalized = normalizeId(user._id);
  const isOnline = onlineUsers.includes(userIdNormalized);

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-base-100 flex flex-col overflow-hidden ${embedded ? '' : 'lg:pt-16'}`}>
      {/* Header */}
      <div className={`${embedded ? 'sticky top-0' : 'sticky top-0 lg:top-16'} bg-base-100/95 backdrop-blur-sm border-b border-base-200/50 z-10 flex-shrink-0`}>
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: Back button with text */}
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-primary hover:opacity-80 transition-opacity"
          >
            <FaAngleLeft className="size-5" />
            <span className="font-medium">Back</span>
          </button>

          {/* Center: User name and status */}
          <div className="flex-1 text-center min-w-0 px-4">
            <h3 className="font-semibold text-base truncate">{user.fullname}</h3>
            <p className="text-xs text-base-content/60">{isOnline ? "online" : "offline"}</p>
          </div>

          {/* Right: Search and More icons */}
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-sm btn-circle text-primary">
              <FaSearch className="size-5" />
            </button>
            <button className="btn btn-ghost btn-sm btn-circle text-primary">
              <FaEllipsisV className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Profile Section */}
      <div className="flex-shrink-0 flex flex-col items-center py-6 px-4 space-y-4">
        {/* Large Profile Picture */}
        <div className="relative">
          <ProfileImage
            src={displayPic}
            alt={user.fullname}
            className="size-32 rounded-full object-cover ring-4 ring-base-200"
          />
          {isOnline && (
            <span className="absolute bottom-2 right-2 size-4 bg-green-500 rounded-full ring-4 ring-base-100" />
          )}
        </div>

        {/* User Name and Status */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-base-content">{user.fullname}</h2>
          <p className="text-sm text-base-content/60">{isOnline ? "online" : "offline"}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full max-w-xs px-4">
          {!isCurrentUser ? (
            <>
              <button
                onClick={async () => {
                  try {
                    await initiateCall(userIdNormalized, 'voice');
                  } catch (error) {
                    toast.error(error.message || "Failed to start call");
                  }
                }}
                disabled={!isOnline}
                className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-base-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FaPhone className="size-6 text-primary" />
                </div>
                <span className="text-xs font-medium text-base-content">Call</span>
              </button>
              <button
                onClick={async () => {
                  try {
                    await initiateCall(userIdNormalized, 'video');
                  } catch (error) {
                    toast.error(error.message || "Failed to start video call");
                  }
                }}
                disabled={!isOnline}
                className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-base-200/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FaVideo className="size-6 text-primary" />
                </div>
                <span className="text-xs font-medium text-base-content">Video</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg opacity-50 cursor-not-allowed">
                <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FaPhone className="size-6 text-primary" />
                </div>
                <span className="text-xs font-medium text-base-content">Call</span>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg opacity-50 cursor-not-allowed">
                <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FaVideo className="size-6 text-primary" />
                </div>
                <span className="text-xs font-medium text-base-content">Video</span>
              </div>
            </>
          )}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-base-200/50 transition-colors"
          >
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
              {isMuted ? (
                <FaBellSlash className="size-6 text-primary" />
              ) : (
                <FaBell className="size-6 text-primary" />
              )}
            </div>
            <span className="text-xs font-medium text-base-content">Mute</span>
          </button>
          <button className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-base-200/50 transition-colors">
            <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FaEllipsisV className="size-6 text-primary" />
            </div>
            <span className="text-xs font-medium text-base-content">More</span>
          </button>
        </div>

        {/* Info Section */}
        <div className="w-full max-w-md px-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">info</span>
          </div>
          <div className="space-y-3">
            {user.email && (
              <div className="flex items-center gap-3 p-2">
                <FaEnvelope className="size-4 text-base-content/60" />
                <span className="text-sm text-base-content/70">{user.email}</span>
              </div>
            )}
            <div className="flex items-center gap-3 p-2">
              <span className="text-sm text-base-content/60">Last seen:</span>
              <span className="text-sm text-base-content/70">
                {isOnline ? "online" : "recently"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-t border-base-200/50">
        <div className="flex w-full">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "media"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setActiveTab("media")}
          >
            Media
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "files"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setActiveTab("files")}
          >
            Files
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "links"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setActiveTab("links")}
          >
            Links
          </button>
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "voice"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setActiveTab("voice")}
          >
            Voice
          </button>
        </div>
      </div>

      {/* Tab Content - Scrollable */}
      <div className="flex-1 overflow-y-auto hide-scrollbar min-h-0">
        {isLoadingMessages ? (
          <div className="p-4 text-center py-12">
            <FaSpinner className="animate-spin size-8 mx-auto mb-2 text-base-content/50" />
            <p className="text-sm text-base-content/50">Loading...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-4 text-center py-12">
            <p className="text-sm text-base-content/50">No {activeTab} found</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredMessages.map((message) => (
              <div key={message._id} className="relative group">
                {activeTab === "media" && message.image && (
                  <div className="aspect-square rounded-lg overflow-hidden bg-base-200">
                    <img
                      src={message.image}
                      alt="Media"
                      className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(message.image, '_blank')}
                    />
                    <div className="absolute bottom-2 left-2 right-2 text-xs text-white bg-black/50 rounded px-2 py-1 truncate">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                )}
                {activeTab === "files" && message.file && (
                  <a
                    href={message.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-base-200 rounded-lg hover:bg-base-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <FaFile className="size-6 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{message.fileName || "File"}</p>
                        {message.fileSize && (
                          <p className="text-xs text-base-content/60">
                            {(message.fileSize / 1024).toFixed(2)} KB
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-base-content/50">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </div>
                  </a>
                )}
                {activeTab === "links" && message.link && (
                  <a
                    href={message.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-base-200 rounded-lg hover:bg-base-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <FaLink className="size-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{message.link}</p>
                        {message.text && (
                          <p className="text-xs text-base-content/60 truncate mt-1">{message.text}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-base-content/50">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </div>
                  </a>
                )}
                {activeTab === "voice" && message.audio && (
                  <div className="p-4 bg-base-200 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <FaMicrophone className="size-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <audio
                          src={message.audio}
                          controls
                          className="w-full h-8"
                          controlsList="nodownload"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-base-content/50 mt-2">
                      {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserInfoContent;

