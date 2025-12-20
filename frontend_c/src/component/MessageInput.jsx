import { useRef, useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/useChatStore";
import { FaImage, FaPaperPlane, FaTimes, FaSpinner, FaPaperclip, FaSmile, FaMicrophone, FaStop } from "react-icons/fa";
import { useAuthStore } from "../store/useAuthStore";
import toast from "react-hot-toast";
import EmojiPicker from "emoji-picker-react";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [audioPreview, setAudioPreview] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]); // Array of { file, preview, type, data }
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false); // Only for media uploads
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecordingSupported, setIsRecordingSupported] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingEventRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBase64Ref = useRef(null);
  const audioBlobUrlRef = useRef(null); // Store blob URL for cleanup
  const recordingTimerRef = useRef(null);
  const emojiPickerRef = useRef(null);

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

  // Clear inputs when switching chats (only when chat ID changes)
  useEffect(() => {
    // Cleanup audio blob URL when switching chats
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    
    // Cleanup video preview URLs
    selectedFiles.forEach(file => {
      if (file.preview && file.preview.startsWith('blob:')) {
        URL.revokeObjectURL(file.preview);
      }
    });
    
    // Stop upload status when switching chats - use functional updates to get latest state
    setImagePreview((prevImage) => {
      if (prevImage) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      return null;
    });
    
    setVideoPreview((prevVideo) => {
      if (prevVideo && prevVideo.startsWith('blob:')) {
        URL.revokeObjectURL(prevVideo);
      }
      if (prevVideo) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      return null;
    });
    
    setFilePreview((prevFile) => {
      if (prevFile) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      return null;
    });
    
    setText("");
    setAudioPreview(null);
    setFileData(null);
    setSelectedFiles([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?._id, selectedGroup?._id]);

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

  const handleFileChange = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setIsUploading(true);
    
    // Send upload status immediately when files are selected
    if (isGroupChat && selectedGroup?._id) {
      sendGroupUploadingPhotoStatus(selectedGroup._id, true);
    } else if (selectedUser?._id) {
      sendUploadingPhotoStatus(selectedUser._id, true);
    }
    
    const newFiles = [];
    let filesProcessed = 0;
    const totalFiles = files.length;

    files.forEach((file) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        const fileDataUrl = reader.result;
        const fileType = file.type;
        
        let preview = null;
        let type = 'file';
        
        // Determine file type and create preview
        if (fileType.startsWith("image/")) {
          type = 'image';
          preview = fileDataUrl;
          // For single image, keep backward compatibility
          if (files.length === 1) {
            setImagePreview(fileDataUrl);
            setFilePreview(null);
            setFileData(null);
          }
        } else if (fileType.startsWith("video/")) {
          type = 'video';
          preview = URL.createObjectURL(file);
          // For single video, keep backward compatibility
          if (files.length === 1) {
            setVideoPreview(preview);
            setImagePreview(null);
            setFilePreview(null);
            setFileData(null);
          }
        } else {
          type = 'file';
          // For single file, keep backward compatibility
          if (files.length === 1) {
            setFilePreview({
              name: file.name,
              size: file.size,
              type: file.type,
            });
            setFileData(fileDataUrl);
            setImagePreview(null);
            setVideoPreview(null);
          }
        }
        
        newFiles.push({
          file: file,
          data: fileDataUrl,
          preview: preview,
          type: type,
          name: file.name,
          size: file.size,
          mimeType: file.type,
        });
        
        filesProcessed++;
        
        // When all files are processed
        if (filesProcessed === totalFiles) {
          if (files.length > 1) {
            // Multiple files selected - add to selectedFiles array
            setSelectedFiles(prev => [...prev, ...newFiles]);
          }
          setIsUploading(false);
          
          // Reset input value to allow selecting the same files again
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.onerror = () => {
        toast.error(`Failed to read file: ${file.name}`);
        filesProcessed++;
        
        if (filesProcessed === totalFiles) {
          setIsUploading(false);
          // Stop upload status on error
          if (isGroupChat && selectedGroup?._id) {
            sendGroupUploadingPhotoStatus(selectedGroup._id, false);
          } else if (selectedUser?._id) {
            sendUploadingPhotoStatus(selectedUser._id, false);
          }
          // Reset input value on error
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      reader.readAsDataURL(file);
    });
  }, [isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

  // Keep upload status active while image preview exists (before sending)
  useEffect(() => {
    if (imagePreview) {
      // Ensure upload status is active when image preview exists
      if (isGroupChat && selectedGroup?._id) {
        sendGroupUploadingPhotoStatus(selectedGroup._id, true);
      } else if (selectedUser?._id) {
        sendUploadingPhotoStatus(selectedUser._id, true);
      }
    }
  }, [imagePreview, isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

  const removeImage = useCallback(() => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Stop upload status when removing image
    if (isGroupChat && selectedGroup?._id) {
      sendGroupUploadingPhotoStatus(selectedGroup._id, false);
    } else if (selectedUser?._id) {
      sendUploadingPhotoStatus(selectedUser._id, false);
    }
  }, [isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

  const removeVideo = useCallback(() => {
    if (videoPreview && videoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(videoPreview);
    }
    setVideoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Stop upload status when removing video
    if (isGroupChat && selectedGroup?._id) {
      sendGroupUploadingPhotoStatus(selectedGroup._id, false);
    } else if (selectedUser?._id) {
      sendUploadingPhotoStatus(selectedUser._id, false);
    }
  }, [videoPreview, isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

  const removeFile = useCallback(() => {
    setFilePreview(null);
    setFileData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Stop upload status when removing file
    if (isGroupChat && selectedGroup?._id) {
      sendGroupUploadingPhotoStatus(selectedGroup._id, false);
    } else if (selectedUser?._id) {
      sendUploadingPhotoStatus(selectedUser._id, false);
    }
  }, [isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

  const removeSelectedFile = useCallback((index) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const removed = newFiles.splice(index, 1)[0];
      // Cleanup blob URL if it exists
      if (removed?.preview && removed.preview.startsWith('blob:')) {
        URL.revokeObjectURL(removed.preview);
      }
      // If no files left, stop upload status
      if (newFiles.length === 0) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      return newFiles;
    });
  }, [isGroupChat, selectedGroup?._id, selectedUser?._id, sendGroupUploadingPhotoStatus, sendUploadingPhotoStatus]);

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
      // Request microphone permission with optimized settings for voice messages
      // Note: MediaRecorder uses browser's default codec (usually Opus in WebM)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000, // High quality for voice messages
          channelCount: 1, // Mono is sufficient for voice
          // Chrome-specific optimizations
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
        }
      });
      
      // Reset chunks
      audioChunksRef.current = [];
      
      // Determine best supported mime type (prefer Opus in WebM for best compression/quality)
      // Opus codec is typically used in WebM containers
      let mimeType = '';
      const supportedTypes = [
        'audio/webm;codecs=opus', // Best: Opus in WebM (low latency, good compression)
        'audio/webm',              // Fallback: WebM (usually Opus)
        'audio/ogg;codecs=opus',   // Opus in OGG
        'audio/ogg',               // OGG container
        'audio/mp4',               // MP4 (AAC codec)
        'audio/wav',               // WAV (uncompressed, large files)
      ];
      
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }
      
      // Create MediaRecorder with optimized settings
      // Opus codec provides ~20ms frame latency and good compression
      const options = mimeType ? { 
        mimeType,
        audioBitsPerSecond: 32000, // 32kbps is sufficient for voice (Opus can go lower)
      } : {
        audioBitsPerSecond: 32000, // Set bitrate even if mimeType not specified
      };
      
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
    const hasContent = text.trim() || imagePreview || videoPreview || audioPreview || fileData || selectedFiles.length > 0;
    if (!hasContent) return;
    if (isSending) return; // Prevent double submission
    
    // Stop recording if still recording
    if (isRecording) {
      stopRecording();
      // Wait a bit for the recording to finish processing
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Store values before clearing
    const messageText = text.trim();
    const messageImage = imagePreview;
    const messageVideo = videoPreview;
    const messageAudio = audioBase64Ref.current;
    const messageFile = fileData;
    const messageFileInfo = filePreview;
    const filesToSend = [...selectedFiles];
    
    // Store audio preview URL before clearing (for loading state)
    const audioPreviewUrl = audioPreview;
    
    // Clear inputs immediately for instant feedback
    setText("");
    setImagePreview(null);
    setVideoPreview(null);
    // Keep audio preview visible while sending to show loading state
    if (!messageAudio) {
      setAudioPreview(null);
    }
    setFilePreview(null);
    setFileData(null);
    setSelectedFiles([]);
    // Don't clear audioBase64Ref yet - we'll clear it after successful send
    if (!messageAudio) {
      audioChunksRef.current = [];
      audioBase64Ref.current = null;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    
    // Don't revoke blob URL yet - keep it for loading state if sending audio
    if (!messageAudio && audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
    
    // Cleanup video preview blob URLs
    if (messageVideo && messageVideo.startsWith('blob:')) {
      URL.revokeObjectURL(messageVideo);
    }
    filesToSend.forEach(file => {
      if (file.preview && file.preview.startsWith('blob:')) {
        URL.revokeObjectURL(file.preview);
      }
    });
    
    // Clear typing status
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Check if sending media (image, video, audio, file)
    const hasMedia = messageImage || messageVideo || messageFile || messageAudio || filesToSend.length > 0;
    
    // Only show loading for media uploads, not text messages
    if (hasMedia) {
      setIsUploadingMedia(true);
      setIsSending(true);
      
      // Emit uploading status if sending media
      if (isGroupChat && selectedGroup?._id) {
        sendGroupUploadingPhotoStatus(selectedGroup._id, true);
      } else if (selectedUser?._id) {
        sendUploadingPhotoStatus(selectedUser._id, true);
      }
    } else {
      // Text-only message - no loading state, send immediately
      setIsSending(false);
    }
    
    // Function to send a single message
    const sendSingleMessage = async (payload) => {
      if (isGroupChat) {
        if (!selectedGroup?._id) {
          throw new Error("No group selected");
        }
        return await sendGroupMessage(selectedGroup._id, payload);
      } else {
        if (!selectedUser?._id) {
          throw new Error("No chat selected");
        }
        return await sendMessage(payload);
      }
    };
    
    try {
      // Send text message first if there's text and no single media
      if (messageText && !messageImage && !messageVideo && !messageAudio && !messageFile && filesToSend.length === 0) {
        await sendSingleMessage({ text: messageText });
      }
      
      // Send single image/video/audio/file (backward compatibility)
      // Only send single files if we don't have multiple files to send
      if (filesToSend.length === 0 && (messageImage || messageVideo || messageAudio || messageFile)) {
        let videoDataUri = undefined;
        if (messageVideo) {
          try {
            console.log(`Converting video to data URI: ${messageVideo.substring(0, 50)}...`);
            videoDataUri = await blobToDataURL(messageVideo);
            console.log(`Video converted successfully: ${videoDataUri ? videoDataUri.substring(0, 50) + '...' : 'null'}`);
          } catch (error) {
            console.error("Failed to convert video to data URI:", error);
            toast.error("Failed to process video. Please try again.");
            return;
          }
        }
        
        const payload = {
          text: messageText || "",
          image: messageImage || undefined,
          video: videoDataUri,
          audio: messageAudio || undefined,
        };
        
        if (messageFile && messageFileInfo) {
          payload.file = messageFile;
          payload.fileName = messageFileInfo.name;
          payload.fileSize = messageFileInfo.size;
          payload.fileType = messageFileInfo.type;
        }
        
        await sendSingleMessage(payload);
      }
      
      // Send multiple files - group by type and send in single message
      if (filesToSend.length > 0) {
        // Set upload state once for all files (only show one indicator)
        const firstImageFile = filesToSend.find(f => f.type === 'image');
        if (firstImageFile) {
          useChatStore.setState({ 
            isCurrentUserUploading: true,
            uploadingImagePreview: firstImageFile.data,
            uploadType: 'image'
          });
        } else {
          // For non-image files, still show upload state
          useChatStore.setState({ 
            isCurrentUserUploading: true,
            uploadType: 'file'
          });
        }
        
        // Emit uploading status
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, true);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, true);
        }
        
        // Group files by type
        const imageFiles = filesToSend.filter(f => f.type === 'image');
        const videoFiles = filesToSend.filter(f => f.type === 'video');
        const otherFiles = filesToSend.filter(f => f.type === 'file');
        
        // Process videos to data URIs
        const videoDataUris = [];
        for (const videoFile of videoFiles) {
          try {
            console.log(`Converting video file to data URI: ${videoFile.preview?.substring(0, 50)}...`);
            const videoDataUri = await blobToDataURL(videoFile.preview);
            videoDataUris.push(videoDataUri);
            console.log(`Video file converted successfully`);
          } catch (error) {
            console.error("Failed to convert video file to data URI:", error);
            toast.error(`Failed to process video ${videoFile.name}. Skipping...`);
          }
        }
        
        // Build payload with arrays for multiple files
        // Note: fileName, fileSize, fileType arrays should match the order of image, video, file arrays
        const payload = {
          text: messageText || "",
        };
        
        // Send images as array
        if (imageFiles.length > 0) {
          payload.image = imageFiles.map(f => f.data);
          console.log(`Sending ${imageFiles.length} image(s) as array:`, imageFiles.map(f => f.name));
        }
        
        // Send videos as array
        if (videoDataUris.length > 0) {
          payload.video = videoDataUris;
          console.log(`Sending ${videoDataUris.length} video(s) as array`);
        }
        
        // Send files as array
        if (otherFiles.length > 0) {
          payload.file = otherFiles.map(f => f.data);
          console.log(`Sending ${otherFiles.length} file(s) as array`);
        }
        
        // Metadata arrays: images first, then videos, then other files
        const allFileNames = [...imageFiles.map(f => f.name), ...videoFiles.map(f => f.name), ...otherFiles.map(f => f.name)];
        const allFileSizes = [...imageFiles.map(f => f.size), ...videoFiles.map(f => f.size), ...otherFiles.map(f => f.size)];
        const allFileTypes = [...imageFiles.map(f => f.mimeType), ...videoFiles.map(f => f.mimeType), ...otherFiles.map(f => f.mimeType)];
        
        if (allFileNames.length > 0) {
          payload.fileName = allFileNames;
          payload.fileSize = allFileSizes;
          payload.fileType = allFileTypes;
        }
        
        console.log('Multi-file payload:', {
          imageCount: imageFiles.length,
          videoCount: videoDataUris.length,
          fileCount: otherFiles.length,
          hasText: !!payload.text,
          payloadKeys: Object.keys(payload)
        });
        
        // Send all files in a single message
        await sendSingleMessage(payload);
        
        // Clear upload state after all files are sent
        useChatStore.setState({ 
          isCurrentUserUploading: false, 
          uploadingImagePreview: null,
          uploadType: null,
          uploadProgress: 0
        });
        
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      
      // Clear audio preview and refs after successful send
      if (messageAudio) {
        setAudioPreview(null);
        audioChunksRef.current = [];
        audioBase64Ref.current = null;
        if (audioBlobUrlRef.current) {
          URL.revokeObjectURL(audioBlobUrlRef.current);
          audioBlobUrlRef.current = null;
        }
      }
      
      // Clear upload state after all messages are sent
      useChatStore.setState({ 
        isCurrentUserUploading: false, 
        uploadingImagePreview: null,
        uploadType: null,
        uploadProgress: 0
      });
      
      // Stop upload status after sending (only if not already cleared by files loop)
      if (hasMedia && filesToSend.length === 0) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
      
      if (isGroupChat && selectedGroup?._id) {
        sendGroupTypingStatus(selectedGroup._id, false);
      } else if (selectedUser?._id) {
        sendTypingStatus(selectedUser._id, false);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
      
      // Restore audio preview on error
      if (messageAudio) {
        setAudioPreview(audioPreviewUrl);
      }
      
      // Stop upload status on error
      if (hasMedia) {
        if (isGroupChat && selectedGroup?._id) {
          sendGroupUploadingPhotoStatus(selectedGroup._id, false);
        } else if (selectedUser?._id) {
          sendUploadingPhotoStatus(selectedUser._id, false);
        }
      }
    } finally {
      setIsSending(false);
      setIsUploadingMedia(false);
    }
    
  };
  
  // Helper function to convert blob URL to data URL
  const blobToDataURL = async (blobUrl) => {
    if (!blobUrl) {
      console.warn("blobToDataURL: No blob URL provided");
      return undefined;
    }
    
    // If it's already a data URI, return it as is
    if (blobUrl.startsWith('data:')) {
      console.log("blobToDataURL: Already a data URI, returning as is");
      return blobUrl;
    }
    
    // If it's not a blob URL, something is wrong
    if (!blobUrl.startsWith('blob:')) {
      console.error(`blobToDataURL: Expected blob URL but got: ${blobUrl.substring(0, 100)}`);
      throw new Error(`Invalid blob URL: ${blobUrl.substring(0, 50)}`);
    }
    
    try {
      console.log(`blobToDataURL: Fetching blob from ${blobUrl.substring(0, 50)}...`);
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log(`blobToDataURL: Blob fetched - size=${blob.size} bytes, type=${blob.type}`);
      
      if (blob.size === 0) {
        throw new Error("Blob is empty");
      }
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onloadend = () => {
          const result = reader.result;
          if (!result) {
            reject(new Error("FileReader returned no result"));
            return;
          }
          
          if (!result.startsWith('data:')) {
            reject(new Error(`FileReader result is not a data URI: ${result.substring(0, 50)}`));
            return;
          }
          
          console.log(`blobToDataURL: Data URL created - length=${result.length}, type=${result.substring(5, 20)}`);
          resolve(result);
        };
        
        reader.onerror = (error) => {
          console.error("blobToDataURL: FileReader error:", error);
          reject(new Error(`FileReader error: ${error.message || 'Unknown error'}`));
        };
        
        reader.onabort = () => {
          reject(new Error("FileReader aborted"));
        };
        
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("blobToDataURL: Error converting blob to data URL:", error);
      throw error; // Re-throw instead of returning blobUrl
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
          <button
            type="button"
            className="absolute top-2 right-2 size-7 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 bg-base-100/95 hover:bg-base-100 flex items-center justify-center shadow-md"
            onClick={removeImage}
            title="Remove image"
          >
            <FaTimes className="size-3.5 text-base-content" />
          </button>
        </div>
      )}

      {/* Video Preview */}
      {videoPreview && (
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
            onClick={removeVideo}
            title="Remove video"
          >
            <FaTimes className="size-3.5 text-base-content" />
          </button>
        </div>
      )}

      {/* Multiple Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="mb-3 bg-base-200/50 rounded-xl p-3 border border-base-300/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-base-content">
              {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedFiles([]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-xs text-error hover:text-error/80 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className={`grid gap-2 ${
            selectedFiles.length === 1 ? 'grid-cols-1' :
            selectedFiles.length === 2 ? 'grid-cols-2' :
            selectedFiles.length <= 4 ? 'grid-cols-2 sm:grid-cols-2' :
            selectedFiles.length <= 6 ? 'grid-cols-3 sm:grid-cols-3' :
            'grid-cols-3 sm:grid-cols-4'
          }`}>
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
                    onClick={() => removeSelectedFile(index)}
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
                {/* Image number badge */}
                {fileItem.type === 'image' && selectedFiles.length > 1 && (
                  <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                    {index + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audio Preview */}
      {audioPreview && !isRecording && (
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
              onClick={removeAudio}
              title="Remove audio"
                  disabled={isUploadingMedia}
            >
              <FaTimes className="size-3.5 text-base-content" />
            </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* File Preview */}
      {filePreview && (
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
              onClick={removeFile}
              title="Remove file"
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
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
          onChange={handleTyping}
        />

        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowEmojiPicker(!showEmojiPicker);
            }}
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
            (!text.trim() && !imagePreview && !videoPreview && !audioPreview && !fileData && selectedFiles.length === 0)
              ? 'opacity-40 cursor-not-allowed'
              : 'text-primary hover:bg-base-300/50 active:scale-95'
          }`}
          title="Send message"
          disabled={(!text.trim() && !imagePreview && !videoPreview && !audioPreview && !fileData && selectedFiles.length === 0)}
        >
          <FaPaperPlane className="size-4" />
        </button>
      </div>
    </form>
  );
};

export default MessageInput;