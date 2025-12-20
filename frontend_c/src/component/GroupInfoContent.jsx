import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaUsers, FaInfoCircle, FaCog, FaImage, FaEdit, FaTrash, FaSignOutAlt, FaSpinner, FaAngleLeft, FaCheck, FaSearch, FaEllipsisV, FaUserPlus, FaBell, FaBellSlash, FaLink, FaFile, FaMicrophone, FaImage as FaImageIcon } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import AddMemberModal from "./AddMemberModal";

// Shared content component - can be used as page or embedded
const GroupInfoContent = ({ groupId, onClose, embedded = false }) => {
  const navigate = useNavigate();
  const { groups, updateGroupInfo, leaveGroup, getGroups, removeMemberFromGroup } = useChatStore();
  const { authUser, onlineUsers } = useAuthStore();
  const [activeTab, setActiveTab] = useState("members");
  const [editingField, setEditingField] = useState(null);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  const group = groups.find((g) => g._id === groupId);
  const isAdmin = group?.admin?._id === authUser?._id || group?.admin === authUser?._id;

  useEffect(() => {
    if (groupId) {
      getGroups();
    }
  }, [groupId, getGroups]);

  useEffect(() => {
    if (group) {
      setEditedName(group.name || "");
      setEditedDescription(group.description || "");
      setGroupPicPreview(null);
      setGroupPic(null);
      setEditingField(null);
    }
  }, [group]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setGroupPic(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setGroupPicPreview(reader.result);
    };
    reader.readAsDataURL(file);
    
    handleUpdateImage(file);
  };

  const handleUpdateImage = async (file) => {
    setIsUpdating(true);
    try {
      const groupPicBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });

      await updateGroupInfo(groupId, {
        groupPic: groupPicBase64,
      });

      toast.success("Photo updated");
      setGroupPic(null);
      setGroupPicPreview(null);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update photo");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      toast.error("Group name is required");
      return;
    }

    setIsUpdating(true);
    try {
      await updateGroupInfo(groupId, {
        name: editedName.trim(),
      });
      toast.success("Name updated");
      setEditingField(null);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update name");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveDescription = async () => {
    setIsUpdating(true);
    try {
      await updateGroupInfo(groupId, {
        description: editedDescription.trim(),
      });
      toast.success("Description updated");
      setEditingField(null);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update description");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;

    setIsLeaving(true);
    try {
      await leaveGroup(groupId);
      toast.success("Left group successfully");
      if (embedded && onClose) {
        onClose();
      } else {
        navigate("/");
      }
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to leave group");
    } finally {
      setIsLeaving(false);
    }
  };

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

  if (!group) {
    return (
      <div className={`${embedded ? 'h-full' : 'min-h-screen'} flex items-center justify-center bg-base-100`}>
        <div className="text-center">
          <FaSpinner className="animate-spin size-8 mx-auto mb-2 text-base-content/50" />
          <p className="text-sm text-base-content/50">Loading...</p>
        </div>
      </div>
    );
  }

  // Get all members - admin is separate from members array
  const adminId = normalizeId(group.admin?._id || group.admin);
  const allMembers = [];
  
  // Add admin if exists
  if (group.admin) {
    allMembers.push(group.admin);
  }
  
  // Add members, excluding admin if it's mistakenly in members array
  if (group.members && Array.isArray(group.members)) {
    group.members.forEach((member) => {
      const memberId = normalizeId(member._id || member);
      // Only add if not the admin (admin should not be in members array)
      if (memberId !== adminId) {
        allMembers.push(member);
      }
    });
  }

  const displayPic = groupPicPreview || group.groupPic || "/avatar.png";
  const authUserId = normalizeId(authUser?._id);

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

          {/* Center: Group name and member count */}
          <div className="flex-1 text-center min-w-0 px-4">
            <h3 className="font-semibold text-base truncate">{group.name}</h3>
            <p className="text-xs text-base-content/60">{allMembers.length} members</p>
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
            alt={group.name}
            className="size-32 rounded-full object-cover ring-4 ring-base-200"
          />
          {isAdmin && (
            <label className="absolute bottom-0 right-0 btn btn-sm btn-circle btn-primary cursor-pointer shadow-lg">
              <FaImage />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
                disabled={isUpdating}
              />
            </label>
          )}
        </div>

        {/* Group Name and Member Count */}
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold text-base-content">{group.name}</h2>
          <p className="text-sm text-base-content/60">{allMembers.length} members</p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full max-w-xs px-4">
          {isAdmin && (
            <button 
              onClick={() => setIsAddMemberModalOpen(true)}
              className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-base-200/50 transition-colors"
            >
              <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FaUserPlus className="size-6 text-primary" />
              </div>
              <span className="text-xs font-medium text-base-content">Add</span>
            </button>
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
          {editingField === 'description' ? (
            <div className="space-y-2">
              <textarea
                className="w-full px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 text-sm resize-none"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingField(null);
                    setEditedDescription(group.description || "");
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setEditingField(null);
                    setEditedDescription(group.description || "");
                  }}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleSaveDescription}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <FaSpinner className="animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`${isAdmin ? 'cursor-pointer hover:bg-base-200/50 rounded-lg p-2 -m-2 transition-colors' : ''}`}
              onClick={() => isAdmin && setEditingField('description')}
            >
              <p className="text-sm text-base-content/70 whitespace-pre-wrap">
                {group.description || (isAdmin ? "Tap to add a description..." : "No description")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 border-t border-base-200/50">
        <div className="flex w-full">
          <button
            className={`flex-1 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === "members"
                ? "border-primary text-primary"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setActiveTab("members")}
          >
            Members
          </button>
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
          {activeTab === "members" && (
            <div className="p-4 space-y-2">
              {/* Admin */}
              {group.admin && (
                <div className="flex items-center gap-3 p-3 rounded-lg">
                  <div className="relative">
                    <ProfileImage
                      src={group.admin.profilePic}
                      alt={group.admin.fullname}
                      className="size-12 rounded-full object-cover"
                    />
                    {onlineUsers.includes(normalizeId(group.admin._id || group.admin)) && (
                      <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-base-content">
                      {group.admin.fullname}
                    </p>
                    <p className="text-xs text-base-content/60">
                      {onlineUsers.includes(normalizeId(group.admin._id || group.admin)) ? "online" : "offline"}
                    </p>
                  </div>
                  <span className="badge badge-primary badge-sm">Admin</span>
                </div>
              )}

              {/* Members */}
              {group.members?.map((member) => {
                const memberId = normalizeId(member._id || member);
                const memberObj = typeof member === 'object' ? member : null;
                const isOnline = onlineUsers.includes(memberId);
                const isCurrentUser = memberId === authUserId;

                return (
                  <div
                    key={memberId}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200/50 transition-colors"
                  >
                    <div className="relative">
                      <ProfileImage
                        src={memberObj?.profilePic}
                        alt={memberObj?.fullname || "Member"}
                        className="size-12 rounded-full object-cover"
                      />
                      {isOnline && (
                        <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-base-content truncate">
                        {memberObj?.fullname || "Unknown"}
                      </p>
                      <p className="text-xs text-base-content/60">
                        {isOnline ? "online" : "offline"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "media" && (
            <div className="p-4 text-center py-12">
              <p className="text-sm text-base-content/50">Media content coming soon</p>
            </div>
          )}

          {activeTab === "files" && (
            <div className="p-4 text-center py-12">
              <p className="text-sm text-base-content/50">Files content coming soon</p>
            </div>
          )}

          {activeTab === "links" && (
            <div className="p-4 text-center py-12">
              <p className="text-sm text-base-content/50">Links content coming soon</p>
            </div>
          )}

          {activeTab === "voice" && (
            <div className="p-4 text-center py-12">
              <p className="text-sm text-base-content/50">Voice messages coming soon</p>
            </div>
          )}
      </div>

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        groupId={groupId}
      />
    </div>
  );
};

export default GroupInfoContent;
