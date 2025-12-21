import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import ChatContainer from "../component/ChatContainer";
import ConversationsListPage from "./ConversationsListPage";
import SettingPage from "./SettingPage";
import ThemePage from "./ThemePage";
import GroupInfoContent from "../component/GroupInfoContent";
import UserInfoContent from "../component/UserInfoContent";
import CallsPage from "./CallsPage";
import { useSearchParams, useLocation } from "react-router-dom";
import { FaComment } from "react-icons/fa";

const ChatPage = () => {
  const { selectedUser, selectedGroup, selectedSavedMessages, getUsers, getGroups, setSelectedUser, setSelectedGroup, subscribeToContactRequests, unsubscribeFromContactRequests, subscribeToMessages, unsubscribeFromMessages, subscribeToTyping, unsubscribeFromTyping, subscribeToGroups, unsubscribeFromGroups } = useChatStore();
  const { authUser } = useAuthStore();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfoId, setGroupInfoId] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const [userInfoId, setUserInfoId] = useState(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  
  // Draggable resizer state
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('chat-left-panel-width');
    return saved ? parseInt(saved, 10) : 320; // Default 320px (w-80)
  });
  const [isResizing, setIsResizing] = useState(false);
  
  // Listen for showGroupInfo event from ChatHeader (desktop)
  useEffect(() => {
    const handleShowGroupInfo = (e) => {
      if (isDesktop) {
        setGroupInfoId(e.detail.groupId);
        setShowGroupInfo(true);
        // Dispatch event to hide input in toolbar
        window.dispatchEvent(new CustomEvent('groupInfoStateChanged', { detail: { isOpen: true } }));
      }
    };
    
    window.addEventListener('showGroupInfo', handleShowGroupInfo);
    return () => window.removeEventListener('showGroupInfo', handleShowGroupInfo);
  }, [isDesktop]);

  // Listen for showUserInfo event from ChatHeader (desktop)
  useEffect(() => {
    const handleShowUserInfo = (e) => {
      if (isDesktop) {
        setUserInfoId(e.detail.userId);
        setShowUserInfo(true);
        // Dispatch event to hide input in toolbar
        window.dispatchEvent(new CustomEvent('userInfoStateChanged', { detail: { isOpen: true } }));
      }
    };
    
    window.addEventListener('showUserInfo', handleShowUserInfo);
    return () => window.removeEventListener('showUserInfo', handleShowUserInfo);
  }, [isDesktop]);
  
  // Dispatch events when group info state changes
  useEffect(() => {
    if (isDesktop) {
      window.dispatchEvent(new CustomEvent('groupInfoStateChanged', { 
        detail: { isOpen: showGroupInfo && !!groupInfoId } 
      }));
    }
  }, [isDesktop, showGroupInfo, groupInfoId]);

  // Dispatch events when user info state changes
  useEffect(() => {
    if (isDesktop) {
      window.dispatchEvent(new CustomEvent('userInfoStateChanged', { 
        detail: { isOpen: showUserInfo && !!userInfoId } 
      }));
    }
  }, [isDesktop, showUserInfo, userInfoId]);
  
  // Extract groupId from route if on group info route
  const groupIdFromRoute = location.pathname.match(/\/group\/([^/]+)\/info/)?.[1];
  
  // Extract userId from route if on user info route
  const userIdFromRoute = location.pathname.match(/\/user\/([^/]+)\/info/)?.[1];
  
  // On desktop/md+, if route is group info, extract groupId and show in panel instead
  useEffect(() => {
    if (isDesktop && groupIdFromRoute && !showGroupInfo) {
      setGroupInfoId(groupIdFromRoute);
      setShowGroupInfo(true);
      // Navigate back to main page (we'll show it in panel instead)
      window.history.replaceState({}, '', '/');
    }
  }, [isDesktop, groupIdFromRoute, showGroupInfo]);

  // On desktop/md+, if route is user info, extract userId and show in panel instead
  useEffect(() => {
    if (isDesktop && userIdFromRoute && !showUserInfo) {
      setUserInfoId(userIdFromRoute);
      setShowUserInfo(true);
      // Navigate back to main page (we'll show it in panel instead)
      window.history.replaceState({}, '', '/');
    }
  }, [isDesktop, userIdFromRoute, showUserInfo]);
  
  const view = searchParams.get('view') || 'chats'; // Default to chats (conversations)
  const showTheme = searchParams.get('theme') === 'true' || view === 'theme';
  
  // On desktop, keep showing settings even when theme is active
  // On mobile, only show settings if theme is not active
  const showSettings = useMemo(() => {
    const isSettingsView = view === 'settings' || searchParams.get('settings') === 'true';
    
    if (isDesktop) {
      // On desktop: show settings if it's the settings view, even when theme is active
      // This allows theme to show in right panel while keeping settings in left panel
      return isSettingsView || (showTheme && view !== 'theme');
    } else {
      // On mobile: only show settings if theme is not active (theme replaces settings)
      return !showTheme && isSettingsView;
    }
  }, [isDesktop, view, showTheme, searchParams]);
  const resizerRef = useRef(null);
  const containerRef = useRef(null);

  // Check if desktop on mount and resize
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    // Only load data if user is authenticated
    if (!authUser) return;
    
    // Don't load users/groups here - let ConversationsListPage handle it based on active tab
    // Only subscribe to real-time events (these don't load data, just listen for updates)
    subscribeToContactRequests();
    subscribeToMessages();
    subscribeToTyping();
    subscribeToGroups();
    
    return () => {
      unsubscribeFromContactRequests();
      unsubscribeFromMessages();
      unsubscribeFromTyping();
      unsubscribeFromGroups();
    };
  }, [authUser, subscribeToContactRequests, unsubscribeFromContactRequests, subscribeToMessages, unsubscribeFromMessages, subscribeToTyping, unsubscribeFromTyping, subscribeToGroups, unsubscribeFromGroups]);

  useEffect(() => {
    // Clear selected chat when showing settings or theme
    if (showSettings || showTheme) {
      setSelectedUser(null);
      setSelectedGroup(null);
    }
  }, [showSettings, showTheme, setSelectedUser, setSelectedGroup]);

  // Handle mouse down on resizer
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle mouse move during resize
  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;
    
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const minWidth = 240; // Minimum width
      const maxWidth = Math.min(600, containerRect.width * 0.6); // Maximum 60% of container or 600px
      
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setLeftPanelWidth(clampedWidth);
      // Dispatch event to sync with bottom toolbar
      window.dispatchEvent(new CustomEvent('panel-resize', { detail: { width: clampedWidth } }));
    }
  }, [isResizing]);

  // Handle mouse up to stop resizing
  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('chat-left-panel-width', leftPanelWidth.toString());
    }
  }, [isResizing, leftPanelWidth]);

  // Save width to localStorage when it changes
  useEffect(() => {
    if (!isResizing && leftPanelWidth) {
      localStorage.setItem('chat-left-panel-width', leftPanelWidth.toString());
    }
  }, [leftPanelWidth, isResizing]);

  // Listen for resize events from bottom toolbar
  useEffect(() => {
    const handlePanelResize = (e) => {
      if (!isResizing) { // Only update if we're not the one resizing
        setLeftPanelWidth(e.detail.width);
      }
    };
    window.addEventListener('panel-resize', handlePanelResize);
    return () => window.removeEventListener('panel-resize', handlePanelResize);
  }, [isResizing]);

  // Add global event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Determine which component to show on the left
  const getLeftPanel = () => {
    // Show settings if it's the settings view
    if (view === 'settings' || showSettings) {
      return <SettingPage />;
    } else if (view === 'chats' || view === 'contacts') {
      // Contacts is now a tab within ConversationsListPage
      return <ConversationsListPage />;
    } else if (view === 'calls') {
      return <CallsPage />;
    } else {
      // Default to chats (which includes contacts tab)
      return <ConversationsListPage />;
    }
  };

  // Check if user is in an active chat (for conditional bottom spacing on mobile)
  const isInActiveChat = !!(selectedUser || selectedGroup || selectedSavedMessages);

  return (
    <div className={`absolute top-0 left-0 right-0 ${
      isInActiveChat 
        ? 'bottom-0 lg:bottom-20' // Mobile: no bottom nav when in chat, Desktop: always has toolbar
        : 'h-[calc(100vh-5rem)] bottom-16 lg:bottom-20' // Mobile: bottom nav visible, Desktop: toolbar visible
    } overflow-hidden`}>
      <div ref={containerRef} className="h-full flex overflow-hidden bg-base-100">
        {/* Left Panel - Contacts, Chats, or Settings (switched by bottom bar) */}
        {/* Desktop: Always visible on left, full width on mobile when no chat selected */}
        <div 
          className={`
            ${selectedUser || selectedGroup || selectedSavedMessages || showTheme ? 'hidden lg:flex' : 'flex'}
            flex-shrink-0
            overflow-hidden
            flex-col
            relative
            border-r border-base-200/50
          `}
          style={{ 
            width: isDesktop ? `${leftPanelWidth}px` : '100%'
          }}
        >
          {getLeftPanel()}
        </div>
        
        {/* Resizer - Only visible on desktop when left panel is visible */}
        {isDesktop && (
          <div
            ref={resizerRef}
            onMouseDown={handleMouseDown}
            className={`
              hidden lg:block
              w-1
              bg-base-300/50
              hover:bg-primary
              cursor-col-resize
              transition-colors
              flex-shrink-0
              relative
              z-10
              ${isResizing ? 'bg-primary' : ''}
            `}
            style={{
              cursor: isResizing ? 'col-resize' : 'col-resize',
            }}
          >
            {/* Invisible wider hit area for easier dragging */}
            <div className="absolute inset-0 -left-2 -right-2" />
          </div>
        )}
        
        {/* Right Panel - Shows Chat Container, Theme Page, Group Info, User Info, or empty state */}
        {/* Desktop: Always show right panel */}
        <div className="hidden lg:flex flex-1 flex-col overflow-hidden min-w-0 bg-base-100 relative">
          {showTheme ? (
            <ThemePage />
          ) : showGroupInfo && groupInfoId ? (
            <GroupInfoContent 
              groupId={groupInfoId} 
              embedded={true}
              onClose={() => {
                setShowGroupInfo(false);
                setGroupInfoId(null);
                // Dispatch event to show input in toolbar
                if (isDesktop) {
                  window.dispatchEvent(new CustomEvent('groupInfoStateChanged', { detail: { isOpen: false } }));
                }
              }} 
            />
          ) : showUserInfo && userInfoId ? (
            <UserInfoContent 
              userId={userInfoId} 
              embedded={true}
              onClose={() => {
                setShowUserInfo(false);
                setUserInfoId(null);
                // Dispatch event to show input in toolbar
                if (isDesktop) {
                  window.dispatchEvent(new CustomEvent('userInfoStateChanged', { detail: { isOpen: false } }));
                }
              }} 
            />
          ) : selectedUser || selectedGroup || selectedSavedMessages ? (
            <ChatContainer />
          ) : (
            // Empty state when no chat selected
            <div className="flex-1 flex items-center justify-center bg-base-100">
              <div className="text-center px-8">
                <div className="size-20 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
                  <FaComment className="size-10 text-base-content/30" />
                </div>
                <h3 className="text-xl font-semibold text-base-content mb-2">No chat selected</h3>
                <p className="text-base-content/60">Select a conversation from the list to start chatting</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Mobile: Show chat, theme, or settings when selected (full screen, replaces left panel) */}
        {selectedUser || selectedGroup || selectedSavedMessages ? (
          <div className="lg:hidden flex-1 flex flex-col overflow-hidden min-w-0 bg-base-100">
            <ChatContainer />
          </div>
        ) : showTheme ? (
          <div className="lg:hidden flex-1 flex flex-col overflow-hidden min-w-0 bg-base-100">
            <ThemePage />
          </div>
        ) : showSettings ? (
          <div className="lg:hidden flex-1 flex flex-col overflow-hidden min-w-0 bg-base-100">
            <SettingPage />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ChatPage;

