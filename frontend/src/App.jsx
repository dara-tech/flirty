import "./styles/typing.css";
import React, { useEffect } from 'react'
import Navbar from './component/Navbar'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SignUpPage from './pages/SignUpPage'
import LoginPage from './pages/LoginPage'
import SettingPage from './pages/SettingPage'
import ChatPage from './pages/ChatPage'
import GroupInfoPage from './pages/GroupInfoPage'
import UserInfoPage from './pages/UserInfoPage'
import CallProvider from './component/CallProvider'

import { useAuthStore } from './store/useAuthStore'
import { useThemeStore } from './store/useThemeStore'
import { FaSpinner } from 'react-icons/fa'
import { Toaster } from 'react-hot-toast'

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();
  const location = useLocation();
  const isChatPage = authUser && location.pathname === '/';
  
  // Check if current route is a public route (login/signup)
  const isPublicRoute = location.pathname === '/login' || location.pathname === '/signup';
  
  useEffect(() => {
    // Only check auth if not on public routes (login/signup)
    // On public routes, we know the user isn't logged in, so no need to check
    if (!isPublicRoute) {
      checkAuth();
    } else {
      // On public routes, ensure authUser is null (user is not logged in)
      useAuthStore.setState({ authUser: null, isCheckingAuth: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // Re-check when route changes

  useEffect(() => {
    if (isChatPage) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isChatPage]);
  
  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="size-10 animate-spin" />
      </div>
    );

  return (
    <div data-theme={theme} className={`${isChatPage ? 'h-screen overflow-hidden relative' : 'min-h-screen'} bg-base-100`}>
      <Navbar />
      <Routes>
        <Route path="/" element={authUser ? <ChatPage /> : <Navigate to="/login" />} />
        <Route path="/signup" element={!authUser ? <SignUpPage /> : <Navigate to="/" />} />
        <Route path="/login" element={!authUser ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/group/:groupId/info" element={authUser ? <GroupInfoPage /> : <Navigate to="/login" />} />
        <Route path="/user/:userId/info" element={authUser ? <UserInfoPage /> : <Navigate to="/login" />} />
        {/* Redirect old routes to main page */}
        <Route path="/settings" element={<Navigate to="/?view=settings" replace />} />
        <Route path="/conversations" element={<Navigate to="/" replace />} />
        <Route path="/contacts" element={<Navigate to="/" replace />} />
      </Routes>
      
      {/* WebRTC Call Provider - Handles all call UI and logic */}
      {authUser && <CallProvider />}
      
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '0.75rem',
            padding: '12px 16px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            color: 'hsl(var(--bc))',
          },
        }}
      />
    </div>
  )
}

export default App;
