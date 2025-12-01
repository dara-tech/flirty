import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useNotificationStore } from "../store/useNotificationStore";
import { useChatStore } from "../store/useChatStore";
import { FaComment, FaCog, FaUser, FaBell, FaTimes, FaComments } from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
import DesktopBottomToolbar from "./DesktopBottomToolbar";

const NotificationIcon = ({ count }) => (
  <div className="relative">
    <FaBell className="w-4 h-4" />
    {count > 0 && (
      <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
        {count > 99 ? '99+' : count}
      </span>
    )}
  </div>
);

const Navbar = () => {
  const { logout, authUser } = useAuthStore();
  const location = useLocation();
  const { 
    notifications, 
    unreadCount, 
    removeNotification, 
    clearNotifications, 
    markAsRead, 
    markAllAsRead 
  } = useNotificationStore();
  const { unreadMessages, pendingRequests, selectedUser, selectedGroup } = useChatStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);
  
  // Calculate total unread messages count
  const totalUnreadMessages = Object.values(unreadMessages).reduce((sum, count) => sum + (count || 0), 0);
  
  // Calculate pending contact requests count
  const pendingRequestsCount = pendingRequests?.length || 0;
  
  // Check if user is in an active chat (mobile only - to hide bottom nav)
  const isInActiveChat = !!(selectedUser || selectedGroup);
  
  // Calculate total notifications (unread notifications + pending contact requests)
  const totalNotifications = unreadCount + pendingRequestsCount;

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark notifications as read when opening dropdown
  useEffect(() => {
    if (showNotifications && unreadCount > 0) {
      markAllAsRead();
    }
  }, [showNotifications, unreadCount, markAllAsRead]);

  // Listen for socket events
  useEffect(() => {
    const handleNewMessage = (message) => {
      useNotificationStore.getState().addNotification({
        type: 'message_sent',
        message: `Message sent to ${message.receiver?.username || 'user'}`,
        data: message
      });
    };

    const handleMessageSeen = ({ messageId }) => {
      useNotificationStore.getState().addNotification({
        type: 'message_seen',
        message: 'Your message was seen',
        data: { messageId }
      });
    };

    const handleIncomingMessage = (message) => {
      useNotificationStore.getState().addNotification({
        type: 'message_received',
        message: `New message from ${message.sender?.username || 'someone'}`,
        data: message
      });
    };

    if (window.socket) {
      window.socket.on('newMessage', handleNewMessage);
      window.socket.on('messageSeenUpdate', handleMessageSeen);
      window.socket.on('messageReceived', handleIncomingMessage);
    }

    return () => {
      if (window.socket) {
        window.socket.off('newMessage', handleNewMessage);
        window.socket.off('messageSeenUpdate', handleMessageSeen);
        window.socket.off('messageReceived', handleIncomingMessage);
      }
    };
  }, []);

  if (!authUser) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-base-100/95 backdrop-blur-md border-b border-base-200/50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <Link 
              to="/" 
              className="flex items-center gap-3 group transition-all duration-200 hover:opacity-80"
            >
              <div className="size-10 rounded-xl bg-primary flex items-center justify-center">
                <FaComment className="size-5 text-white" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-base-content leading-tight">Flirty</h1>
                <span className="text-[10px] text-base-content/50 font-medium uppercase tracking-wider">Messenger</span>
              </div>
            </Link>
            <Link 
              to="/login" 
              className="btn btn-primary btn-sm normal-case px-4 font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  const isActive = (path) => location.pathname === path;

  // Desktop Top Navbar (lg and above)
  const DesktopNavbar = () => (
    <nav className="hidden lg:flex fixed top-0 left-0 right-0 z-50 h-16 bg-base-100/95 backdrop-blur-md border-b border-base-200/50">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 h-full w-full">
        <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-3 group transition-all duration-200 hover:opacity-80"
          >
              <div className="size-10 rounded-xl bg-primary flex items-center justify-center">
                <FaComments className="size-5 text-white" />
              </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-base-content leading-tight">Flirty</h1>
              <span className="text-[10px] text-base-content/50 font-medium uppercase tracking-wider">Messenger</span>
            </div>
          </Link>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="dropdown dropdown-end">
              <button
                tabIndex={0}
                role="button"
                className="relative btn btn-ghost btn-sm btn-circle hover:bg-base-200 transition-colors"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <FaBell className="size-5 text-base-content/70" />
                {totalNotifications > 0 && (
                  <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {totalNotifications > 99 ? '99+' : totalNotifications}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  ref={notificationRef}
                  tabIndex={0}
                  className="dropdown-content z-[100] mt-3 w-80 bg-base-100 rounded-xl shadow-2xl border border-base-200/50 overflow-hidden"
                >
                  <div className="p-4 border-b border-base-200 bg-base-200/30">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-base text-base-content">Notifications</h3>
                      {notifications.length > 0 && (
                        <button
                          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                          onClick={clearNotifications}
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto hide-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-4">
                        <div className="size-12 rounded-full bg-base-200 flex items-center justify-center mb-3">
                          <FaBell className="size-6 text-base-content/30" />
                        </div>
                        <p className="text-sm font-medium text-base-content/60">No notifications</p>
                        <p className="text-xs text-base-content/40 mt-1">You're all caught up!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-base-200">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            className="group relative p-4 hover:bg-base-200/50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-base-content/80 leading-relaxed">
                                  {n.message}
                                </p>
                                <p className="text-xs text-base-content/50 mt-1.5">
                                  {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-base-300 rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNotification(n.id);
                                }}
                              >
                                <FaTimes className="size-4 text-base-content/50" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );

  // Mobile Bottom Navigation Bar (below lg)
  const MobileBottomNav = () => (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-base-200/95 backdrop-blur-md border-t border-base-300/50" style={{ height: 'calc(4rem + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="h-16 max-w-[1920px] mx-auto">
        <div className="flex items-center justify-around h-full px-2">
          {/* Contacts */}
          <Link
            to="/?view=contacts"
            className="flex items-center justify-center flex-1 h-full min-w-0 transition-all active:scale-95 relative"
          >
            <div className="relative">
              <FaUser className={`size-7 transition-all ${
                location.search.includes('view=contacts')
                  ? 'text-primary fill-primary'
                  : 'text-base-content/50'
              }`} />
              {pendingRequestsCount > 0 && (
                <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                </span>
              )}
            </div>
          </Link>

          {/* Chats */}
          <Link
            to="/?view=chats"
            className="flex items-center justify-center flex-1 h-full min-w-0 transition-all active:scale-95 relative"
          >
            <div className="relative">
              <FaComment className={`size-7 transition-all ${
                location.search.includes('view=chats') || (!location.search.includes('view=') && !location.search.includes('settings=true'))
                  ? 'text-primary fill-primary'
                  : 'text-base-content/50'
              }`} />
              {totalUnreadMessages > 0 && (
                <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {totalUnreadMessages > 99 ? '99+' : totalUnreadMessages}
                </span>
              )}
            </div>
          </Link>

          {/* Settings */}
          <Link
            to="/?view=settings"
            className="flex items-center justify-center flex-1 h-full min-w-0 transition-all active:scale-95"
          >
            <FaCog className={`size-7 transition-all ${
              location.search.includes('view=settings') || location.search.includes('settings=true')
                ? 'text-primary fill-primary'
                : 'text-base-content/50'
            }`} />
          </Link>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <DesktopNavbar />
      {!isInActiveChat && <MobileBottomNav />}
      <DesktopBottomToolbar />
    </>
  );
};

export default Navbar;