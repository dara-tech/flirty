import { Link, useLocation } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { 
  FaUserCircle, 
  FaComment, 
  FaCog,
  FaPaperclip,
  FaSmile,
  FaMicrophone,
  FaPaperPlane,
  FaTimes,
  FaSpinner,
  FaPhone
} from "react-icons/fa";
import { IoChatbubbles } from "react-icons/io5";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import EmojiPicker from "emoji-picker-react";

const DesktopBottomToolbar = () => {
  const location = useLocation();
  const isChatPage = location.pathname === '/';
  const isGroupInfoRoute = location.pathname.startsWith('/group/') && location.pathname.endsWith('/info');
  const { selectedUser, selectedGroup, selectedSavedMessages, sendMessage, sendGroupMessage, unreadMessages, pendingRequests } = useChatStore();
  
  // Calculate total unread messages count
  const totalUnreadMessages = Object.values(unreadMessages).reduce((sum, count) => sum + (count || 0), 0);
  
  // Calculate pending contact requests count
  const pendingRequestsCount = pendingRequests?.length || 0;
  
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [isResizing, setIsResizing] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null); // For single image (backward compatibility)
  const [imagePreviews, setImagePreviews] = useState([]); // For multiple images
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false); // Only for media uploads
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  const resizerRef = useRef(null);
  const containerRef = useRef(null);
  const emojiPickerRef = useRef(null);
  
  const isGroupChat = !!selectedGroup;
  
  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        // Check if click is not on the emoji button
        const emojiButton = event.target.closest('button[title="Emoji"]');
        if (!emojiButton) {
          setShowEmojiPicker(false);
        }
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker]);
  
  // Listen for group info state changes (desktop panel)
  useEffect(() => {
    const handleGroupInfoStateChange = (e) => {
      setIsGroupInfoOpen(e.detail.isOpen);
    };
    
    window.addEventListener('groupInfoStateChanged', handleGroupInfoStateChange);
    return () => window.removeEventListener('groupInfoStateChanged', handleGroupInfoStateChange);
  }, []);

  // Get left panel width from localStorage and sync with window resize
  useEffect(() => {
    const saved = localStorage.getItem('chat-left-panel-width');
    if (saved) {
      setLeftPanelWidth(parseInt(saved, 10));
    }

    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    
    // Listen for storage changes to sync width
    const handleStorageChange = () => {
      const saved = localStorage.getItem('chat-left-panel-width');
      if (saved) {
        setLeftPanelWidth(parseInt(saved, 10));
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('resize', checkDesktop);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Listen for resize events from main grid
  useEffect(() => {
    const handlePanelResize = (e) => {
      if (!isResizing) { // Only update if we're not the one resizing
        setLeftPanelWidth(e.detail.width);
      }
    };
    window.addEventListener('panel-resize', handlePanelResize);
    return () => window.removeEventListener('panel-resize', handlePanelResize);
  }, [isResizing]);

  // Handle mouse down on resizer
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const minWidth = 240; // Minimum width
      const maxWidth = Math.min(600, containerRect.width * 0.6); // Maximum 60% of container or 600px
      
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setLeftPanelWidth(clampedWidth);
      // Dispatch event to sync with main grid
      window.dispatchEvent(new CustomEvent('panel-resize', { detail: { width: clampedWidth } }));
    }
  }, [isResizing]);

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('chat-left-panel-width', leftPanelWidth.toString());
    }
  }, [isResizing, leftPanelWidth]);

  // Save width to localStorage when it changes
  useEffect(() => {
    if (!isResizing && leftPanelWidth) {
      localStorage.setItem('chat-left-panel-width', leftPanelWidth.toString());
    }
  }, [leftPanelWidth, isResizing]);

  // Add global event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Reset input when chat changes
  useEffect(() => {
    setText("");
    setImagePreview(null);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedUser?._id, selectedGroup?._id]);

  const handleImageChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Filter only image files
    const imageFiles = files.filter(file => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("Please select valid image files");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (imageFiles.length < files.length) {
      toast.error(`${files.length - imageFiles.length} non-image file(s) were ignored`);
    }

    setIsUploading(true);
    const newPreviews = [];
    let filesProcessed = 0;
    const totalFiles = imageFiles.length;

    imageFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        newPreviews.push(reader.result);
        filesProcessed++;

        // When all files are processed
        if (filesProcessed === totalFiles) {
          if (totalFiles === 1) {
            // Single image - use imagePreview for backward compatibility
            setImagePreview(newPreviews[0]);
            setImagePreviews([]);
          } else {
            // Multiple images - use imagePreviews array
            setImagePreviews(newPreviews);
            setImagePreview(null);
          }
          setIsUploading(false);
          
          // Reset input value to allow selecting the same files again
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.onerror = () => {
        toast.error(`Failed to read image file: ${file.name}`);
        filesProcessed++;
        
        if (filesProcessed === totalFiles) {
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.readAsDataURL(file);
    });
  }, []);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeImageAtIndex = useCallback((index) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasImages = imagePreview || imagePreviews.length > 0;
    if (!text.trim() && !hasImages) return;
    if (isSending) return; // Prevent double submission
    
    // Only show loading for media uploads (image), not text messages
    if (hasImages) {
      setIsUploadingMedia(true);
      setIsSending(true);
    } else {
      setIsSending(false); // Text-only - no loading
    }
    
    // Determine which images to send (single or multiple)
    const imagesToSend = imagePreviews.length > 0 
      ? imagePreviews 
      : (imagePreview ? [imagePreview] : []);
    
    if (isGroupChat) {
      if (!selectedGroup?._id) {
        toast.error("No group selected");
        setIsSending(false);
        setIsUploadingMedia(false);
        return;
      }
      try {
        await sendGroupMessage(selectedGroup._id, {
          text: text.trim(),
          image: imagesToSend.length === 1 ? imagesToSend[0] : imagesToSend,
        });
        setText("");
        setImagePreview(null);
        setImagePreviews([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
      } finally {
        setIsSending(false);
        setIsUploadingMedia(false);
      }
    } else {
      if (!selectedUser?._id) {
        toast.error("No chat selected");
        setIsSending(false);
        setIsUploadingMedia(false);
        return;
      }
      try {
        await sendMessage({
          text: text.trim(),
          image: imagesToSend.length === 1 ? imagesToSend[0] : imagesToSend,
        });
        setText("");
        setImagePreview(null);
        setImagePreviews([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
      } finally {
        setIsSending(false);
        setIsUploadingMedia(false);
      }
    }
  };
  
  if (!isChatPage) return null;

  return (
    <nav className="hidden lg:flex fixed bottom-0 left-0 right-0 z-40 bg-base-100/98 backdrop-blur-xl border-t border-base-300/30 h-20">
      <div ref={containerRef} className="w-full flex h-full">
        {/* Left Column - Aligned with left panel */}
        <div 
          className="flex-shrink-0 border-r border-base-300/30"
          style={{ width: `${leftPanelWidth}px` }}
        >
          <div className="h-20 flex items-center justify-around px-2">
            <Link
              to="/?view=calls"
              className="flex items-center justify-center flex-1 h-full min-w-0 transition-all duration-200 hover:scale-110 active:scale-95"
              title="Calls"
            >
              <FaPhone className={`size-7 transition-all ${
                location.search.includes('view=calls')
                  ? 'text-primary fill-primary'
                  : 'text-base-content/50'
              }`} />
            </Link>

            <Link
              to="/?view=chats"
              className="flex items-center justify-center flex-1 h-full min-w-0 transition-all duration-200 hover:scale-110 active:scale-95 relative"
              title="Chats"
            >
              <div className="relative">
                <IoChatbubbles className={`size-7 transition-all ${
                  location.search.includes('view=chats') || (!location.search.includes('view=') && !location.search.includes('settings=true'))
                    ? 'text-primary fill-primary'
                    : 'text-base-content/50'
                }`} />
                {totalUnreadMessages > 0 && (
                  <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                  </span>
                )}
              </div>
            </Link>

            <Link
              to="/?view=settings"
              className="flex items-center justify-center flex-1 h-full min-w-0 transition-all duration-200 hover:scale-110 active:scale-95"
              title="Settings"
            >
              <FaCog className={`size-7 transition-all ${
                location.search.includes('view=settings') || location.search.includes('settings=true')
                  ? 'text-primary fill-primary'
                  : 'text-base-content/50'
              }`} />
            </Link>
          </div>
        </div>

        {/* Resizer - Only visible on desktop */}
        {isDesktop && (
          <div
            ref={resizerRef}
            onMouseDown={handleMouseDown}
            className={`
              w-1
              bg-base-300/50
              hover:bg-primary
              cursor-col-resize
              transition-colors
              flex-shrink-0
              relative
              z-10
              ${isResizing ? 'bg-primary' : ''}
            `}
            style={{
              cursor: isResizing ? 'col-resize' : 'col-resize',
            }}
          >
            {/* Invisible wider hit area for easier dragging */}
            <div className="absolute inset-0 -left-2 -right-2" />
          </div>
        )}

        {/* Right Column - Aligned with right panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
          {/* Image Preview - Positioned absolutely above the toolbar */}
          {((imagePreview || imagePreviews.length > 0) && (selectedUser || selectedGroup)) && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-fit rounded-xl overflow-hidden shadow-lg z-50">
              {imagePreviews.length > 0 ? (
                // Multiple images preview
                <div className="flex gap-2 p-2 bg-base-100 rounded-xl">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Selected ${index + 1}`}
                        className="w-24 h-24 object-cover rounded-lg"
                      />
                      {!isSending && (
                        <button
                          type="button"
                          className="absolute top-1 right-1 size-6 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 bg-base-100/95 hover:bg-base-100 flex items-center justify-center shadow-md"
                          onClick={() => removeImageAtIndex(index)}
                          title="Remove image"
                        >
                          <FaTimes className="size-3 text-base-content" />
                        </button>
                      )}
                    </div>
                  ))}
                  {isSending && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-xl">
                      <div className="flex flex-col items-center gap-2">
                        <FaSpinner className="size-5 text-white animate-spin" />
                        <span className="text-xs text-white font-medium">Uploading...</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Single image preview (backward compatibility)
                <div className="group">
                  <img
                    src={imagePreview}
                    alt="Selected"
                    className="w-32 h-32 object-cover rounded-xl"
                  />
                  {isSending && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-xl">
                      <div className="flex flex-col items-center gap-2">
                        <FaSpinner className="size-5 text-white animate-spin" />
                        <span className="text-xs text-white font-medium">Uploading...</span>
                      </div>
                    </div>
                  )}
                  {!isSending && (
                    <button
                      type="button"
                      className="absolute top-2 right-2 size-7 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 bg-base-100/95 hover:bg-base-100 flex items-center justify-center shadow-md"
                      onClick={removeImage}
                      title="Remove image"
                    >
                      <FaTimes className="size-3.5 text-base-content" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Message Input - Only show when chat is selected and NOT showing group info and NOT saved messages */}
          {(selectedUser || selectedGroup) && !selectedSavedMessages && !isGroupInfoRoute && !isGroupInfoOpen ? (
            <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto">
              <div className="flex items-center gap-2 bg-base-200/90 rounded-2xl px-4 py-3 border border-base-300/30 shadow-inner">
                <button
                  type="button"
                  className="flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Attach file"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isUploadingMedia}
                >
                  {isUploading ? (
                    <div className="loading loading-spinner loading-xs"></div>
                  ) : (
                    <FaPaperclip className="size-4" />
                  )}
                </button>

                <input
                  type="text"
                  placeholder={isUploadingMedia ? "Sending..." : "Write a message..."}
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-base-content/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={isUploadingMedia}
                />

                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  multiple
                />

                <div className="relative">
                  <button
                    type="button"
                    className={`flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 ${
                      showEmojiPicker ? 'bg-primary/20 text-primary' : 'text-primary'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Emoji"
                    disabled={isUploadingMedia}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowEmojiPicker(!showEmojiPicker);
                    }}
                  >
                    <FaSmile className="size-4" />
                  </button>
                  
                  {showEmojiPicker && (
                    <div 
                      ref={emojiPickerRef}
                      className="absolute bottom-full right-0 mb-2 z-[100]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          setText((prev) => prev + emojiData.emoji);
                          setShowEmojiPicker(false);
                        }}
                        theme="dark"
                        width={350}
                        height={400}
                        previewConfig={{
                          showPreview: false
                        }}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 text-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Voice message"
                  disabled={isSending}
                >
                  <FaMicrophone className="size-4" />
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  className={`flex items-center justify-center size-7 rounded-lg transition-all duration-200 ${
                    (!text.trim() && !imagePreview && imagePreviews.length === 0) || isUploadingMedia
                      ? 'opacity-40 cursor-not-allowed'
                      : 'text-primary hover:bg-base-300/50 active:scale-95'
                  }`}
                  title={isUploadingMedia ? "Sending..." : "Send message"}
                  disabled={(!text.trim() && !imagePreview && imagePreviews.length === 0) || isUploadingMedia}
                >
                  {isUploadingMedia ? (
                    <FaSpinner className="size-4 animate-spin" />
                  ) : (
                    <FaPaperPlane className="size-4" />
                  )}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </nav>
  );
};

export default DesktopBottomToolbar;

