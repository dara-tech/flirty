import { useState, useEffect } from "react";
import { useFolderStore } from "../store/useFolderStore";
import { FaTimes, FaEdit, FaTrash } from "react-icons/fa";
import { FOLDER_ICONS, DEFAULT_FOLDER_ICON, getFolderIcon } from "../lib/folderIcons";

const FOLDER_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];

const FolderManagementModal = ({ isOpen, onClose }) => {
  const {
    folders,
    getFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolderExpansion,
  } = useFolderStore();
  const [editingFolder, setEditingFolder] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(DEFAULT_FOLDER_ICON);
  const [selectedColor, setSelectedColor] = useState("#3b82f6");

  useEffect(() => {
    if (isOpen) {
      getFolders();
    }
  }, [isOpen, getFolders]);

  const handleCreate = async () => {
    if (!folderName.trim()) return;
    try {
      await createFolder(folderName.trim(), selectedIcon, selectedColor);
      setFolderName("");
      setSelectedIcon(DEFAULT_FOLDER_ICON);
      setSelectedColor("#3b82f6");
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleUpdate = async () => {
    if (!editingFolder || !folderName.trim()) return;
    try {
      await updateFolder(editingFolder._id, {
        name: folderName.trim(),
        icon: selectedIcon,
        color: selectedColor,
      });
      setEditingFolder(null);
      setFolderName("");
      setSelectedIcon(DEFAULT_FOLDER_ICON);
      setSelectedColor("#3b82f6");
    } catch (error) {
      console.error("Failed to update folder:", error);
    }
  };

  const handleEdit = (folder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setSelectedIcon(folder.icon);
    setSelectedColor(folder.color);
  };

  const handleDelete = async (folderId) => {
    if (window.confirm("Are you sure you want to delete this folder? Conversations will be moved back to the main list.")) {
      try {
        await deleteFolder(folderId);
      } catch (error) {
        console.error("Failed to delete folder:", error);
      }
    }
  };

  const handleCancel = () => {
    setEditingFolder(null);
    setFolderName("");
    setSelectedIcon(DEFAULT_FOLDER_ICON);
    setSelectedColor("#3b82f6");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-base-100 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-base-300">
          <h2 className="text-xl font-bold text-base-content">Manage Folders</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-base-200 rounded-lg transition-colors"
          >
            <FaTimes className="size-5 text-base-content/70" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create/Edit Form */}
          <div className="space-y-4">
            <div>
              <label className="label">
                <span className="label-text font-medium">Folder Name</span>
              </label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="w-full input input-bordered"
                maxLength={50}
              />
            </div>

            <div>
              <label className="label">
                <span className="label-text font-medium">Icon</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {FOLDER_ICONS.map((iconName) => {
                  const IconComponent = getFolderIcon(iconName);
                  return (
                    <button
                      key={iconName}
                      onClick={() => setSelectedIcon(iconName)}
                      className={`p-3 rounded-lg transition-all flex items-center justify-center ${
                        selectedIcon === iconName
                          ? "bg-primary text-primary-content ring-2 ring-primary"
                          : "bg-base-200 hover:bg-base-300 text-base-content"
                      }`}
                      title={iconName}
                    >
                      <IconComponent className="size-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">
                <span className="label-text font-medium">Color</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {FOLDER_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`h-10 rounded-lg transition-all ${
                      selectedColor === color
                        ? "ring-4 ring-offset-2 ring-primary"
                        : "hover:opacity-80"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {editingFolder ? (
                <>
                  <button
                    onClick={handleUpdate}
                    className="btn btn-primary flex-1"
                    disabled={!folderName.trim()}
                  >
                    Update Folder
                  </button>
                  <button onClick={handleCancel} className="btn btn-ghost">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCreate}
                  className="btn btn-primary w-full"
                  disabled={!folderName.trim()}
                >
                  Create Folder
                </button>
              )}
            </div>
          </div>

          {/* Existing Folders */}
          <div className="space-y-2">
            <h3 className="font-semibold text-base-content">Your Folders</h3>
            {folders.length === 0 ? (
              <p className="text-sm text-base-content/60 text-center py-4">
                No folders yet. Create one above!
              </p>
            ) : (
              folders.map((folder) => {
                const FolderIconComponent = getFolderIcon(folder.icon || DEFAULT_FOLDER_ICON);
                return (
                  <div
                    key={folder._id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                  >
                    <FolderIconComponent 
                      className="size-6" 
                      style={{ color: folder.color }}
                    />
                    <div
                      className="w-1 h-8 rounded-full"
                      style={{ backgroundColor: folder.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-base-content truncate">
                        {folder.name}
                      </p>
                      <p className="text-xs text-base-content/60">
                        {folder.conversations.length} conversation
                        {folder.conversations.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(folder)}
                        className="p-2 hover:bg-base-300 rounded-lg transition-colors"
                        title="Edit folder"
                      >
                        <FaEdit className="size-4 text-base-content/70" />
                      </button>
                      <button
                        onClick={() => handleDelete(folder._id)}
                        className="p-2 hover:bg-error/20 rounded-lg transition-colors"
                        title="Delete folder"
                      >
                        <FaTrash className="size-4 text-error" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-base-300">
          <button onClick={onClose} className="btn btn-primary w-full">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderManagementModal;

