import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaSpinner } from "react-icons/fa";
import toast from "react-hot-toast";

const AddMemberModal = ({ isOpen, onClose, groupId }) => {
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const { addMembersToGroup, contacts, getContacts, groups, getGroups } = useChatStore();
  const { authUser } = useAuthStore();

  const group = groups.find((g) => g._id === groupId);

  useEffect(() => {
    if (isOpen) {
      // Load contacts when modal opens
      getContacts();
      setSelectedMembers([]);
    }
  }, [isOpen, getContacts]);

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

  // Filter out current user and existing members
  const availableUsers = contacts.filter((user) => {
    const userId = normalizeId(user._id);
    return userId !== normalizeId(authUser?._id) && !existingMemberIds.has(userId);
  });

  const toggleMember = (userId) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="p-4 space-y-4">
            {/* Select Members */}
            <div>
              <label className="label">
                <span className="label-text">Select Members to Add</span>
              </label>
              <div className="max-h-64 overflow-y-auto hide-scrollbar border border-base-200 rounded-lg p-2 space-y-2">
                {availableUsers.length === 0 ? (
                  <p className="text-center text-base-content/50 py-4">
                    No contacts available to add. All your contacts are already members.
                  </p>
                ) : (
                  availableUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(user._id)}
                        onChange={() => toggleMember(user._id)}
                        className="checkbox checkbox-primary"
                        disabled={isAdding}
                      />
                      <img
                        src={user.profilePic || "/avatar.png"}
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
          <div className="sticky bottom-0 bg-base-100 border-t border-base-200 p-4 flex gap-2">
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
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddMemberModal;

