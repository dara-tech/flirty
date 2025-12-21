import { FaTimes, FaMicrophone, FaPaperclip } from "react-icons/fa";
import toast from "react-hot-toast";

export const ImagePreview = ({ imagePreview, onRemove }) => {
  if (!imagePreview) return null;
  
  return (
    <div className="mb-3 relative w-fit rounded-xl overflow-hidden group shadow-sm">
      <img
        src={imagePreview}
        alt="Selected"
        className="w-32 h-32 object-cover rounded-xl"
      />
      <button
        type="button"
        className="absolute top-2 right-2 size-7 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 bg-base-100/95 hover:bg-base-100 flex items-center justify-center shadow-md"
        onClick={onRemove}
        title="Remove image"
      >
        <FaTimes className="size-3.5 text-base-content" />
      </button>
    </div>
  );
};

export const VideoPreview = ({ videoPreview, onRemove }) => {
  if (!videoPreview) return null;
  
  return (
    <div className="mb-3 relative w-fit rounded-xl overflow-hidden group shadow-sm bg-black">
      <video
        src={videoPreview}
        controls
        preload="metadata"
        playsInline
        className="w-64 h-48 object-contain rounded-xl"
        onError={(e) => {
          console.error("Video preview error:", e);
          toast.error("Failed to load video preview");
        }}
      />
      <button
        type="button"
        className="absolute top-2 right-2 size-7 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 bg-base-100/95 hover:bg-base-100 flex items-center justify-center shadow-md z-10"
        onClick={onRemove}
        title="Remove video"
      >
        <FaTimes className="size-3.5 text-base-content" />
      </button>
    </div>
  );
};

export const AudioPreview = ({ audioPreview, isUploadingMedia, isRecording, onRemove }) => {
  if (!audioPreview || isRecording) return null;
  
  return (
    <div className={`mb-3 relative px-4 py-3 rounded-xl group shadow-sm ${
      isUploadingMedia ? 'bg-primary/10 border border-primary/30' : 'bg-base-200'
    }`}>
      <div className="flex items-center gap-3">
        {isUploadingMedia ? (
          <>
            <div className="loading loading-spinner loading-sm text-primary"></div>
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">Sending voice message...</p>
              <p className="text-xs text-base-content/60">Please wait</p>
            </div>
          </>
        ) : (
          <>
            <FaMicrophone className="size-5 text-primary flex-shrink-0" />
            <audio
              src={audioPreview}
              controls
              className="flex-1 h-8"
              controlsList="nodownload"
            />
            <button
              type="button"
              className="size-7 rounded-full hover:bg-base-300 flex items-center justify-center transition-all flex-shrink-0"
              onClick={onRemove}
              title="Remove audio"
              disabled={isUploadingMedia}
            >
              <FaTimes className="size-3.5 text-base-content" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const FilePreview = ({ filePreview, onRemove }) => {
  if (!filePreview) return null;
  
  return (
    <div className="mb-3 relative px-4 py-3 bg-base-200 rounded-xl group shadow-sm">
      <div className="flex items-center gap-3">
        <FaPaperclip className="size-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-base-content truncate">{filePreview.name}</p>
          <p className="text-xs text-base-content/60">
            {(filePreview.size / 1024).toFixed(2)} KB
          </p>
        </div>
        <button
          type="button"
          className="size-7 rounded-full hover:bg-base-300 flex items-center justify-center transition-all flex-shrink-0"
          onClick={onRemove}
          title="Remove file"
        >
          <FaTimes className="size-3.5 text-base-content" />
        </button>
      </div>
    </div>
  );
};

export const MultipleFilesPreview = ({ selectedFiles, fileInputRef, onRemoveFile, onClearAll }) => {
  if (selectedFiles.length === 0) return null;
  
  const getGridCols = (count) => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-2';
    if (count <= 6) return 'grid-cols-3 sm:grid-cols-3';
    return 'grid-cols-3 sm:grid-cols-4';
  };
  
  return (
    <div className="mb-3 bg-base-200/50 rounded-xl p-3 border border-base-300/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-base-content">
          {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-error hover:text-error/80 transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className={`grid gap-2 ${getGridCols(selectedFiles.length)}`}>
        {selectedFiles.map((fileItem, index) => (
          <div key={index} className="relative rounded-lg overflow-hidden group shadow-sm bg-base-100 border border-base-300/50">
            {fileItem.type === 'image' && (
              <img
                src={fileItem.data}
                alt={fileItem.name || `Image ${index + 1}`}
                className="w-full h-32 sm:h-40 object-cover"
              />
            )}
            {fileItem.type === 'video' && (
              <video
                src={fileItem.preview}
                className="w-full h-32 sm:h-40 object-cover bg-black"
                controls
                preload="metadata"
                playsInline
                onError={(e) => {
                  console.error("Video preview error:", e);
                }}
              />
            )}
            {fileItem.type === 'file' && (
              <div className="w-full h-32 sm:h-40 bg-base-200 flex flex-col items-center justify-center gap-2">
                <FaPaperclip className="size-8 text-base-content/50" />
                <span className="text-xs text-base-content/70 px-2 text-center truncate w-full">
                  {fileItem.name}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all">
              <button
                type="button"
                className="absolute top-1.5 right-1.5 size-7 rounded-full opacity-0 group-hover:opacity-100 transition-all bg-error text-white hover:bg-error/90 flex items-center justify-center shadow-lg z-10"
                onClick={() => onRemoveFile(index)}
                title="Remove file"
              >
                <FaTimes className="size-3.5" />
              </button>
            </div>
            {fileItem.type === 'file' && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 truncate">
                {fileItem.name}
              </div>
            )}
            {fileItem.type === 'image' && selectedFiles.length > 1 && (
              <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                {index + 1}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

