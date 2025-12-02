import { useEffect, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { FaUsers, FaSearch, FaUserPlus, FaTimes, FaCheck, FaTh, FaClock, FaUserCheck } from "react-icons/fa";
import ProfileImage from "../component/ProfileImage";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import SidebarSkeleton from "../component/skeletons/SideBarSkeleton";
import Tooltip from "../component/Tooltip";

const ContactsPage = () => {
  const { 
    getContacts, 
    contacts, 
    isContactsLoading,
    getPendingRequests,
    pendingRequests,
    isRequestsLoading,
    sendContactRequest,
    acceptContactRequest,
    rejectContactRequest,
    getUsers,
    users,
    setSelectedUser, 
    selectedUser,
    subscribeToContactRequests,
    unsubscribeFromContactRequests,
  } = useChatStore();
  const { onlineUsers } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [activeTab, setActiveTab] = useState("contacts"); // "contacts" or "requests"

  useEffect(() => {
    getContacts();
    getPendingRequests();
    getUsers(); // Still need all users for search/add contact
    subscribeToContactRequests(); // Subscribe to real-time contact request updates
    
    return () => {
      unsubscribeFromContactRequests(); // Cleanup on unmount
    };
  }, [getContacts, getPendingRequests, getUsers, subscribeToContactRequests, unsubscribeFromContactRequests]);

  // Filter contacts based on search query
  const filteredContacts = contacts.filter((user) => {
    const matchesSearch = user.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Filter pending requests based on search query
  const filteredRequests = pendingRequests.filter((request) => {
    const sender = request.senderId;
    const matchesSearch = sender.fullname.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         sender.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Get status text for user
  const getStatusText = (user) => {
    if (onlineUsers.includes(user._id)) {
      return "online";
    }
    // For now, show "last seen just now" for offline users
    // In a real app, you'd track last seen timestamps
    return "last seen just now";
  };

  const handleContactSelect = (user) => {
    setSelectedUser(user);
    // No need to navigate - ChatPage will show the chat on the right side
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContactEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    try {
      await sendContactRequest(newContactEmail);
      setNewContactEmail("");
      setShowAddContact(false);
    } catch (error) {
      // Error already handled in store
    }
  };

  if (isContactsLoading || isRequestsLoading) {
    return <SidebarSkeleton />;
  }

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-base-100">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-4 py-3">
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-3">
            <button className="p-2 hover:bg-base-200/50 rounded-lg transition-colors">
              <FaTh className="size-5 text-base-content/70" />
            </button>
            <h1 className="text-lg font-semibold text-base-content">Contacts</h1>
            <Tooltip text="Add Contact" position="bottom">
              <button
                onClick={() => setShowAddContact(true)}
                className="p-2 hover:bg-base-200/50 rounded-lg transition-colors"
              >
                <FaUserPlus className="size-5 text-base-content/70" />
              </button>
            </Tooltip>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab("contacts")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "contacts"
                  ? "bg-primary text-primary-content"
                  : "bg-base-200 text-base-content/70 hover:bg-base-300"
              }`}
            >
              Contacts ({contacts.length})
            </button>
            <button
              onClick={() => setActiveTab("requests")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all relative ${
                activeTab === "requests"
                  ? "bg-primary text-primary-content"
                  : "bg-base-200 text-base-content/70 hover:bg-base-300"
              }`}
            >
              Requests
              {pendingRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
            <input
              type="text"
              placeholder="Search (⌘K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-base-100 rounded-lg text-sm border-2 border-base-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200 placeholder:text-base-content/40"
            />
          </div>
        </div>

        {/* Contacts/Requests List - Scrollable */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {activeTab === "contacts" ? (
            // Contacts Tab
            filteredContacts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                  <FaUsers className="size-8 text-base-content/30" />
                </div>
                <p className="text-base-content/60 font-medium">
                  {searchQuery ? "No contacts found" : "No contacts yet"}
                </p>
                <p className="text-sm text-base-content/40 mt-1">
                  {searchQuery 
                    ? "Try adjusting your search" 
                    : "Add contacts to get started"}
                </p>
              </div>
            ) : (
              filteredContacts.map((user) => {
                const isSelected = selectedUser?._id === user._id;
                return (
                  <button
                    key={user._id}
                    onClick={() => handleContactSelect(user)}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-all duration-200 ${
                      isSelected 
                        ? 'bg-primary/10 border-l-4 border-primary' 
                        : 'hover:bg-base-200/50 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <ProfileImage
                        src={user.profilePic}
                        alt={user.fullname}
                        className="size-12 rounded-full object-cover"
                      />
                      {onlineUsers.includes(user._id) && (
                        <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-base-content truncate">{user.fullname}</div>
                      <div className="text-sm text-base-content/50 truncate capitalize">
                        {getStatusText(user)}
                      </div>
                    </div>
                  </button>
                );
              })
            )
          ) : (
            // Requests Tab
            filteredRequests.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                  <FaClock className="size-8 text-base-content/30" />
                </div>
                <p className="text-base-content/60 font-medium">
                  {searchQuery ? "No requests found" : "No pending requests"}
                </p>
                <p className="text-sm text-base-content/40 mt-1">
                  {searchQuery 
                    ? "Try adjusting your search" 
                    : "You have no pending contact requests"}
                </p>
              </div>
            ) : (
              filteredRequests.map((request) => {
                const sender = request.senderId;
                return (
                  <div
                    key={request._id}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-base-200/50 transition-all duration-200 border-l-4 border-transparent"
                  >
                    <div className="relative flex-shrink-0">
                      <ProfileImage
                        src={sender.profilePic}
                        alt={sender.fullname}
                        className="size-12 rounded-full object-cover"
                      />
                      {onlineUsers.includes(sender._id) && (
                        <span className="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full ring-2 ring-base-100" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-base-content truncate">{sender.fullname}</div>
                      <div className="text-sm text-base-content/50 truncate">{sender.email}</div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Tooltip text="Accept Request" position="left">
                        <button
                          onClick={() => acceptContactRequest(request._id)}
                          className="p-2 bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                        >
                          <FaCheck className="size-4 text-primary" />
                        </button>
                      </Tooltip>
                      <Tooltip text="Reject Request" position="left">
                        <button
                          onClick={() => rejectContactRequest(request._id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                        >
                          <FaTimes className="size-4 text-red-500" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Add New Contact</h2>
              <button
                onClick={() => {
                  setShowAddContact(false);
                  setNewContactEmail("");
                }}
                className="btn btn-ghost btn-sm btn-circle"
              >
                <FaTimes className="size-4" />
              </button>
            </div>
            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="label">
                  <span className="label-text">Email Address</span>
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-base-100 border-2 border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-200"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddContact(false);
                    setNewContactEmail("");
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary gap-2">
                  <FaCheck className="size-4" />
                  Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ContactsPage;

