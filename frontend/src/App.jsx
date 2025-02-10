import React, { useEffect } from 'react'
import Navbar from './component/Navbar'
import { Navigate, Route, Routes } from 'react-router-dom'
import SignUpPage from './pages/SignUpPage'
import LoginPage from './pages/LoginPage'
import SettingPage from './pages/SettingPage'
import ProfilePage from './pages/ProfilePage'
import HomePage from './pages/HomePage'
import { useAuthStore } from './store/useAuthStore'
import { useThemeStore } from './store/useThemeStore'
import { Loader } from 'lucide-react'
import { Toaster } from 'react-hot-toast'

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore(); // Corrected to useThemeStore
  
  useEffect(() => {
    checkAuth(); // Check authentication on mount
  }, [checkAuth]);

  console.log({ authUser }); // Debug log
  
  // Show loading spinner while checking auth status
  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="size-10 animate-spin" />
      </div>
    );


  return (
    <div data-theme={theme}> {/* Corrected to use theme from useThemeStore */}
      <Navbar />
      <Routes>
        {/* HomePage accessible only when logged in */}
        <Route path="/" element={authUser ? <HomePage /> : <Navigate to="/login" />} />
        
        {/* SignupPage accessible only when not logged in */}
        <Route path="/signup" element={!authUser ? <SignUpPage /> : <Navigate to="/" />} />
        
        {/* LoginPage accessible only when not logged in */}
        <Route path="/login" element={!authUser ? <LoginPage /> : <Navigate to="/" />} />
        
        {/* SettingPage is always accessible */}
        <Route path="/settings" element={<SettingPage />} />
        
        {/* ProfilePage accessible only when logged in */}
        <Route path="/profile" element={authUser ? <ProfilePage /> : <Navigate to="/login" />} />
      </Routes>

      <Toaster /> {/* Global toast notifications */}
    </div>
  )
}

export default App;
