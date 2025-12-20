const ConfirmDialog = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  onConfirm, 
  confirmText = "OK", 
  cancelText = "Cancel",
  isDestructive = false,
  isConfirming = false
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    // Let parent component handle closing after action completes
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-base-100 rounded-2xl w-full max-w-sm shadow-2xl border border-base-200/50 overflow-hidden transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div className="p-6">
          <p className="text-base text-base-content text-center mb-4">
            {message || title}
          </p>
          
          {/* Divider */}
          <div className="border-t border-base-200 mb-4"></div>
          
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl bg-base-200 hover:bg-base-300 active:scale-[0.98] transition-all duration-200 text-sm font-medium text-base-content disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isConfirming}
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                isDestructive
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20"
                  : "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20"
              }`}
              disabled={isConfirming}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

