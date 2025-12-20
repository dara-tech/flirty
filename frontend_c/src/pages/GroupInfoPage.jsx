import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import GroupInfoContent from "../component/GroupInfoContent";

const GroupInfoPage = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  
  // Check screen size and redirect on desktop/md+ (>= 1024px) to show in panel
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      
      // If desktop/md+, redirect to main page - ChatPage will show it in panel
      if (!mobile && groupId) {
        navigate('/', { replace: true });
      }
    };
    
    // Check immediately on mount
    if (window.innerWidth >= 1024 && groupId) {
      navigate('/', { replace: true });
      return;
    }
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [groupId, navigate]);
  
  // Only render as full page on mobile (< 1024px)
  if (!isMobile || !groupId) {
    return null;
  }
  
  return <GroupInfoContent groupId={groupId} embedded={false} />;
};

export default GroupInfoPage;
