import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { Camera, Mail, User, Calendar, Shield, Edit2 } from "lucide-react";

const ProfilePage = () => {
  const { authUser, isUpdatingProfile, updateProfile } = useAuthStore();
  const [selectedImg, setSelectedImg] = useState(null);
  const [newFullName, setNewFullName] = useState(authUser?.fullname || "");
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

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

  const handleNameChange = async () => {
    if (newFullName !== authUser.fullname) {
      await updateProfile({ fullname: newFullName });
      setIsEditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-200 to-base-300 pt-20">
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h2 className="card-title text-3xl font-bold justify-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Profile Settings
            </h2>
            <p className="text-base-content/60">Manage your account preferences</p>

            {/* Profile Picture Section */}
            <div className="flex flex-col items-center gap-4 my-8">
              <div className="relative group">
                <div className="size-36 rounded-full p-1 bg-gradient-to-r from-primary to-secondary">
                  <img
                    src={selectedImg || authUser.profilePic || "/avatar.png"}
                    alt="Profile"
                    className={`size-full rounded-full object-cover bg-base-200 
                      ${isUploading ? "opacity-50 animate-pulse" : ""}`}
                  />
                </div>
                {isUploading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="loading loading-spinner loading-md text-primary"></span>
                  </div>
                ) : (
                  <label
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 size-10 bg-secondary hover:bg-secondary-focus
                      rounded-full cursor-pointer transition-all duration-200 flex items-center 
                      justify-center group-hover:scale-110"
                  >
                    <Camera className="size-5 text-secondary-content" />
                    <input
                      type="file"
                      id="avatar-upload"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                    />
                  </label>
                )}
              </div>
              <div className="text-sm text-base-content/60">
                {isUploading ? (
                  <span className="animate-pulse">Uploading your photo...</span>
                ) : (
                  "Click the camera icon to update your profile picture"
                )}
              </div>
            </div>

            {/* User Details Section */}
            <div className="card bg-base-200 shadow-inner">
              <div className="card-body card-sm gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-base-content/70">
                      <User className="size-4" />
                      <span>Full Name</span>
                    </div>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className="btn btn-ghost btn-sm"
                    >
                      <Edit2 className="size-4" />
                    </button>
                  </div>
                  {isEditing ? (
                    <div className="join w-full">
                      <input
                        type="text"
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        className="input input-bordered join-item w-full"
                        placeholder="Enter your full name"
                      />
                      <button
                        onClick={handleNameChange}
                        className="btn btn-primary join-item"
                        disabled={isUploading || newFullName === authUser?.fullname}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <p className="text-lg font-medium">{newFullName}</p>
                  )}
                </div>

                <div className="divider"></div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-base-content/70">
                    <Mail className="size-4" />
                    <span>Email Address</span>
                  </div>
                  <p className="text-lg font-medium">{authUser?.email}</p>
                </div>
              </div>
            </div>

            {/* Account Details */}
            <div className="card bg-base-200 shadow-inner mt-6">
              <div className="card-body">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Shield className="size-5 text-primary" />
                  Account Details
                </h2>
                <div className="space-y-4">
                  <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
                    <div className="stat">
                      <div className="stat-figure text-primary">
                        <Calendar className="size-4" />
                      </div>
                      <div className="stat-title">Member Since</div>
                      <div className="stat-value text-lg">
                        {new Date(authUser.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <div className="stat">
                      <div className="stat-figure text-success">
                        <Shield className="size-4" />
                      </div>
                      <div className="stat-title">Account Status</div>
                      <div className="stat-value text-lg">
                        <span className="badge badge-success gap-1">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;