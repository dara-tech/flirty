import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Modal, ScrollView, Image, Alert, ActionSheetIOS, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../theme';
import { useAuthStore } from '../store/useAuthStore';

// Common emojis organized by category
const EMOJI_CATEGORIES = {
  'Frequently Used': ['😀', '😂', '🥰', '😍', '🤔', '😎', '👍', '❤️', '🔥', '✨'],
  'Smileys & People': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙'],
  'Gestures': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️'],
  'Objects': ['🔥', '✨', '⭐', '🌟', '💫', '⚡', '☄️', '💥', '💢', '💯', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖'],
};

export default function MessageInput({ onSend, disabled = false, receiverId, groupId = null, editingMessage = null, onCancelEdit = null }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudioUri, setRecordedAudioUri] = useState(null);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const typingTimeoutRef = useRef(null);
  const recordingRef = useRef(null);
  const recordingDurationIntervalRef = useRef(null);
  const socket = useAuthStore((state) => state.socket);
  const isGroup = !!groupId;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Set text when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '');
    } else {
      setText('');
      setSelectedImages([]);
      setSelectedVideos([]);
      setSelectedFiles([]);
      setRecordedAudioUri(null);
    }
  }, [editingMessage]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      if (recordingDurationIntervalRef.current) {
        clearInterval(recordingDurationIntervalRef.current);
      }
    };
  }, []);

  // Animate pulse when recording
  useEffect(() => {
    if (isRecording) {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Send typing indicator
  const handleTyping = () => {
    if (!socket || !socket.connected) return;
    if (!receiverId && !groupId) return;

    if (isGroup && groupId) {
      // Group typing
      socket.emit('groupTyping', { groupId });
    } else if (receiverId) {
      // Direct message typing
      socket.emit('typing', { receiverId });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isGroup && groupId) {
        socket.emit('groupStopTyping', { groupId });
      } else if (receiverId) {
        socket.emit('stopTyping', { receiverId });
      }
    }, 3000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleSend = async () => {
    const hasMedia = selectedImages.length > 0 || selectedVideos.length > 0 || selectedFiles.length > 0 || recordedAudioUri;
    if ((text.trim() || hasMedia) && onSend) {
      // Stop typing indicator
      if (socket && socket.connected) {
        if (isGroup && groupId) {
          socket.emit('groupStopTyping', { groupId });
        } else if (receiverId) {
          socket.emit('stopTyping', { receiverId });
        }
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Check if sending voice message
      const isVoiceMessage = !!recordedAudioUri && !text.trim() && selectedImages.length === 0 && selectedVideos.length === 0 && selectedFiles.length === 0;
      
      if (isVoiceMessage) {
        setIsSendingVoice(true);
      }
      
      try {
        await onSend(text.trim(), selectedImages, selectedVideos, selectedFiles, recordedAudioUri);
        
        // Clear inputs after successful send
      setText('');
      setSelectedImages([]);
      setSelectedVideos([]);
      setSelectedFiles([]);
      setRecordedAudioUri(null);
      setShowEmojiPicker(false);
      } catch (error) {
        console.error('Error sending message:', error);
        // Don't clear audio preview on error so user can retry
        if (!isVoiceMessage) {
          setText('');
          setSelectedImages([]);
          setSelectedVideos([]);
          setSelectedFiles([]);
        }
      } finally {
        setIsSendingVoice(false);
      }
    }
  };

  const startRecording = async () => {
    try {
      console.log('🎤 Starting recording...');
      
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      console.log('🎤 Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need microphone permissions to record audio. Please enable it in Settings.');
        return;
      }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      console.log('🎤 Audio mode set, creating recording...');

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      console.log('✅ Recording created:', recording);

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);

      // Update duration every second
      recordingDurationIntervalRef.current = setInterval(() => {
        recording.getStatusAsync().then((status) => {
          if (status.isRecording) {
            setRecordingDuration(Math.floor(status.durationMillis / 1000));
          }
        }).catch((err) => {
          console.warn('⚠️ Error getting recording status:', err);
        });
      }, 1000);
      
      console.log('✅ Recording started successfully');
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      Alert.alert('Recording Error', `Failed to start recording: ${error.message || 'Unknown error'}. Please try again.`);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      // Prevent multiple calls
      if (!recordingRef.current || !isRecording) {
        console.log('⚠️ No active recording to stop');
        return;
      }

      const recording = recordingRef.current;
      
        // Get duration before stopping (iOS issue)
      let status;
      let duration = recordingDuration * 1000;
      try {
        status = await recording.getStatusAsync();
        duration = status.durationMillis || duration;
      } catch (statusError) {
        console.warn('⚠️ Could not get recording status:', statusError);
      }
        
      // Stop and unload the recording
      try {
        await recording.stopAndUnloadAsync();
      } catch (stopError) {
        // If recorder doesn't exist, it might already be stopped
        if (stopError.message && stopError.message.includes('does not exist')) {
          console.log('⚠️ Recorder already stopped');
        } else {
          throw stopError;
        }
      }
        
        // Get URI after stopping/unloading (correct order)
      let uri = null;
      try {
        uri = recording.getURI();
      } catch (uriError) {
        console.warn('⚠️ Could not get recording URI:', uriError);
      }
      
      // Clear refs immediately to prevent double-stop
        recordingRef.current = null;
        setIsRecording(false);
        
        if (recordingDurationIntervalRef.current) {
          clearInterval(recordingDurationIntervalRef.current);
          recordingDurationIntervalRef.current = null;
        }

        if (uri && duration > 0) {
        console.log('✅ Recording stopped, URI:', uri, 'Duration:', duration);
        // Small delay to ensure file is fully written
        await new Promise(resolve => setTimeout(resolve, 100));
          setRecordedAudioUri(uri);
        } else {
          // Recording was too short or cancelled
        console.log('⚠️ Recording cancelled or too short, duration:', duration);
          setRecordedAudioUri(null);
        }
        setRecordingDuration(0);
    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        recordingRef: !!recordingRef.current,
        isRecording,
      });
      // Clear state even on error
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingDuration(0);
      setRecordedAudioUri(null);
      
      // Only show alert for non-recoverable errors
      if (!error.message || !error.message.includes('does not exist')) {
        Alert.alert('Recording Error', 'Failed to stop recording. Please try again.');
      }
    }
  };

  const handleVoiceButtonPress = async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  };

  const cancelRecording = async () => {
    await stopRecording();
    setRecordedAudioUri(null);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to upload images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.8,
        selectionLimit: 0, // 0 means no limit
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = result.assets.map(asset => asset.uri);
        setSelectedImages(prev => [...prev, ...newImages]);
        if (__DEV__) {
          console.log(`✅ Selected ${newImages.length} image(s), total: ${selectedImages.length + newImages.length}`);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handlePickVideo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to upload videos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60, // 60 seconds max
        selectionLimit: 0, // 0 means no limit (unlimited selection)
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newVideos = result.assets.map(asset => ({
          uri: asset.uri,
          duration: asset.duration,
          width: asset.width,
          height: asset.height,
        }));
        setSelectedVideos(prev => [...prev, ...newVideos]);
        if (__DEV__) {
          console.log(`✅ Selected ${newVideos.length} video(s), total: ${selectedVideos.length + newVideos.length}`);
        }
      }
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to pick video.');
    }
  };

  const handleRecordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to record videos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60, // 60 seconds max
        allowsMultipleSelection: false, // Camera can only record one video at a time
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setSelectedVideos(prev => [...prev, {
          uri: result.assets[0].uri,
          duration: result.assets[0].duration,
          width: result.assets[0].width,
          height: result.assets[0].height,
        }]);
        if (__DEV__) {
          console.log(`✅ Added video, total: ${selectedVideos.length + 1}`);
        }
      }
    } catch (error) {
      console.error('Error recording video:', error);
      Alert.alert('Error', 'Failed to record video.');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera permissions to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false, // Camera can only take one photo at a time
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setSelectedImages(prev => [...prev, result.assets[0].uri]);
        if (__DEV__) {
          console.log(`✅ Added photo, total: ${selectedImages.length + 1}`);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo.');
    }
  };

  const handlePickFile = async () => {
    try {
      // Use getDocumentAsync with multiple: true for multiple file selection
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true, // Enable multiple selection
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles = result.assets.map(file => ({
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
        }));
        setSelectedFiles(prev => [...prev, ...newFiles]);
        if (__DEV__) {
          console.log(`✅ Selected ${newFiles.length} file(s), total: ${selectedFiles.length + newFiles.length}`);
        }
      }
    } catch (error) {
      // User cancelled or error occurred
      if (DocumentPicker.isCancel && DocumentPicker.isCancel(error)) {
        // User cancelled, do nothing
        if (__DEV__) {
          console.log('User cancelled file picker');
        }
      } else {
        console.error('Error picking file:', error);
        Alert.alert('Error', 'Failed to pick file.');
      }
    }
  };

  const handleAttachmentPress = () => {
    const options = ['Photo Library', 'Take Photo', 'Video Library', 'Record Video', 'Document', 'Cancel'];
    const cancelButtonIndex = 5;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) handlePickImage();
          else if (buttonIndex === 1) handleTakePhoto();
          else if (buttonIndex === 2) handlePickVideo();
          else if (buttonIndex === 3) handleRecordVideo();
          else if (buttonIndex === 4) handlePickFile();
        }
      );
    } else {
      Alert.alert(
        'Select Attachment',
        'Choose an option',
        [
          { text: 'Photo Library', onPress: handlePickImage },
          { text: 'Take Photo', onPress: handleTakePhoto },
          { text: 'Video Library', onPress: handlePickVideo },
          { text: 'Record Video', onPress: handleRecordVideo },
          { text: 'Document', onPress: handlePickFile },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleEmojiPress = (emoji) => {
    setText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  return (
    <>
      {/* Edit Mode Banner */}
      {editingMessage && (
        <View style={styles.editBanner}>
          <View style={styles.editBannerContent}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Text style={styles.editBannerText}>Editing message</Text>
            <TouchableOpacity onPress={onCancelEdit} style={styles.cancelEditButton}>
              <Ionicons name="close" size={18} color={commonStyles.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <View style={styles.previewContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScrollView}>
            {selectedImages.map((imageUri, index) => (
              <View key={index} style={styles.previewItem}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <TouchableOpacity
                  style={styles.removePreviewButton}
                  onPress={() => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Selected Videos Preview */}
      {selectedVideos.length > 0 && (
        <View style={styles.previewContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScrollView}>
            {selectedVideos.map((video, index) => (
              <View key={index} style={styles.previewItem}>
                <View style={styles.videoPreview}>
                  <Ionicons name="videocam" size={32} color={colors.primary} />
                  <View style={styles.videoPreviewInfo}>
                    <Text style={styles.videoPreviewText}>Video</Text>
                    {video.duration && (
                      <Text style={styles.videoPreviewDuration}>
                        {Math.floor(video.duration)}s
                      </Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removePreviewButton}
                  onPress={() => setSelectedVideos(prev => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <View style={styles.previewContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScrollView}>
            {selectedFiles.map((file, index) => (
              <View key={index} style={styles.previewItem}>
                <View style={styles.filePreview}>
                  <Ionicons name="document" size={32} color={colors.primary} />
                  <View style={styles.filePreviewInfo}>
                    <Text style={styles.filePreviewName} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={styles.filePreviewSize}>
                      {(file.size / 1024).toFixed(2)} KB
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.removePreviewButton}
                  onPress={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recording Preview */}
      {recordedAudioUri && !isRecording && (
        <View style={[styles.previewContainer, isSendingVoice && styles.previewContainerSending]}>
          <View style={styles.audioPreview}>
            {isSendingVoice ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <View style={styles.audioPreviewInfo}>
                  <Text style={[styles.audioPreviewText, styles.audioPreviewTextSending]}>
                    Sending voice message...
                  </Text>
                  <Text style={styles.audioPreviewDuration}>
                    {formatDuration(recordingDuration)}
                  </Text>
                </View>
              </>
            ) : (
              <>
            <Ionicons name="mic" size={24} color={colors.primary} />
            <View style={styles.audioPreviewInfo}>
              <Text style={styles.audioPreviewText}>Voice message</Text>
              <Text style={styles.audioPreviewDuration}>
                {formatDuration(recordingDuration)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.removePreviewButton}
              onPress={cancelRecording}
                  disabled={isSendingVoice}
            >
              <Ionicons name="close-circle" size={24} color={colors.primary} />
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <View style={styles.recordingContainer}>
          <Animated.View style={[styles.recordingIndicator, { transform: [{ scale: pulseAnim }] }]}>
            <Ionicons name="mic" size={20} color={colors.textWhite} />
          </Animated.View>
          <Text style={styles.recordingText}>
            Recording... {formatDuration(recordingDuration)}
          </Text>
          <TouchableOpacity
            style={styles.cancelRecordingButton}
            onPress={cancelRecording}
          >
            <Ionicons name="close" size={20} color={commonStyles.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.container}>
        <View style={styles.inputContainer}>
          {!editingMessage && (
            <TouchableOpacity
              style={styles.attachmentButton}
              onPress={handleAttachmentPress}
              activeOpacity={0.7}
              disabled={disabled}
            >
              <Ionicons name="attach-outline" size={22} color={commonStyles.textSecondary} />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.emojiButton}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            activeOpacity={0.7}
            disabled={disabled}
          >
            <Ionicons name="happy-outline" size={22} color={commonStyles.textSecondary} />
          </TouchableOpacity>
          
          <TextInput
            style={styles.input}
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            placeholderTextColor={commonStyles.textTertiary}
            value={text}
            onChangeText={(newText) => {
              setText(newText);
              if (!editingMessage) handleTyping();
            }}
            multiline
            maxLength={1000}
            editable={!disabled}
          />
          
          {isRecording ? (
            <TouchableOpacity
              style={[styles.voiceButton, styles.voiceButtonRecording]}
              onPress={handleVoiceButtonPress}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Ionicons 
                  name="stop" 
                  size={20} 
                  color={colors.textWhite} 
                />
              </Animated.View>
            </TouchableOpacity>
          ) : (text.trim() || selectedImages.length > 0 || selectedVideos.length > 0 || selectedFiles.length > 0 || recordedAudioUri) ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={disabled || isSendingVoice}
              activeOpacity={0.7}
            >
              {isSendingVoice ? (
                <ActivityIndicator size="small" color={colors.textWhite} />
              ) : (
              <Ionicons 
                name={editingMessage ? "checkmark" : "send"} 
                size={20} 
                color={colors.textWhite} 
              />
              )}
            </TouchableOpacity>
          ) : !editingMessage ? (
            <TouchableOpacity
              style={styles.voiceButton}
              onPress={handleVoiceButtonPress}
              disabled={disabled}
              activeOpacity={0.7}
            >
                <Ionicons 
                name="mic" 
                  size={20} 
                color={commonStyles.textSecondary} 
                />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal
        visible={showEmojiPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPickerContainer}>
            <View style={styles.emojiPickerHeader}>
              <Text style={styles.emojiPickerTitle}>Emoji</Text>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.emojiScrollView} showsVerticalScrollIndicator={false}>
              {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                <View key={category} style={styles.emojiCategory}>
                  <Text style={styles.emojiCategoryTitle}>{category}</Text>
                  <View style={styles.emojiGrid}>
                    {emojis.map((emoji, index) => (
                      <TouchableOpacity
                        key={`${category}-${index}`}
                        style={styles.emojiItem}
                        onPress={() => handleEmojiPress(emoji)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.emojiText}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: commonStyles.borderColor,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
    paddingBottom: Platform.OS === 'ios' ? spacing.md + 8 : spacing.md + 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: commonStyles.backgroundSecondary,
    borderRadius: 22,
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    minHeight: 44,
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
  },
  emojiButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    color: commonStyles.textPrimary,
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    lineHeight: 20,
    marginRight: spacing.xs,
  },
  attachmentButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  sendButton: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sendButtonDisabled: {
    backgroundColor: commonStyles.textTertiary,
    opacity: 0.6,
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  sendButtonText: {
    color: colors.textWhite,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  emojiPickerContainer: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  emojiPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColor,
  },
  emojiPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: commonStyles.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiScrollView: {
    maxHeight: 300,
  },
  emojiCategory: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  emojiCategoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: commonStyles.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  emojiItem: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: commonStyles.backgroundSecondary,
  },
  emojiText: {
    fontSize: 24,
  },
  editBanner: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
  },
  editBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBannerText: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelEditButton: {
    padding: spacing.xs,
  },
  previewContainer: {
    backgroundColor: commonStyles.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: commonStyles.borderColor,
  },
  previewContainerSending: {
    backgroundColor: colors.primary + '15',
    borderBottomColor: colors.primary + '30',
  },
  previewScrollView: {
    flexDirection: 'row',
  },
  previewItem: {
    marginRight: spacing.sm,
    position: 'relative',
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: 8,
  },
  filePreviewInfo: {
    flex: 1,
  },
  filePreviewName: {
    fontSize: 14,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: 2,
  },
  filePreviewSize: {
    fontSize: 12,
    color: commonStyles.textSecondary,
  },
  removePreviewButton: {
    padding: spacing.xs,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
    gap: spacing.sm,
  },
  recordingIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingText: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelRecordingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: commonStyles.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: 8,
  },
  audioPreviewInfo: {
    flex: 1,
  },
  audioPreviewText: {
    fontSize: 14,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: 2,
  },
  audioPreviewDuration: {
    fontSize: 12,
    color: commonStyles.textSecondary,
  },
  audioPreviewTextSending: {
    color: colors.primary,
    fontWeight: '600',
  },
  voiceButton: {
    backgroundColor: commonStyles.backgroundSecondary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
  },
  voiceButtonRecording: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  videoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: 8,
  },
  videoPreviewInfo: {
    flex: 1,
  },
  videoPreviewText: {
    fontSize: 14,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: 2,
  },
  videoPreviewDuration: {
    fontSize: 12,
    color: commonStyles.textSecondary,
  },
});
