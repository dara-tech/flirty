import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaUsers, FaInfoCircle, FaCog, FaImage, FaEdit, FaTrash, FaSignOutAlt, FaSpinner, FaUserPlus } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import AddMemberModal from "./AddMemberModal";

const GroupInfoPanel = ({ groupId, onClose }) => {
  const { groups, updateGroupInfo, leaveGroup, getGroups, removeMemberFromGroup } = useChatStore();
  const { authUser, onlineUsers } = useAuthStore();
  const [activeTab, setActiveTab] = useState("info");
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  const group = groups.find((g) => g._id === groupId);
  const isAdmin = group?.admin?._id === authUser?._id || group?.admin === authUser?._id;

  useEffect(() => {
    if (groupId) {
      // Refresh groups to get latest data
      getGroups();
    }
  }, [groupId, getGroups]);

  useEffect(() => {
    if (group) {
      setEditedName(group.name || "");
      setEditedDescription(group.description || "");
      setGroupPicPreview(null);
      setGroupPic(null);
      setIsEditing(false);
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
  };

  const handleUpdateInfo = async () => {
    if (!editedName.trim()) {
      toast.error("Group name is required");
      return;
    }

    setIsUpdating(true);
    try {
      let groupPicBase64 = null;
      if (groupPic) {
        groupPicBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(groupPic);
        });
      }

      await updateGroupInfo(groupId, {
        name: editedName.trim(),
        description: editedDescription.trim(),
        groupPic: groupPicBase64,
      });

      toast.success("Group info updated successfully");
      setIsEditing(false);
      setGroupPic(null);
      setGroupPicPreview(null);
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to update group info");
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
      onClose();
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

  if (!group) {
    return (
      <div className="w-80 border-l border-base-200/50 bg-base-100 flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin size-8 mx-auto mb-2 text-base-content/50" />
          <p className="text-sm text-base-content/50">Loading group info...</p>
        </div>
      </div>
    );
  }

  const allMembers = group.admin && group.members 
    ? [group.admin, ...group.members]
    : group.members || [];

  const displayPic = groupPicPreview || group.groupPic || "/avatar.png";
  const authUserId = normalizeId(authUser?._id);

  return (
    <div className="w-80 border-l border-base-200/50 bg-base-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-base-200/50 flex items-center justify-between bg-base-100 sticky top-0 z-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <ProfileImage
            src={displayPic}
            alt={group.name}
            className="size-12 rounded-full object-cover ring-2 ring-base-200 flex-shrink-0"
          />
          <h3 className="font-semibold text-base truncate">{group.name}</h3>
        </div>
        <button
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost flex-shrink-0"
          title="Close"
        >
          <FaTimes />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-base-200/50">
        <div className="tabs tabs-boxed tabs-sm px-2 py-2">
          <button
            className={`tab tab-sm flex-1 ${activeTab === "info" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("info")}
          >
            <FaInfoCircle className="mr-1" />
            Info
          </button>
          <button
            className={`tab tab-sm flex-1 ${activeTab === "members" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("members")}
          >
            <FaUsers className="mr-1" />
            Members
          </button>
          <button
            className={`tab tab-sm flex-1 ${activeTab === "settings" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <FaCog className="mr-1" />
            Settings
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {activeTab === "info" && (
          <div className="p-4 space-y-4">
            {/* Group Photo */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <ProfileImage
                  src={displayPic}
                  alt={group.name}
                  className="size-24 rounded-full object-cover ring-4 ring-base-200"
                />
                {isAdmin && (
                  <label className="absolute bottom-0 right-0 btn btn-sm btn-circle btn-primary cursor-pointer">
                    <FaImage />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                      disabled={!isEditing}
                    />
                  </label>
                )}
              </div>
              {isAdmin && !isEditing && (
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => setIsEditing(true)}
                >
                  <FaEdit className="mr-2" />
                  Edit Group Info
                </button>
              )}
            </div>

            {/* Group Name */}
            <div>
              <label className="label py-1">
                <span className="label-text font-semibold text-sm">Group Name</span>
              </label>
              {isEditing ? (
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  placeholder="Enter group name"
                />
              ) : (
                <p className="text-base-content text-sm">{group.name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="label py-1">
                <span className="label-text font-semibold text-sm">Description</span>
              </label>
              {isEditing ? (
                <textarea
                  className="textarea textarea-bordered textarea-sm w-full"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Enter group description"
                  rows={3}
                />
              ) : (
                <p className="text-base-content text-sm whitespace-pre-wrap">
                  {group.description || "No description"}
                </p>
              )}
            </div>

            {/* Group Stats */}
            <div className="divider my-2"></div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-base-content/50 mb-1">Created</p>
                <p className="text-sm font-medium text-base-content">
                  {group.createdAt
                    ? formatDistanceToNow(new Date(group.createdAt), { addSuffix: true })
                    : "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-xs text-base-content/50 mb-1">Members</p>
                <p className="text-sm font-medium text-base-content">{allMembers.length}</p>
              </div>
            </div>

            {/* Action Buttons */}
            {isEditing && (
              <div className="flex gap-2 justify-end pt-2">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedName(group.name || "");
                    setEditedDescription(group.description || "");
                    setGroupPic(null);
                    setGroupPicPreview(null);
                  }}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleUpdateInfo}
                  disabled={isUpdating || !editedName.trim()}
                >
                  {isUpdating ? (
                    <>
                      <FaSpinner className="animate-spin mr-2" />
                      Updating...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "members" && (
          <div className="p-4 space-y-2">
            {/* Add Member Button - Only for Admin */}
            {isAdmin && (
              <button
                onClick={() => setIsAddMemberModalOpen(true)}
                className="btn btn-primary btn-sm w-full mb-2"
              >
                <FaUserPlus className="mr-2" />
                Add Members
              </button>
            )}

            {/* Admin */}
            {group.admin && (
              <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/50">
                <div className="relative">
                <ProfileImage
                  src={group.admin.profilePic}
                  alt={group.admin.fullname}
                  className="size-10 rounded-full object-cover"
                />
                  {onlineUsers.includes(normalizeId(group.admin._id || group.admin)) && (
                    <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {group.admin.fullname}
                    <span className="ml-2 badge badge-primary badge-xs">Admin</span>
                  </p>
                </div>
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
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200/50 transition-colors"
                >
                  <div className="relative">
                    <ProfileImage
                      src={memberObj?.profilePic}
                      alt={memberObj?.fullname || "Member"}
                      className="size-10 rounded-full object-cover"
                    />
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {memberObj?.fullname || "Unknown"}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs text-base-content/50">(You)</span>
                      )}
                    </p>
                  </div>
                  {isAdmin && !isCurrentUser && memberId !== normalizeId(group.admin?._id || group.admin) && (
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={async () => {
                        if (confirm(`Remove ${memberObj?.fullname || "member"} from group?`)) {
                          try {
                            await removeMemberFromGroup(groupId, memberId);
                            toast.success("Member removed successfully");
                            getGroups();
                          } catch (error) {
                            toast.error(error.response?.data?.error || "Failed to remove member");
                          }
                        }
                      }}
                    >
                      <FaTrash />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="p-4 space-y-4">
            <div className="alert alert-warning alert-sm">
              <FaInfoCircle />
              <span className="text-xs">More settings coming soon!</span>
            </div>

            {/* Leave Group */}
            {!isAdmin && (
              <div className="mt-4">
                <button
                  className="btn btn-error btn-sm w-full"
                  onClick={handleLeaveGroup}
                  disabled={isLeaving}
                >
                  {isLeaving ? (
                    <>
                      <FaSpinner className="animate-spin mr-2" />
                      Leaving...
                    </>
                  ) : (
                    <>
                      <FaSignOutAlt className="mr-2" />
                      Leave Group
                    </>
                  )}
                </button>
              </div>
            )}

            {isAdmin && (
              <div className="alert alert-info alert-sm">
                <FaInfoCircle />
                <span className="text-xs">As admin, you can delete the group or transfer admin role.</span>
              </div>
            )}
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

export default GroupInfoPanel;
