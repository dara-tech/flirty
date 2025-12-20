import { useState, useEffect } from "react";
import { FaTimes, FaSpinner } from "react-icons/fa";

const EditMessageModal = ({ isOpen, onClose, message, onSave }) => {
  const [text, setText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && message) {
      setText(message.text || "");
    }
  }, [isOpen, message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || text.trim() === message.text) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(message._id, text.trim());
      onClose();
    } catch (error) {
      console.error("Error editing message:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !message) return null;

  const hasChanges = text.trim() !== message.text && text.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-base-100 rounded-2xl w-full max-w-md shadow-2xl border border-base-200/50 overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-base-200/50 bg-base-100 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-semibold text-base-content">Edit Message</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-8 rounded-lg hover:bg-base-200 active:scale-95 transition-all duration-200 text-base-content/70 hover:text-base-content disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSaving}
            title="Close"
          >
            <FaTimes className="size-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-base-100 border-2 border-base-300 text-sm placeholder:text-base-content/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
              rows={4}
              placeholder="Edit your message..."
              autoFocus
              disabled={isSaving}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-base-200 hover:bg-base-300 active:scale-[0.98] transition-all duration-200 text-sm font-medium text-base-content disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium flex items-center justify-center gap-2 ${
                hasChanges && !isSaving
                  ? "bg-primary text-primary-content hover:bg-primary/90 active:scale-[0.98] shadow-md shadow-primary/20"
                  : "bg-base-300 text-base-content/50 cursor-not-allowed"
              }`}
              disabled={isSaving || !hasChanges}
            >
              {isSaving ? (
                <>
                  <FaSpinner className="size-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditMessageModal;

