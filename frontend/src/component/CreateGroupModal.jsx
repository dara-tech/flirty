import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaUsers, FaImage, FaSpinner } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const CreateGroupModal = ({ isOpen, onClose }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const { createGroup, contacts, getContacts } = useChatStore();
  const { authUser } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      // Load contacts when modal opens
      getContacts();
    } else {
      setName("");
      setDescription("");
      setGroupPic(null);
      setGroupPicPreview(null);
      setSelectedMembers([]);
    }
  }, [isOpen, getContacts]);

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

  const toggleMember = (userId) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Group name is required");
      return;
    }

    setIsCreating(true);
    try {
      await createGroup({
        name: name.trim(),
        description: description.trim(),
        groupPic: groupPicPreview,
        memberIds: selectedMembers,
      });
      onClose();
    } catch (error) {
      console.error("Error creating group:", error);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  // Only show contacts as available members
  const availableUsers = contacts.filter((user) => user._id !== authUser._id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto hide-scrollbar">
        <div className="sticky top-0 bg-base-100 border-b border-base-200 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New Group</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
          >
            <FaTimes className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Group Picture */}
          <div className="flex justify-center">
            <label className="cursor-pointer">
              <div className="relative">
                {groupPicPreview ? (
                  <img
                    src={groupPicPreview}
                    alt="Group preview"
                    className="size-24 rounded-full object-cover ring-2 ring-primary"
                  />
                ) : (
                  <div className="size-24 rounded-full bg-base-200 flex items-center justify-center ring-2 ring-primary">
                    <FaImage className="size-8 text-base-content/50" />
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1.5">
                  <FaImage className="size-3" />
                </div>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageChange}
              />
            </label>
          </div>

          {/* Group Name */}
          <div>
            <label className="label">
              <span className="label-text">Group Name *</span>
            </label>
            <input
              type="text"
              placeholder="Enter group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">
              <span className="label-text">Description (optional)</span>
            </label>
            <textarea
              placeholder="Enter group description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 resize-none"
              rows={3}
            />
          </div>

          {/* Select Members */}
          <div>
            <label className="label">
              <span className="label-text">Add Members</span>
            </label>
            <div className="max-h-48 overflow-y-auto hide-scrollbar border border-base-200 rounded-lg p-2 space-y-2">
              {availableUsers.length === 0 ? (
                <p className="text-center text-base-content/50 py-4">
                  No contacts available. Add contacts first to create a group.
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

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost flex-1"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? (
                <>
                  <FaSpinner className="size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FaUsers className="size-4" />
                  Create Group
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;

