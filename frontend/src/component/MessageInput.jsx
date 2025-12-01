import { useRef, useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { FaImage, FaPaperPlane, FaTimes, FaSpinner, FaPaperclip, FaSmile, FaMicrophone, FaStop } from "react-icons/fa";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecordingSupported, setIsRecordingSupported] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEventRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBase64Ref = useRef(null);
  const audioBlobUrlRef = useRef(null); // Store blob URL for cleanup
  const recordingTimerRef = useRef(null);

  const { sendMessage, sendGroupMessage, sendTypingStatus, sendUploadingPhotoStatus, sendGroupTypingStatus, sendGroupUploadingPhotoStatus } = useChatStore();
  const { selectedUser, selectedGroup } = useChatStore();
  const { authUser } = useAuthStore();
  const socket = useAuthStore.getState().socket;

  const isGroupChat = !!selectedGroup;

  // Check if recording is supported on this browser
  useEffect(() => {
    const checkRecordingSupport = () => {
      // Check if MediaRecorder is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsRecordingSupported(false);
        return;
      }
      
      // Check if MediaRecorder is available
      if (typeof MediaRecorder === 'undefined') {
        setIsRecordingSupported(false);
        return;
      }
      
      // Check if at least one audio format is supported
      const isSupported = MediaRecorder.isTypeSupported('audio/webm') || 
                         MediaRecorder.isTypeSupported('audio/mp4') ||
                         MediaRecorder.isTypeSupported('audio/ogg') ||
                         MediaRecorder.isTypeSupported('audio/wav');
      
      setIsRecordingSupported(isSupported);
    };
    
    checkRecordingSupport();
  }, []);

  useEffect(() => {
    // Cleanup audio blob URL when switching chats
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    
    setText("");
    setImagePreview(null);
    setAudioPreview(null);
    audioChunksRef.current = [];
    audioBase64Ref.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    // Stop recording if switching chats
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [selectedUser?._id, selectedGroup?._id, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Revoke blob URL on unmount
      if (audioBlobUrlRef.current) {
        URL.revokeObjectURL(audioBlobUrlRef.current);
        audioBlobUrlRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();

    reader.onloadend = () => {
      setImagePreview(reader.result);
      setIsUploading(false);
    };

    reader.onerror = () => {
      toast.error("Failed to read image file");
      setIsUploading(false);
    };

    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeAudio = useCallback(() => {
    // Revoke blob URL to free memory
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    setAudioPreview(null);
    audioChunksRef.current = [];
    audioBase64Ref.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    // Check if recording is supported
    if (!isRecordingSupported) {
      toast.error("Voice recording is not supported in your browser");
      return;
    }
    
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Reset chunks
      audioChunksRef.current = [];
      
      // Determine best supported mime type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else {
        // Use default format
        mimeType = '';
      }
      
      // Create MediaRecorder
      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Handle errors during recording
      mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        toast.error("Recording error occurred. Please try again.");
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      };
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => {
          track.stop();
        });
        
        // Get the current duration from state (will be updated by the interval)
        // We'll validate minimum duration based on actual blob size instead
        
        // Check if we have any audio data
        if (audioChunksRef.current.length === 0) {
          toast.error("No audio was recorded. Please try again.");
          setAudioPreview(null);
          audioChunksRef.current = [];
          audioBase64Ref.current = null;
          return;
        }
        
        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType || 'audio/webm' 
        });
        
        // Check if blob has content (at least 1KB)
        if (audioBlob.size < 1024) {
          toast.error("Recording is too short or empty. Please try again.");
          setAudioPreview(null);
          audioChunksRef.current = [];
          audioBase64Ref.current = null;
          return;
        }
        
        // Revoke previous blob URL if exists
        if (audioBlobUrlRef.current) {
          URL.revokeObjectURL(audioBlobUrlRef.current);
        }
        
        // Create preview URL
        const audioUrl = URL.createObjectURL(audioBlob);
        audioBlobUrlRef.current = audioUrl;
        setAudioPreview(audioUrl);
        
        // Convert to base64 for sending
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          // Store base64 in separate ref for sending
          audioBase64Ref.current = base64Audio;
        };
        reader.onerror = () => {
          console.error("Error reading audio file");
          toast.error("Failed to process audio. Please try again.");
        };
        reader.readAsDataURL(audioBlob);
      };
      
      // Start recording with timeslice to get data chunks
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start recording timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error("Error starting recording:", error);
      
      // Provide specific error messages
      let errorMessage = "Failed to access microphone. ";
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage += "Please allow microphone access in your browser settings.";
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage += "No microphone found. Please connect a microphone.";
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage += "Microphone is being used by another application.";
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        errorMessage += "Microphone constraints could not be satisfied.";
      } else if (error.name === 'NotSupportedError') {
        errorMessage += "Recording is not supported in this browser.";
      } else {
        errorMessage += "Please check your microphone permissions.";
      }
      
      toast.error(errorMessage);
      setIsRecording(false);
    }
  }, [isRecordingSupported]);

  const stopRecording = useCallback(() => {
    // Get current duration before stopping
    const currentDuration = recordingDuration;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Note: Duration validation happens in mediaRecorder.onstop callback
    // which has access to the duration at the time of recording stop
  }, [recordingDuration]);

  const handleTyping = useCallback((e) => {
    const newText = e.target.value;
    setText(newText);

    const now = Date.now();
    const THROTTLE_MS = 1000;

    if (isGroupChat && selectedGroup?._id) {
      // Group typing indicator
    const shouldSendTyping = now - lastTypingEventRef.current >= THROTTLE_MS;
      if (shouldSendTyping) {
        lastTypingEventRef.current = now;
        sendGroupTypingStatus(selectedGroup._id, true);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        sendGroupTypingStatus(selectedGroup._id, false);
      }, 2000);
    } else if (selectedUser?._id) {
      // Direct message typing indicator
      const shouldSendTyping = now - lastTypingEventRef.current >= THROTTLE_MS;
    if (shouldSendTyping) {
      lastTypingEventRef.current = now;
      sendTypingStatus(selectedUser._id, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStatus(selectedUser._id, false);
    }, 2000);
    }
  }, [selectedUser?._id, selectedGroup?._id, isGroupChat, sendTypingStatus, sendGroupTypingStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !imagePreview && !audioPreview) return;
    if (isSending) return; // Prevent double submission
    
    // Stop recording if still recording
    if (isRecording) {
      stopRecording();
      // Wait a bit for the recording to finish processing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Clear input immediately for instant feedback
    const messageText = text.trim();
    const messageImage = imagePreview;
    const messageAudio = audioBase64Ref.current;
    
    setText("");
    setImagePreview(null);
    setAudioPreview(null);
    audioChunksRef.current = [];
    audioBase64Ref.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    // Revoke blob URL immediately
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    
    // Clear typing status
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    setIsSending(true);
    
    // Emit uploading photo status if sending an image
    if (messageImage) {
      if (isGroupChat && selectedGroup?._id) {
        sendGroupUploadingPhotoStatus(selectedGroup._id, true);
      } else if (selectedUser?._id) {
        sendUploadingPhotoStatus(selectedUser._id, true);
      }
    }
    
    // Send message in background (no loading spinner)
    if (isGroupChat) {
      if (!selectedGroup?._id) {
        toast.error("No group selected");
        setIsSending(false);
        return;
      }
      sendGroupMessage(selectedGroup._id, {
        text: messageText,
        image: messageImage,
        audio: messageAudio,
      }).catch((error) => {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
        if (messageImage) {
          if (isGroupChat && selectedGroup?._id) {
            sendGroupUploadingPhotoStatus(selectedGroup._id, false);
          } else if (selectedUser?._id) {
            sendUploadingPhotoStatus(selectedUser._id, false);
          }
        }
      }).finally(() => {
        setIsSending(false);
        if (isGroupChat && selectedGroup?._id) {
          sendGroupTypingStatus(selectedGroup._id, false);
          if (messageImage) {
            sendGroupUploadingPhotoStatus(selectedGroup._id, false);
          }
        }
      });
    } else {
      if (!selectedUser?._id) {
        toast.error("No chat selected");
        setIsSending(false);
        return;
      }
      sendMessage({
        text: messageText,
        image: messageImage,
        audio: messageAudio,
      }).catch((error) => {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
        if (messageImage) {
          if (selectedUser?._id) {
            sendUploadingPhotoStatus(selectedUser._id, false);
          }
        }
      }).finally(() => {
        setIsSending(false);
        if (selectedUser?._id) {
          sendTypingStatus(selectedUser._id, false);
          if (messageImage) {
            sendUploadingPhotoStatus(selectedUser._id, false);
          }
        }
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="px-4 pt-3 border-t border-base-200/50 bg-base-100 lg:relative lg:py-3" style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}>
      {/* Recording Indicator */}
      {isRecording && (
        <div className="mb-3 flex items-center gap-3 px-4 py-3 bg-error/10 border border-error/30 rounded-xl">
          <div className="flex items-center gap-2 flex-1">
            <div className="size-3 bg-error rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-error">
              Recording... {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            className="size-8 rounded-full bg-error text-error-content hover:bg-error/90 flex items-center justify-center transition-all"
            onClick={stopRecording}
            title="Stop recording"
          >
            <FaStop className="size-3.5" />
          </button>
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="mb-3 relative w-fit rounded-xl overflow-hidden group shadow-sm">
          <img
            src={imagePreview}
            alt="Selected"
            className="w-32 h-32 object-cover rounded-xl"
          />
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

      {/* Audio Preview */}
      {audioPreview && !isRecording && (
        <div className="mb-3 relative px-4 py-3 bg-base-200 rounded-xl group shadow-sm">
          <div className="flex items-center gap-3">
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
              onClick={removeAudio}
              title="Remove audio"
            >
              <FaTimes className="size-3.5 text-base-content" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 bg-base-200/90 rounded-2xl px-4 py-3 border border-base-300/30 shadow-inner">
        <button
          type="button"
          className="flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isSending}
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
          onChange={handleTyping}
        />

        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleImageChange}
          accept="image/*"
        />

        <button
          type="button"
          className="flex items-center justify-center size-7 rounded-lg hover:bg-base-300/50 active:scale-95 transition-all duration-200 text-primary"
          title="Emoji"
        >
          <FaSmile className="size-4" />
        </button>

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
          onClick={(e) => {
            e.preventDefault();
            if (isRecording) {
              stopRecording();
            } else {
              startRecording();
            }
          }}
        >
          {isRecording ? <FaStop className="size-4" /> : <FaMicrophone className="size-4" />}
        </button>

        {/* Send Button */}
        <button
          type="submit"
          className={`flex items-center justify-center size-7 rounded-lg transition-all duration-200 ${
            (!text.trim() && !imagePreview && !audioPreview)
              ? 'opacity-40 cursor-not-allowed'
              : 'text-primary hover:bg-base-300/50 active:scale-95'
          }`}
          title="Send message"
          disabled={(!text.trim() && !imagePreview && !audioPreview)}
        >
          <FaPaperPlane className="size-4" />
        </button>
      </div>
    </form>
  );
};

export default MessageInput;