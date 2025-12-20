import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import UserInfoContent from "../component/UserInfoContent";

const UserInfoPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  
  // Check screen size and redirect on desktop/md+ (>= 1024px) to show in panel
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      
      // If desktop/md+, redirect to main page - ChatPage will show it in panel
      if (!mobile && userId) {
        navigate('/', { replace: true });
      }
    };
    
    // Check immediately on mount
    if (window.innerWidth >= 1024 && userId) {
      navigate('/', { replace: true });
      return;
    }
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [userId, navigate]);
  
  // Only render as full page on mobile (< 1024px)
  if (!isMobile || !userId) {
    return null;
  }
  
  return <UserInfoContent userId={userId} embedded={false} />;
};

export default UserInfoPage;

