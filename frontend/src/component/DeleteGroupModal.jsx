import { useState } from "react";
import { FaTimes, FaSpinner, FaUsers } from "react-icons/fa";

const DeleteGroupModal = ({ isOpen, onClose, group, onDelete, isDeleting }) => {
  if (!isOpen || !group) return null;

  const handleDelete = () => {
    onDelete(group._id);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200">
      <div className="bg-base-100 rounded-2xl w-full max-w-md shadow-2xl border border-base-200/50 overflow-hidden transition-transform duration-200 transform scale-100">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-base-200/50 bg-base-100 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold text-base-content">Delete Group</h2>
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
          <div className="flex items-center gap-3 p-3 bg-base-200/50 rounded-xl">
            <div className="size-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <FaUsers className="size-5 text-red-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-base-content/60">Group Name</p>
              <p className="text-base font-semibold text-base-content">{group.name}</p>
            </div>
          </div>

          <p className="text-sm text-base-content/70">
            Are you sure you want to delete the group <span className="font-semibold text-base-content">{group.name}</span>? This will permanently delete the group and all its messages for all members. This action cannot be undone.
          </p>

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
                "Delete Group"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteGroupModal;
