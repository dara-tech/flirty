import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { Users, X, Menu, Search } from "lucide-react";
import SidebarSkeleton from "./skeletons/SideBarSkeleton";

const Sidebar = () => {
  const { getUsers, users, selectedUser, setSelectedUser, isUsersLoading } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getUsers();
  }, [getUsers]);

  // Filter users based on online status and search query
  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.fullname.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOnline = !showOnlineOnly || onlineUsers.includes(user._id);
    return matchesSearch && matchesOnline;
  });

  // Handle user selection and close mobile sidebar
  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setIsMobileOpen(false);
  };

  if (isUsersLoading) return <SidebarSkeleton />;

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 p-2 bg-base-200 rounded-lg z-50"
      >
        <Menu className="size-6" />
      </button>

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-0 lg:relative
        h-full w-full lg:w-80
        bg-base-100 lg:bg-transparent
        transform transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        border-r border-base-300 flex flex-col
        z-50
      `}>
        {/* Header */}
        <div className="border-b border-base-300 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-base-200 rounded-lg">
                <Users className="size-5 text-primary" />
              </div>
              <span className="font-semibold text-lg">Contacts</span>
            </div>
            
            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-2 hover:bg-base-200 rounded-lg"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-base-200 rounded-lg text-sm focus:outline-none focus:ring-2 ring-primary/20"
            />
          </div>

          {/* Filter Options */}
          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlineOnly}
                onChange={(e) => setShowOnlineOnly(e.target.checked)}
                className="checkbox checkbox-primary checkbox-sm"
              />
              <span className="text-sm">Show online only</span>
            </label>
            <span className="text-xs text-zinc-500">
              {onlineUsers.length - 1} online
            </span>
          </div>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-2">
            {filteredUsers.map((user) => (
              <button
                key={user._id}
                onClick={() => handleUserSelect(user)}
                className={`
                  w-full p-3 rounded-lg flex items-center gap-4
                  hover:bg-base-200 active:bg-base-300
                  transition-all duration-200 ease-in-out
                  ${selectedUser?._id === user._id ? "bg-base-200 ring-1 ring-primary/20" : ""}
                `}
              >
                <div className="relative">
                  <img
                    src={user.profilePic || "/avatar.png"}
                    alt={user.name}
                    className="size-12 object-cover rounded-full"
                  />
                  {onlineUsers.includes(user._id) && (
                    <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{user.fullname}</div>
                  <div className="text-sm text-zinc-400">
                    {onlineUsers.includes(user._id) ? "Online" : "Offline"}
                  </div>
                </div>
              </button>
            ))}
            
            {filteredUsers.length === 0 && (
              <div className="text-center text-zinc-500 py-8">
                No contacts found
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
};

export default Sidebar;