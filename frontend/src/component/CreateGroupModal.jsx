import { useState, useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaTimes, FaUsers, FaImage, FaSpinner, FaSearch } from "react-icons/fa";
import ProfileImage from "./ProfileImage";
import toast from "react-hot-toast";

const CreateGroupModal = ({ isOpen, onClose }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupPic, setGroupPic] = useState(null);
  const [groupPicPreview, setGroupPicPreview] = useState(null);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { createGroup, allUsers, getAllUsers, isAllUsersLoading } = useChatStore();
  const { authUser } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      // Load all users when modal opens
      getAllUsers();
    } else {
      setName("");
      setDescription("");
      setGroupPic(null);
      setGroupPicPreview(null);
      setSelectedMembers([]);
      setSearchQuery("");
    }
  }, [isOpen, getAllUsers]);

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
      let groupPicUrl = null;
      
      // Upload group picture to OSS if provided
      if (groupPic) {
        try {
          const { uploadSingleFileToOSS } = await import("../lib/ossService");
          groupPicUrl = await uploadSingleFileToOSS(groupPic, 'sre', 'test01', 'file-upload');
        } catch (error) {
          console.error("Failed to upload group picture:", error);
          toast.error("Failed to upload group picture. Please try again.");
          setIsCreating(false);
          return;
        }
      }

      await createGroup({
        name: name.trim(),
        description: description.trim(),
        groupPic: groupPicUrl || groupPicPreview, // Fallback to preview if OSS upload failed
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

  // Show all users as available members (excluding current user), filtered by search query
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];
  const availableUsers = safeAllUsers.filter((user) => {
    const isNotCurrentUser = user._id !== authUser?._id;
    const matchesSearch = !searchQuery.trim() || 
      user.fullname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    return isNotCurrentUser && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex-shrink-0 border-b border-base-200 p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New Group</h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm btn-circle"
          >
            <FaTimes className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto hide-scrollbar p-4 space-y-4">
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
              <span className="label-text">Add Members</span>
            </label>
            <div className="border border-base-200 rounded-lg p-2 space-y-2 pb-4">
              {isAllUsersLoading ? (
                <p className="text-center text-base-content/50 py-4">
                  Loading users...
                </p>
              ) : availableUsers.length === 0 ? (
                <p className="text-center text-base-content/50 py-4">
                  {searchQuery ? "No users found" : "No users available."}
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
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 border-t border-base-200 p-4 flex gap-2 bg-base-100">
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

