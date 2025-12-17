import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaSearch, FaCheck, FaUser, FaUsers } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const ForwardMultipleMessagesModal = ({ messages, onClose }) => {
  const { users, groups, getUsers, getGroups, sendMessageToUser, sendGroupMessage } = useChatStore();
  const { authUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [activeTab, setActiveTab] = useState("users");

  useEffect(() => {
    if (!users || users.length === 0) {
      getUsers();
    }
    if (!groups || groups.length === 0) {
      getGroups();
    }
  }, [users, groups, getUsers, getGroups]);

  const filteredUsers = users?.filter((user) => {
    if (!user || !user._id) return false;
    if (user._id === authUser?._id) return false;
    const searchLower = searchQuery.toLowerCase();
    return (
      user.fullname?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const filteredGroups = groups?.filter((group) => {
    if (!group || !group._id) return false;
    const searchLower = searchQuery.toLowerCase();
    return group.name?.toLowerCase().includes(searchLower);
  }) || [];

  const toggleRecipient = (id, type) => {
    setSelectedRecipients((prev) => {
      const exists = prev.find((r) => r.id === id && r.type === type);
      if (exists) {
        return prev.filter((r) => !(r.id === id && r.type === type));
      } else {
        return [...prev, { id, type }];
      }
    });
  };

  const prepareMessagePayload = (message) => {
    const payload = {};
    
    if (message.text && message.text.trim()) {
      payload.text = message.text;
    }
    
    if (message.image && (message.image.startsWith('http://') || message.image.startsWith('https://'))) {
      payload.image = message.image;
    }
    
    if (message.video && (message.video.startsWith('http://') || message.video.startsWith('https://'))) {
      payload.video = message.video;
    }
    
    if (message.audio && (message.audio.startsWith('http://') || message.audio.startsWith('https://'))) {
      payload.audio = message.audio;
    }
    
    if (message.file && (message.file.startsWith('http://') || message.file.startsWith('https://'))) {
      payload.file = message.file;
      if (message.fileName) payload.fileName = message.fileName;
      if (message.fileSize) payload.fileSize = message.fileSize;
      if (message.fileType) payload.fileType = message.fileType;
    }

    // Include forwardedFrom info
    if (message._id) {
      payload.forwardedFrom = {
        messageId: message._id,
      };
    }
    
    return payload;
  };

  const handleForward = async () => {
    if (selectedRecipients.length === 0) {
      toast.error("Please select at least one recipient");
      return;
    }

    if (!messages || messages.length === 0) {
      toast.error("No messages to forward");
      return;
    }

    setIsForwarding(true);

    try {
      // Forward each message to each selected recipient
      const forwardPromises = [];
      
      for (const message of messages) {
        const messagePayload = prepareMessagePayload(message);
        
        // Validate that we have at least some content
        if (!messagePayload.text && !messagePayload.image && !messagePayload.video && !messagePayload.audio && !messagePayload.file) {
          continue; // Skip empty messages
        }

        for (const recipient of selectedRecipients) {
          try {
            if (recipient.type === "user") {
              forwardPromises.push(sendMessageToUser(recipient.id, messagePayload));
            } else if (recipient.type === "group") {
              forwardPromises.push(sendGroupMessage(recipient.id, messagePayload));
            }
          } catch (error) {
            console.error(`Error forwarding message ${message._id} to ${recipient.type} ${recipient.id}:`, error);
          }
        }
      }

      await Promise.all(forwardPromises);
      
      toast.success(`${messages.length} message(s) forwarded to ${selectedRecipients.length} recipient(s)`);
      onClose();
    } catch (error) {
      console.error("Error forwarding messages:", error);
      toast.error(error.response?.data?.error || error.message || "Failed to forward messages");
    } finally {
      setIsForwarding(false);
    }
  };

  const getRecipientName = (id, type) => {
    if (type === "user") {
      const user = users?.find((u) => u._id === id);
      return user?.fullname || "Unknown";
    } else {
      const group = groups?.find((g) => g._id === id);
      return group?.name || "Unknown";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-base-200">
          <div>
            <h2 className="text-lg font-semibold text-base-content">Forward Messages</h2>
            <p className="text-xs text-base-content/60 mt-1">{messages.length} message(s) selected</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-base-200 transition-colors"
            disabled={isForwarding}
          >
            <FaTimes className="w-4 h-4 text-base-content" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-base-200">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" />
            <input
              type="text"
              placeholder="Search contacts or groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-base-200 rounded-lg border-none outline-none text-sm"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-base-200">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "users"
                ? "text-primary border-b-2 border-primary"
                : "text-base-content/60 hover:text-base-content"
            }`}
          >
            <FaUser className="inline-block mr-2" />
            Contacts
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "groups"
                ? "text-primary border-b-2 border-primary"
                : "text-base-content/60 hover:text-base-content"
            }`}
          >
            <FaUsers className="inline-block mr-2" />
            Groups
          </button>
        </div>

        {/* Selected Recipients */}
        {selectedRecipients.length > 0 && (
          <div className="p-4 border-b border-base-200">
            <div className="flex flex-wrap gap-2">
              {selectedRecipients.map((recipient) => (
                <div
                  key={`${recipient.type}-${recipient.id}`}
                  className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm"
                >
                  <span>{getRecipientName(recipient.id, recipient.type)}</span>
                  <button
                    onClick={() => toggleRecipient(recipient.id, recipient.type)}
                    className="hover:bg-primary/20 rounded-full p-0.5"
                    disabled={isForwarding}
                  >
                    <FaTimes className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recipients List */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "users" ? (
            filteredUsers.length > 0 ? (
              <div className="space-y-2">
                {filteredUsers.map((user) => {
                  const isSelected = selectedRecipients.some(
                    (r) => r.id === user._id && r.type === "user"
                  );
                  return (
                    <button
                      key={user._id}
                      onClick={() => toggleRecipient(user._id, "user")}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-2 border-primary"
                          : "hover:bg-base-200 border-2 border-transparent"
                      }`}
                      disabled={isForwarding}
                    >
                      <ProfileImage
                        src={user.profilePic}
                        alt={user.fullname}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium text-base-content">{user.fullname}</p>
                        {user.email && (
                          <p className="text-xs text-base-content/60">{user.email}</p>
                        )}
                      </div>
                      {isSelected && (
                        <FaCheck className="w-5 h-5 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-base-content/60">
                <p>No contacts found</p>
              </div>
            )
          ) : (
            filteredGroups.length > 0 ? (
              <div className="space-y-2">
                {filteredGroups.map((group) => {
                  const isSelected = selectedRecipients.some(
                    (r) => r.id === group._id && r.type === "group"
                  );
                  return (
                    <button
                      key={group._id}
                      onClick={() => toggleRecipient(group._id, "group")}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-2 border-primary"
                          : "hover:bg-base-200 border-2 border-transparent"
                      }`}
                      disabled={isForwarding}
                    >
                      <ProfileImage
                        src={group.profilePic}
                        alt={group.name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium text-base-content">{group.name}</p>
                        <p className="text-xs text-base-content/60">
                          {group.members?.length || 0} members
                        </p>
                      </div>
                      {isSelected && (
                        <FaCheck className="w-5 h-5 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-base-content/60">
                <p>No groups found</p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-base-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-base-200 text-base-content rounded-lg font-medium hover:bg-base-300 transition-colors"
            disabled={isForwarding}
          >
            Cancel
          </button>
          <button
            onClick={handleForward}
            disabled={selectedRecipients.length === 0 || isForwarding}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-content rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isForwarding ? "Forwarding..." : `Forward (${selectedRecipients.length})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardMultipleMessagesModal;

