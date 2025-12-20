import { useState } from "react";
import { FaTimes, FaSpinner, FaUser, FaUsers } from "react-icons/fa";

const DeleteConversationModal = ({ isOpen, onClose, user, onDelete, isDeleting }) => {
  const [deleteType, setDeleteType] = useState("forEveryone"); // "forMe" or "forEveryone"

  if (!isOpen || !user) return null;

  const handleDelete = () => {
    onDelete(user._id, deleteType);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200">
      <div className="bg-base-100 rounded-2xl w-full max-w-md shadow-2xl border border-base-200/50 overflow-hidden transition-transform duration-200 transform scale-100">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-base-200/50 bg-base-100 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold text-base-content">Delete Conversation</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-lg hover:bg-base-200 active:scale-95 transition-all duration-200 text-base-content/70 hover:text-base-content disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isDeleting}
            title="Close"
          >
            <FaTimes className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          <p className="text-sm text-base-content/70">
            Are you sure you want to delete the conversation with <span className="font-semibold text-base-content">{user.fullname}</span>?
          </p>

          {/* Delete Type Selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
              Delete for
            </label>
            <div className="space-y-2">
              {/* Delete for Everyone */}
              <button
                type="button"
                onClick={() => setDeleteType("forEveryone")}
                className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left flex items-center gap-3 ${
                  deleteType === "forEveryone"
                    ? "border-primary bg-primary/10"
                    : "border-base-300 bg-base-200/50 hover:border-base-400"
                }`}
                disabled={isDeleting}
              >
                <div className={`flex items-center justify-center size-10 rounded-lg ${
                  deleteType === "forEveryone" ? "bg-primary/20" : "bg-base-300"
                }`}>
                  <FaUsers className={`size-5 ${
                    deleteType === "forEveryone" ? "text-primary" : "text-base-content/60"
                  }`} />
                </div>
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${
                    deleteType === "forEveryone" ? "text-primary" : "text-base-content"
                  }`}>
                    Delete for everyone
                  </div>
                  <div className="text-xs text-base-content/60 mt-0.5">
                    Remove all messages from both sides permanently
                  </div>
                </div>
                {deleteType === "forEveryone" && (
                  <div className="size-5 rounded-full bg-primary border-2 border-primary flex items-center justify-center">
                    <div className="size-2 rounded-full bg-primary-content" />
                  </div>
                )}
              </button>

              {/* Delete for Me */}
              <button
                type="button"
                onClick={() => setDeleteType("forMe")}
                className={`w-full p-3 rounded-xl border-2 transition-all duration-200 text-left flex items-center gap-3 ${
                  deleteType === "forMe"
                    ? "border-primary bg-primary/10"
                    : "border-base-300 bg-base-200/50 hover:border-base-400"
                }`}
                disabled={isDeleting}
              >
                <div className={`flex items-center justify-center size-10 rounded-lg ${
                  deleteType === "forMe" ? "bg-primary/20" : "bg-base-300"
                }`}>
                  <FaUser className={`size-5 ${
                    deleteType === "forMe" ? "text-primary" : "text-base-content/60"
                  }`} />
                </div>
                <div className="flex-1">
                  <div className={`font-semibold text-sm ${
                    deleteType === "forMe" ? "text-primary" : "text-base-content"
                  }`}>
                    Delete for me
                  </div>
                  <div className="text-xs text-base-content/60 mt-0.5">
                    Remove this conversation only from your view
                  </div>
                </div>
                {deleteType === "forMe" && (
                  <div className="size-5 rounded-full bg-primary border-2 border-primary flex items-center justify-center">
                    <div className="size-2 rounded-full bg-primary-content" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-base-200 hover:bg-base-300 active:scale-[0.98] transition-all duration-200 text-sm font-medium text-base-content disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium flex items-center justify-center gap-2 bg-red-500 text-white hover:bg-red-600 active:scale-[0.98] shadow-md shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <FaSpinner className="size-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Delete"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConversationModal;
