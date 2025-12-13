import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Switch,
  Platform,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTheme } from '../theme';
import axiosInstance from '../lib/api';
import { getBackendBaseURL } from '../lib/api';
import { CommonActions } from '@react-navigation/native';

export default function SettingsScreen({ navigation }) {
  const { colors, spacing, typography, commonStyles } = useTheme();
  const styles = getStyles(colors, spacing, typography, commonStyles);
  const authStore = useAuthStore();
  const authUser = authStore?.authUser ?? null;
  const logout = authStore?.logout;
  const { theme, toggleTheme, setTheme } = useThemeStore();
  const settingsStore = useSettingsStore();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    fullname: authUser?.fullname || '',
    email: authUser?.email || '',
  });

  // Debug: Log authUser state
  useEffect(() => {
    console.log('SettingsScreen - authUser:', {
      hasAuthUser: !!authUser,
      fullname: authUser?.fullname,
      email: authUser?.email,
      profilePic: authUser?.profilePic,
    });
  }, [authUser]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Update profileData when authUser changes
  useEffect(() => {
    if (authUser) {
      setProfileData({
        fullname: authUser.fullname || '',
        email: authUser.email || '',
      });
    }
  }, [authUser]);

  // Construct full profile picture URL
  const getProfilePicUrl = (profilePic) => {
    if (!profilePic || profilePic === '/avatar.png') return null;
    
    // If already a full URL, return as is
    if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
      return profilePic;
    }
    
    // If relative path, construct full URL
    const baseURL = getBackendBaseURL();
    return `${baseURL}${profilePic.startsWith('/') ? '' : '/'}${profilePic}`;
  };

  const handleLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      
      await logout();
      
      // Force navigation immediately using CommonActions
      setTimeout(() => {
        const currentAuthUser = useAuthStore.getState().authUser;
        
        if (!currentAuthUser && navigation) {
          // Use CommonActions.reset for reliable navigation
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            })
          );
        }
      }, 100);
    } catch (error) {
      Alert.alert('Error', `Failed to logout: ${error.message || 'Unknown error'}`);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profileData.fullname.trim()) {
      Alert.alert('Error', 'Full name is required');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await axiosInstance.put('/auth/update-profile', {
        fullname: profileData.fullname,
      });

      if (response.data?.data || response.data?.user) {
        const updatedUser = response.data.data || response.data.user;
        const { setAuthUser } = useAuthStore.getState();
        if (setAuthUser) {
          setAuthUser(updatedUser);
        }
        Alert.alert('Success', 'Profile updated successfully');
        setIsEditingProfile(false);
      }
    } catch (error) {
      console.error('Update profile error:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to update profile. Please try again.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangeProfilePicture = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera roll permission is required to change profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true, // Request base64 encoding
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        setIsUploadingImage(true);
        
        try {
          // Use base64 from ImagePicker if available, otherwise convert
          let imageData;
          if (result.assets[0].base64) {
            imageData = `data:image/jpeg;base64,${result.assets[0].base64}`;
          } else {
            // Fallback: use the URI directly (backend should handle it)
            imageData = imageUri;
          }

          // Upload to backend
          const response = await axiosInstance.put('/auth/update-profile', {
            profilePic: imageData,
          });

          if (response.data?.data || response.data?.user) {
            const updatedUser = response.data.data || response.data.user;
            const { setAuthUser } = useAuthStore.getState();
            if (setAuthUser) {
              setAuthUser(updatedUser);
            }
            Alert.alert('Success', 'Profile picture updated successfully');
          }
        } catch (error) {
          console.error('Upload profile picture error:', error);
          Alert.alert(
            'Error',
            error.response?.data?.message || 'Failed to upload profile picture. Please try again.'
          );
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      Alert.alert('Error', 'All fields are required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await axiosInstance.put('/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      if (response.data?.success) {
        Alert.alert('Success', 'Password changed successfully', [
          {
            text: 'OK',
            onPress: () => {
              setShowChangePassword(false);
              setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
              });
            },
          },
        ]);
      }
    } catch (error) {
      console.error('Change password error:', error);
      Alert.alert(
        'Error',
        error.response?.data?.message || 'Failed to change password. Please try again.'
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const SettingSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const SettingItem = ({
    icon,
    label,
    value,
    onPress,
    rightComponent,
    showArrow = true,
  }) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <Ionicons name={icon} size={22} color={colors.primary} style={styles.settingIcon} />
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <View style={styles.settingItemRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {rightComponent}
        {showArrow && (
          <Ionicons
            name="chevron-forward"
            size={20}
            color={commonStyles.textSecondary}
            style={styles.chevron}
          />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Settings</Text>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Section */}
        <SettingSection title="Profile">
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={handleChangeProfilePicture} disabled={isUploadingImage}>
              <View style={styles.avatarContainer}>
                {getProfilePicUrl(authUser?.profilePic) ? (
                  <Image
                    source={{ uri: getProfilePicUrl(authUser.profilePic) }}
                    style={styles.avatar}
                    onError={(error) => {
                      console.warn('Failed to load profile picture:', error);
                    }}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarText}>
                      {authUser?.fullname?.charAt(0)?.toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
                <View style={styles.avatarEditBadge}>
                  {isUploadingImage ? (
                    <ActivityIndicator size="small" color={colors.textWhite} />
                  ) : (
                    <Ionicons name="camera" size={16} color={colors.textWhite} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{authUser?.fullname || 'User'}</Text>
              <Text style={styles.profileEmail}>{authUser?.email || ''}</Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditingProfile(!isEditingProfile)}
            >
              <Ionicons
                name={isEditingProfile ? 'close' : 'pencil'}
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {isEditingProfile && (
            <View style={styles.editForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={profileData.fullname}
                  onChangeText={(text) => setProfileData({ ...profileData, fullname: text })}
                  placeholder="Enter your full name"
                  placeholderTextColor={commonStyles.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={profileData.email}
                  editable={false}
                  placeholderTextColor={commonStyles.textSecondary}
                />
                <Text style={styles.inputHint}>Email cannot be changed</Text>
              </View>
              <TouchableOpacity
                style={[styles.saveButton, isUpdating && styles.saveButtonDisabled]}
                onPress={handleUpdateProfile}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color={colors.textWhite} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SettingSection>

        {/* Appearance Section */}
        <SettingSection title="Appearance">
          <SettingItem
            icon="color-palette-outline"
            label="Theme"
            value={theme === 'light' ? 'Light' : 'Dark'}
            onPress={toggleTheme}
            rightComponent={
              <Switch
                value={theme === 'dark'}
                onValueChange={(value) => setTheme(value ? 'dark' : 'light')}
                trackColor={{ false: '#e0e0e0', true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
              />
            }
            showArrow={false}
          />
        </SettingSection>

        {/* Account Section */}
        <SettingSection title="Account">
          <SettingItem
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => setShowChangePassword(true)}
          />
          <SettingItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => setShowNotifications(true)}
          />
          <SettingItem
            icon="shield-checkmark-outline"
            label="Privacy"
            onPress={() => setShowPrivacy(true)}
          />
          <SettingItem
            icon="language-outline"
            label="Language"
            value={settingsStore.language === 'en' ? 'English' : settingsStore.language === 'km' ? 'ភាសាខ្មែរ' : 'English'}
            onPress={() => setShowLanguage(true)}
          />
        </SettingSection>

        {/* Support Section */}
        <SettingSection title="Support">
          <SettingItem
            icon="help-circle-outline"
            label="Help & Support"
            onPress={() => {
              Alert.alert(
                'Help & Support',
                'For assistance, please contact:\n\nEmail: support@example.com\n\nWe\'re here to help!',
                [{ text: 'OK' }]
              );
            }}
          />
          <SettingItem
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => {
              Alert.alert(
                'Terms of Service',
                'By using this app, you agree to our Terms of Service. Please use the app responsibly and respect other users.\n\nLast updated: 2024',
                [{ text: 'OK' }]
              );
            }}
          />
          <SettingItem
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => {
              Alert.alert(
                'Privacy Policy',
                'We respect your privacy. Your data is encrypted and stored securely. We do not share your information with third parties.\n\nLast updated: 2024',
                [{ text: 'OK' }]
              );
            }}
          />
          <SettingItem
            icon="information-circle-outline"
            label="About"
            value="Version 1.0.0"
            onPress={() => {
              Alert.alert(
                'About',
                'Chat App v1.0.0\n\nBuilt with React Native & Expo\n\n© 2024 All rights reserved',
                [{ text: 'OK' }]
              );
            }}
          />
        </SettingSection>

        {/* Danger Zone */}
        <SettingSection title="Danger Zone">
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => setShowLogoutConfirm(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={22} color="#ef4444" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </SettingSection>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={showChangePassword}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowChangePassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowChangePassword(false);
                  setPasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '',
                  });
                }}
              >
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Password</Text>
                <TextInput
                  style={styles.input}
                  value={passwordData.currentPassword}
                  onChangeText={(text) => setPasswordData({ ...passwordData, currentPassword: text })}
                  placeholder="Enter current password"
                  placeholderTextColor={commonStyles.textSecondary}
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={styles.input}
                  value={passwordData.newPassword}
                  onChangeText={(text) => setPasswordData({ ...passwordData, newPassword: text })}
                  placeholder="Enter new password"
                  placeholderTextColor={commonStyles.textSecondary}
                  secureTextEntry
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm New Password</Text>
                <TextInput
                  style={styles.input}
                  value={passwordData.confirmPassword}
                  onChangeText={(text) => setPasswordData({ ...passwordData, confirmPassword: text })}
                  placeholder="Confirm new password"
                  placeholderTextColor={commonStyles.textSecondary}
                  secureTextEntry
                />
              </View>
              <TouchableOpacity
                style={[styles.saveButton, isChangingPassword && styles.saveButtonDisabled]}
                onPress={handleChangePassword}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? (
                  <ActivityIndicator color={colors.textWhite} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Change Password</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Notifications Settings Modal */}
      <Modal
        visible={showNotifications}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <SettingItem
                icon="chatbubbles-outline"
                label="Message Notifications"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.notifications.messages}
                    onValueChange={(value) => settingsStore.updateNotifications('messages', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
              <SettingItem
                icon="call-outline"
                label="Call Notifications"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.notifications.calls}
                    onValueChange={(value) => settingsStore.updateNotifications('calls', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
              <SettingItem
                icon="people-outline"
                label="Group Notifications"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.notifications.groups}
                    onValueChange={(value) => settingsStore.updateNotifications('groups', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
              <SettingItem
                icon="location-outline"
                label="Location Updates"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.notifications.location}
                    onValueChange={(value) => settingsStore.updateNotifications('location', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy Settings Modal */}
      <Modal
        visible={showPrivacy}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPrivacy(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Privacy</Text>
              <TouchableOpacity onPress={() => setShowPrivacy(false)}>
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Profile Visibility</Text>
                {['public', 'friends', 'private'].map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.radioOption,
                      settingsStore.privacy.profileVisibility === option && styles.radioOptionActive,
                    ]}
                    onPress={() => settingsStore.updatePrivacy('profileVisibility', option)}
                  >
                    <Ionicons
                      name={settingsStore.privacy.profileVisibility === option ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={settingsStore.privacy.profileVisibility === option ? colors.primary : commonStyles.textSecondary}
                    />
                    <Text
                      style={[
                        styles.radioOptionText,
                        settingsStore.privacy.profileVisibility === option && styles.radioOptionTextActive,
                      ]}
                    >
                      {option === 'public' ? 'Public' : option === 'friends' ? 'Friends Only' : 'Private'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <SettingItem
                icon="checkmark-done-outline"
                label="Read Receipts"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.privacy.readReceipts}
                    onValueChange={(value) => settingsStore.updatePrivacy('readReceipts', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
              <SettingItem
                icon="time-outline"
                label="Last Seen"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.privacy.lastSeen}
                    onValueChange={(value) => settingsStore.updatePrivacy('lastSeen', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
              <SettingItem
                icon="radio-outline"
                label="Online Status"
                onPress={() => {}}
                rightComponent={
                  <Switch
                    value={settingsStore.privacy.onlineStatus}
                    onValueChange={(value) => settingsStore.updatePrivacy('onlineStatus', value)}
                    trackColor={{ false: '#e0e0e0', true: colors.primary }}
                    thumbColor={Platform.OS === 'android' ? colors.textWhite : undefined}
                  />
                }
                showArrow={false}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguage}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLanguage(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Language</Text>
              <TouchableOpacity onPress={() => setShowLanguage(false)}>
                <Ionicons name="close" size={24} color={commonStyles.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { code: 'en', name: 'English', nativeName: 'English' },
                { code: 'km', name: 'Khmer', nativeName: 'ភាសាខ្មែរ' },
              ].map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.radioOption,
                    settingsStore.language === lang.code && styles.radioOptionActive,
                  ]}
                  onPress={() => {
                    settingsStore.setLanguage(lang.code);
                    setShowLanguage(false);
                    Alert.alert('Success', `Language changed to ${lang.name}`);
                  }}
                >
                  <Ionicons
                    name={settingsStore.language === lang.code ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={settingsStore.language === lang.code ? colors.primary : commonStyles.textSecondary}
                  />
                  <View style={styles.languageOption}>
                    <Text
                      style={[
                        styles.radioOptionText,
                        settingsStore.language === lang.code && styles.radioOptionTextActive,
                      ]}
                    >
                      {lang.name}
                    </Text>
                    <Text
                      style={[
                        styles.radioOptionSubtext,
                        settingsStore.language === lang.code && styles.radioOptionSubtextActive,
                      ]}
                    >
                      {lang.nativeName}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Logout</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to logout?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowLogoutConfirm(false)}
              >
                <Text style={styles.modalButtonCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleLogout}
              >
                <Text style={styles.modalButtonConfirmText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const getStyles = (colors, spacing, typography, commonStyles) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: commonStyles.backgroundPrimary,
  },
  header: {
    ...commonStyles.header,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: spacing.md,
  },
  headerText: {
    ...commonStyles.headerText,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: commonStyles.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionContent: {
    backgroundColor: commonStyles.backgroundSecondary,
    borderRadius: commonStyles.borderRadiusLarge,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: commonStyles.borderColorLight,
    marginBottom: spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: commonStyles.borderColorLight,
    minHeight: 56,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: spacing.md,
    width: 24,
    textAlign: 'center',
  },
  settingLabel: {
    fontSize: typography.base,
    color: commonStyles.textPrimary,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: typography.base,
    color: commonStyles.textSecondary,
    marginRight: spacing.sm,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.textWhite,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: commonStyles.backgroundPrimary,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    marginBottom: spacing.xs / 2,
  },
  profileEmail: {
    fontSize: typography.small,
    color: commonStyles.textSecondary,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: commonStyles.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  editForm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingTop: spacing.sm,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: typography.small,
    fontWeight: '600',
    color: commonStyles.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: commonStyles.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.base,
    color: commonStyles.textPrimary,
    borderWidth: 1,
    borderColor: commonStyles.borderColor,
    minHeight: 48,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  inputHint: {
    fontSize: typography.small,
    color: commonStyles.textSecondary,
    marginTop: spacing.xs / 2,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: commonStyles.borderRadius,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.textWhite,
    fontSize: typography.base,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: commonStyles.borderRadius,
  },
  logoutButtonText: {
    fontSize: typography.base,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: spacing.sm,
  },
  bottomSpacing: {
    height: spacing.xxl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: commonStyles.backgroundPrimary,
    borderRadius: commonStyles.borderRadiusLarge,
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: commonStyles.borderRadius,
    marginBottom: spacing.xs,
  },
  radioOptionActive: {
    backgroundColor: colors.primary + '10',
  },
  radioOptionText: {
    fontSize: typography.base,
    color: commonStyles.textPrimary,
    marginLeft: spacing.md,
    fontWeight: '500',
  },
  radioOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  radioOptionSubtext: {
    fontSize: typography.small,
    color: commonStyles.textSecondary,
    marginLeft: spacing.md,
  },
  radioOptionSubtextActive: {
    color: colors.primary + 'CC',
  },
  languageOption: {
    marginLeft: spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: commonStyles.textPrimary,
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: typography.base,
    color: commonStyles.textSecondary,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  modalButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: commonStyles.borderRadius,
  },
  modalButtonCancel: {
    backgroundColor: commonStyles.backgroundSecondary,
  },
  modalButtonCancelText: {
    color: commonStyles.textPrimary,
    fontWeight: '600',
  },
  modalButtonConfirm: {
    backgroundColor: '#ef4444',
  },
  modalButtonConfirmText: {
    color: colors.textWhite,
    fontWeight: '600',
  },
});

