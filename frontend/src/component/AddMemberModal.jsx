import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaSpinner, FaSearch } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const AddMemberModal = ({ isOpen, onClose, groupId }) => {
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { addMembersToGroup, allUsers, getAllUsers, isAllUsersLoading, groups, getGroups } = useChatStore();
  const { authUser } = useAuthStore();

  const group = groups.find((g) => g._id === groupId);

  useEffect(() => {
    if (isOpen) {
      // Load all users when modal opens
      getAllUsers();
      setSelectedMembers([]);
      setSearchQuery("");
    }
  }, [isOpen, getAllUsers]);

  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id._id) return id._id.toString();
    return id.toString();
  };

  // Get existing member IDs (admin + members)
  const existingMemberIds = new Set();
  if (group?.admin) {
    existingMemberIds.add(normalizeId(group.admin._id || group.admin));
  }
  if (group?.members) {
    group.members.forEach((member) => {
      existingMemberIds.add(normalizeId(member._id || member));
    });
  }

  // Filter out current user and existing members from all users, then filter by search query
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const availableUsers = safeAllUsers.filter((user) => {
    const userId = normalizeId(user._id);
    const isNotCurrentUser = userId !== normalizeId(authUser?._id);
    const isNotExistingMember = !existingMemberIds.has(userId);
    const matchesSearch = !searchQuery.trim() || 
      user.fullname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    return isNotCurrentUser && isNotExistingMember && matchesSearch;
  });

  const toggleMember = (userId) => {
    // Normalize userId to string for consistency
    const normalizedUserId = typeof userId === 'string' ? userId : userId?.toString();
    if (!normalizedUserId) return;
    
    setSelectedMembers((prev) => {
      const normalizedPrev = prev.map(id => typeof id === 'string' ? id : id?.toString());
      return normalizedPrev.includes(normalizedUserId)
        ? prev.filter((id) => {
            const normalizedId = typeof id === 'string' ? id : id?.toString();
            return normalizedId !== normalizedUserId;
          })
        : [...prev, normalizedUserId];
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one member to add");
      return;
    }

    setIsAdding(true);
    try {
      await addMembersToGroup(groupId, selectedMembers);
      await getGroups(); // Refresh groups to get updated member list
      onClose();
    } catch (error) {
      console.error("Error adding members:", error);
    } finally {
      setIsAdding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-base-100 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-base-100 border-b border-base-200 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Add Members</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
            disabled={isAdding}
          >
            <FaTimes className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-base-100 rounded-lg text-sm border-2 border-base-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 placeholder:text-base-content/40"
              />
            </div>

            {/* Select Members */}
            <div>
              <label className="label">
                <span className="label-text">Select Members to Add</span>
              </label>
              <div className="border border-base-200 rounded-lg p-2 space-y-2 pb-4">
                {isAllUsersLoading ? (
                  <p className="text-center text-base-content/50 py-4">
                    Loading users...
                  </p>
                ) : availableUsers.length === 0 ? (
                  <p className="text-center text-base-content/50 py-4">
                    {searchQuery ? "No users found" : "No users available to add. All users are already members."}
                  </p>
                ) : (
                  availableUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200 cursor-pointer"
                    >
                    <input
                      type="checkbox"
                      checked={selectedMembers.some(id => {
                        const normalizedId = typeof id === 'string' ? id : id?.toString();
                        const normalizedUserId = typeof user._id === 'string' ? user._id : user._id?.toString();
                        return normalizedId === normalizedUserId;
                      })}
                      onChange={() => toggleMember(user._id)}
                      className="checkbox checkbox-primary"
                      disabled={isAdding}
                    />
                      <ProfileImage
                        src={user.profilePic}
                        alt={user.fullname}
                        className="size-10 rounded-full object-cover"
                      />
                      <span className="flex-1">{user.fullname}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-base-200 p-4 flex gap-2 bg-base-100">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost flex-1"
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isAdding || selectedMembers.length === 0}
            >
              {isAdding ? (
                <>
                  <FaSpinner className="size-4 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${selectedMembers.length > 0 ? `(${selectedMembers.length})` : ''}`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddMemberModal;

