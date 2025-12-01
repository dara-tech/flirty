import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useNavigate } from "react-router-dom";
import { FaCamera, FaEye, FaEyeSlash, FaPalette, FaSignOutAlt, FaUser, FaEdit } from "react-icons/fa";

const SettingsPage = () => {
  const { authUser, updateProfile, changePassword, isChangingPassword, logout, isUpdatingProfile } = useAuthStore();
  const navigate = useNavigate();
  const [selectedImg, setSelectedImg] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Name change form state
  const [showChangeName, setShowChangeName] = useState(false);
  const [nameData, setNameData] = useState({
    fullname: "",
  });
  
  // Password change form state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      try {
        await updateProfile({ profilePic: base64Image });
      } catch (error) {
        console.error(error);
      } finally {
        setIsUploading(false);
      }
    };
  };

  const handleNameChange = async (e) => {
    e.preventDefault();
    
    if (!nameData.fullname || nameData.fullname.trim().length === 0) {
      return;
    }

    if (nameData.fullname.trim().length < 2) {
      return;
    }

    try {
      await updateProfile({ fullname: nameData.fullname.trim() });
      setNameData({ fullname: "" });
      setShowChangeName(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      return;
    }

    if (passwordData.newPassword.length < 6) {
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      return;
    }

    const success = await changePassword({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });

    if (success) {
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowChangePassword(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-base-100">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          <div className="w-9"></div>
          <h1 className="text-base sm:text-lg font-semibold text-base-content">Settings</h1>
          <div className="w-9"></div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Profile Section */}
        <div className="px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="relative flex-shrink-0">
              <img
                src={selectedImg || authUser?.profilePic || "/avatar.png"}
                alt="Profile"
                className="size-20 sm:size-24 rounded-full object-cover"
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <span className="loading loading-spinner loading-sm text-white"></span>
                </div>
              )}
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 size-7 sm:size-8 bg-primary rounded-full cursor-pointer flex items-center justify-center border-2 border-base-100"
              >
                <FaCamera className="size-3 sm:size-4 text-white" />
                <input
                  type="file"
                  id="avatar-upload"
                  className="hidden"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
            <div className="text-center">
              <div className="font-semibold text-base sm:text-lg text-base-content truncate max-w-full px-2">{authUser?.fullname || "User"}</div>
              <div className="text-xs sm:text-sm text-base-content/60 truncate max-w-full px-2">{authUser?.email}</div>
            </div>
          </div>
        </div>

        {/* Change Name Section */}
        <div className="px-3 sm:px-4 py-4 sm:py-6 border-t border-base-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-base-content">Change Name</h2>
            <button
              onClick={() => {
                setShowChangeName(!showChangeName);
                if (!showChangeName) {
                  setNameData({ fullname: authUser?.fullname || "" });
                } else {
                  setNameData({ fullname: "" });
                }
              }}
              className="btn btn-sm btn-outline w-full sm:w-auto flex items-center gap-2"
            >
              <FaEdit className="size-3" />
              {showChangeName ? "Cancel" : "Edit"}
            </button>
          </div>

          {showChangeName ? (
            <form onSubmit={handleNameChange} className="space-y-3 sm:space-y-4">
              <div className="form-control">
                <label className="label py-1 sm:py-2">
                  <span className="label-text text-sm sm:text-base text-base-content">Full Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter your full name"
                  className="w-full px-4 py-3 text-sm sm:text-base bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                  value={nameData.fullname}
                  onChange={(e) =>
                    setNameData({ fullname: e.target.value })
                  }
                  required
                  minLength={2}
                  maxLength={50}
                  autoFocus
                />
                {nameData.fullname && nameData.fullname.trim().length < 2 && (
                  <label className="label py-1">
                    <span className="label-text-alt text-error text-xs sm:text-sm">Name must be at least 2 characters</span>
                  </label>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full flex items-center justify-center gap-2"
                disabled={
                  isUpdatingProfile ||
                  !nameData.fullname ||
                  nameData.fullname.trim().length < 2 ||
                  nameData.fullname.trim() === authUser?.fullname?.trim()
                }
              >
                {isUpdatingProfile ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  <>
                    <FaUser className="size-4" />
                    Save Name
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-3 p-3 sm:p-4 rounded-lg bg-base-200/50">
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FaUser className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs sm:text-sm text-base-content/60">Current Name</p>
                <p className="text-sm sm:text-base font-semibold text-base-content">{authUser?.fullname || "Not set"}</p>
              </div>
            </div>
          )}
        </div>

        {/* Change Password Section */}
        <div className="px-3 sm:px-4 py-4 sm:py-6 border-t border-base-200/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-base-content">Change Password</h2>
            <button
              onClick={() => setShowChangePassword(!showChangePassword)}
              className="btn btn-sm btn-outline w-full sm:w-auto"
            >
              {showChangePassword ? "Cancel" : "Change"}
            </button>
          </div>

          {showChangePassword && (
            <form onSubmit={handlePasswordChange} className="space-y-3 sm:space-y-4">
              <div className="form-control">
                <label className="label py-1 sm:py-2">
                  <span className="label-text text-sm sm:text-base text-base-content">Current Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    placeholder="Enter current password"
                    className="w-full px-4 py-3 pr-10 text-sm sm:text-base bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPassword: e.target.value })
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content text-sm sm:text-base"
                  >
                    {showPasswords.current ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="form-control">
                <label className="label py-1 sm:py-2">
                  <span className="label-text text-sm sm:text-base text-base-content">New Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    placeholder="Enter new password (min 6)"
                    className="w-full px-4 py-3 pr-10 text-sm sm:text-base bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, newPassword: e.target.value })
                    }
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content text-sm sm:text-base"
                  >
                    {showPasswords.new ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="form-control">
                <label className="label py-1 sm:py-2">
                  <span className="label-text text-sm sm:text-base text-base-content">Confirm New Password</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    placeholder="Confirm new password"
                    className="w-full px-4 py-3 pr-10 text-sm sm:text-base bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content text-sm sm:text-base"
                  >
                    {showPasswords.confirm ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {passwordData.newPassword &&
                  passwordData.confirmPassword &&
                  passwordData.newPassword !== passwordData.confirmPassword && (
                    <label className="label py-1">
                      <span className="label-text-alt text-error text-xs sm:text-sm">Passwords do not match</span>
                    </label>
                  )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                disabled={
                  isChangingPassword ||
                  !passwordData.currentPassword ||
                  !passwordData.newPassword ||
                  !passwordData.confirmPassword ||
                  passwordData.newPassword.length < 6 ||
                  passwordData.newPassword !== passwordData.confirmPassword
                }
              >
                {isChangingPassword ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  "Change Password"
                )}
              </button>
            </form>
          )}
        </div>

        {/* Theme Section */}
        <div className="px-3 sm:px-4 py-4 sm:py-6 border-t border-base-200/50">
          <button
            onClick={() => {
              // On desktop, keep settings view and add theme=true
              // On mobile, switch to theme view
              const isDesktop = window.innerWidth >= 1024;
              if (isDesktop) {
                navigate("/?view=settings&theme=true");
              } else {
                navigate("/?view=theme");
              }
            }}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-base-200 hover:bg-base-300 transition-all duration-200 group"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <FaPalette className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <h2 className="text-base sm:text-lg font-semibold text-base-content">Theme</h2>
                <p className="text-xs sm:text-sm text-base-content/60">Customize your app appearance</p>
              </div>
            </div>
            <div className="text-base-content/40 group-hover:text-base-content/60 transition-colors">
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
        </div>

      {/* Logout Section - Fixed at Bottom */}
      <div className="flex-shrink-0 border-t border-base-200/50 bg-base-100 px-3 sm:px-4 py-4 sm:py-6">
          <button
            onClick={logout}
          className="btn w-full flex items-center justify-center gap-2 rounded-full"
          style={{ backgroundColor: '#e68b7d', border: 'none', color: 'white' }}
        >
          <FaSignOutAlt className="size-4" />
          Logout
          </button>
      </div>
    </div>
  );
};
export default SettingsPage;