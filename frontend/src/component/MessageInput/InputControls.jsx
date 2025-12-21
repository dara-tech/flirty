import { useRef } from "react";
import { FaPaperPlane, FaPaperclip, FaSmile, FaMicrophone, FaStop } from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";

const InputControls = ({
  text,
  onTextChange,
  fileInputRef,
  onFileClick,
  onFileChange,
  isUploading,
  isUploadingMedia,
  showEmojiPicker,
  emojiPickerRef,
  onEmojiToggle,
  onEmojiSelect,
  isRecording,
  isRecordingSupported,
  onRecordClick,
  hasContent,
  onSubmit,
  disabled
}) => {
  return (
    <div className="flex items-center gap-2 bg-base-200/90 rounded-2xl px-4 py-3 border border-base-300/30 shadow-inner">
      <button
        type="button"
        className="flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        title="Attach file"
        onClick={onFileClick}
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
        placeholder="Write a message..."
        className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-base-content/50"
        value={text}
        onChange={onTextChange}
        disabled={disabled}
      />

      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="*/*"
        multiple={true}
      />

      <div className="relative">
        <button
          type="button"
          className={`flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 ${
            showEmojiPicker ? 'bg-primary/20 text-primary' : 'text-primary'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Emoji"
          onClick={onEmojiToggle}
          disabled={isUploadingMedia || isUploading}
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
              onEmojiClick={onEmojiSelect}
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
        className={`flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 ${
          isRecording ? 'bg-error text-error-content animate-pulse' : 'text-primary'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          !isRecordingSupported 
            ? "Voice recording not supported" 
            : isRecording 
              ? "Stop recording" 
              : "Voice message"
        }
        disabled={!isRecordingSupported || (isUploading && !isRecording)}
        onClick={onRecordClick}
      >
        {isRecording ? <FaStop className="size-4" /> : <FaMicrophone className="size-4" />}
      </button>

      <button
        type="submit"
        className={`flex items-center justify-center size-7 rounded-lg transition-all duration-200 ${
          !hasContent
            ? 'opacity-40 cursor-not-allowed'
            : 'text-primary hover:bg-base-300/50 active:scale-95'
        }`}
        title="Send message"
        disabled={!hasContent}
        onClick={onSubmit}
      >
        <FaPaperPlane className="size-4" />
      </button>
    </div>
  );
};

export default InputControls;

