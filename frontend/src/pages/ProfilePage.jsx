import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Camera, Mail, User } from "lucide-react"; // Removed toast import

const ProfilePage = () => {
  const { authUser, isUpdatingProfile, updateProfile } = useAuthStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [newFullName, setNewFullName] = useState(authUser?.fullname || "");
  const [isUploading, setIsUploading] = useState(false); // State to track the upload status

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true); // Start the upload process

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
      const base64Image = reader.result;
      setSelectedImg(base64Image);
      
      try {
        await updateProfile({ profilePic: base64Image });
        // Removed toast.success("Profile picture updated successfully!"); // Success message
      } catch (error) {
        // Removed toast.error("Error updating profile picture!"); // Error message
      } finally {
        setIsUploading(false); // End the upload process
      }
    };
  };

  const handleNameChange = async () => {
    if (newFullName !== authUser.fullname) {
      await updateProfile({ fullname: newFullName });
      // Removed toast.success("Profile updated successfully!"); // Success message
    }
  };

  return (
    <div className="pt-20">
      <div className="max-w-2xl mx-auto p-4 py-8 ">
        <div className=" rounded-xl space-y-8 ">
          <div className="text-center">
            <h1 className="text-2xl font-semibold ">Profile</h1>
            <p className="mt-2">Your profile information</p>
          </div>

          {/* Avatar upload section */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={selectedImg || authUser.profilePic || "/avatar.png"}
                alt="Profile"
                className={`size-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700 ${
                  isUploading ? "opacity-50 animate-pulse" : ""
                }`}
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
                  <div className="animate-spin rounded-full border-4 border-t-4 border-base-200 w-8 h-8"></div>
                </div>
              )}
              <label
                htmlFor="avatar-upload"
                className={`
                  absolute bottom-0 right-0 
                  bg-base-content hover:scale-105
                  p-2 rounded-full cursor-pointer 
                  transition-all duration-200
                  ${isUploading ? "pointer-events-none" : ""}
                `}
              >
                <Camera className="w-5 h-5 text-base-200" />
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
            <p className="text-sm text-zinc-400">
              {isUploading ? "Uploading..." : "Click the camera icon to update your photo"}
            </p>
          </div>

          <div className="space-y-6 p-6 bg-base-300 rounded-4xl">
            <div className="space-y-1.5">
              <div className="text-sm text-zinc-400 flex items-center gap-2">
                <User className="w-4 h-4" />
                Full Name
              </div>
              <div className="px-4 py-2.5 bg-base-200 rounded-lg border flex items-center gap-2  border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-transparent outline-none focus:outline-none border-none"
                  disabled={isUploading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-sm text-zinc-400 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Address
              </div>
              <p className="px-4 py-2.5 bg-base-100 rounded-lg border border-gray-200 dark:border-gray-700">{authUser?.email}</p>
            </div>
          </div>

          <div className="mt-6 bg-base-300 rounded-4xl p-6">
            <h2 className="text-lg font-medium  mb-4">Account Information</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                <span>Member Since</span>
                <span>{authUser.createdAt?.split("T")[0]}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span>Account Status</span>
                <span className="text-green-500">Active</span>
              </div>
            </div>
            <button
              onClick={handleNameChange}
              className="btn-primary btn py-1 px-3 rounded-md w-full my-2 cursor-pointer"
              disabled={isUploading || newFullName === authUser?.fullname}
            >
              {isUploading ? "Saving..." : "Save"}
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
