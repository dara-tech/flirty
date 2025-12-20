import { useState, useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { useCallStore } from "../store/useCallStore";
import { useChatStore } from "../store/useChatStore";
import { useNavigate } from "react-router-dom";
import { FaPhone, FaArrowUp, FaArrowDown, FaTrash, FaCheck, FaChartBar, FaVideo, FaMicrophone } from "react-icons/fa";
import ProfileImage from "../component/ProfileImage";
import ConfirmDialog from "../component/ConfirmDialog";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axois";

const CallsPage = () => {
  const { authUser, onlineUsers, logout } = useAuthStore();
  const { initiateCall, callState } = useCallStore();
  const { setSelectedUser } = useChatStore();
  const navigate = useNavigate();
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCalls, setSelectedCalls] = useState(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [calls, setCalls] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [callStats, setCallStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Fetch call history from API
  useEffect(() => {
    const fetchCallHistory = async () => {
      if (!authUser) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await axiosInstance.get("/calls/history?page=1&limit=100");
        
        if (res.status === 401) {
          logout();
          setIsLoading(false);
          return;
        }

        // Handle standardized paginated response format
        // Backend returns: { success: true, data: [...], pagination: {...} }
        const callsData = res.data?.data || [];
        
        // Convert timestamp strings to Date objects (JSON serialization converts Date to string)
        const callsWithDates = callsData.map(call => ({
          ...call,
          timestamp: call.timestamp ? new Date(call.timestamp) : new Date()
        }));

        setCalls(callsWithDates);
      } catch (error) {
        console.error("Error fetching call history:", error);
        if (error.response?.status === 401) {
          logout();
        } else {
          toast.error(error.response?.data?.error || "Failed to load call history");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCallHistory();
  }, [authUser, logout]);

  // Fetch call statistics
  useEffect(() => {
    const fetchCallStats = async () => {
      if (!authUser) {
        return;
      }

      setIsLoadingStats(true);
      try {
        const res = await axiosInstance.get("/calls/stats");
        
        if (res.status === 401) {
          logout();
          return;
        }

        // Handle response format: { success: true, data: {...} }
        const statsData = res.data?.data;
        if (statsData) {
          setCallStats(statsData);
        }
      } catch (error) {
        console.error("Error fetching call statistics:", error);
        if (error.response?.status === 401) {
          logout();
        }
        // Don't show error toast for stats - it's optional
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchCallStats();
  }, [authUser, logout]);

  const formatCallDuration = (duration, status) => {
    if (status === "missed") return "Missed";
    if (duration === 0) return "0 sec";
    if (duration < 60) return `${duration} sec`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    if (seconds === 0) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) {
      if (remainingMinutes === 0) return `${hours} hr`;
      return `${hours} hr ${remainingMinutes} min`;
    }
    return `${minutes} min ${seconds} sec`;
  };

  const formatCallDate = (date) => {
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return format(date, "EEE"); // Mon, Tue, etc.
    return format(date, "M/d/yy"); // 12/12/25
  };

  const formatTotalDuration = (seconds) => {
    if (seconds === 0) return "0 sec";
    if (seconds < 60) return `${seconds} sec`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} hr`;
    return `${hours} hr ${remainingMinutes} min`;
  };

  const handleCreateCall = () => {
    // Navigate to contacts page to select a user to call
    navigate("/?view=contacts");
  };

  const handleCall = async (contactId, e) => {
    if (e) {
      e.stopPropagation();
    }
    
    if (callState !== 'idle') {
      toast.error("You are already in a call");
      return;
    }

    // Allow calling offline users (like Telegram)
    // The backend will handle the call with a 60-second timeout
    try {
      await initiateCall(contactId, 'voice');
    } catch (error) {
      toast.error(error.message || "Failed to start call");
    }
  };

  const handleCallItemClick = (call) => {
    if (isEditMode) {
      // Toggle selection in edit mode
      const newSelected = new Set(selectedCalls);
      if (newSelected.has(call.id)) {
        newSelected.delete(call.id);
      } else {
        newSelected.add(call.id);
      }
      setSelectedCalls(newSelected);
    } else {
      // Navigate to chat with this contact
      setSelectedUser(call.contact);
      navigate("/");
    }
  };

  const handleToggleSelect = (callId, e) => {
    e.stopPropagation();
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) {
      newSelected.delete(callId);
    } else {
      newSelected.add(callId);
    }
    setSelectedCalls(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedCalls.size === calls.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(calls.map(call => call.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedCalls.size === 0) {
      toast.error("No calls selected");
      return;
    }
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    const selectedCount = selectedCalls.size;
    const wasAllSelected = selectedCount === calls.length;
    const callIds = Array.from(selectedCalls);

    try {
      // Delete calls from backend
      // Backend expects: { callIds: [...] }
      const res = await axiosInstance.delete("/calls", {
        data: { callIds }
      });

      // Update local state
      setCalls(calls.filter(call => !selectedCalls.has(call.id)));
      setSelectedCalls(new Set());
      
      // Close the dialog
      setShowDeleteDialog(false);
      
      // Show success message (use backend message if available)
      const message = res.data?.message || `${selectedCount} call${selectedCount > 1 ? 's' : ''} deleted`;
      toast.success(message);
      
      // If all calls deleted, exit edit mode
      if (wasAllSelected) {
        setIsEditMode(false);
      }
    } catch (error) {
      console.error("Error deleting calls:", error);
      if (error.response?.status === 401) {
        logout();
      } else {
        toast.error(error.response?.data?.error || "Failed to delete calls");
      }
    }
  };

  const handleEditModeToggle = () => {
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      // Clear selection when exiting edit mode
      setSelectedCalls(new Set());
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-base-100">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-4 py-3">
        {/* Call Statistics */}
        {callStats && !isLoadingStats && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-base-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <FaChartBar className="size-4 text-primary" />
                <span className="text-xs text-base-content/60">Total Calls</span>
              </div>
              <p className="text-lg font-semibold text-base-content">{callStats.total}</p>
            </div>
            <div className="bg-base-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <FaMicrophone className="size-4 text-green-500" />
                <span className="text-xs text-base-content/60">Answered</span>
              </div>
              <p className="text-lg font-semibold text-base-content">{callStats.byStatus.answered}</p>
            </div>
            <div className="bg-base-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <FaPhone className="size-4 text-red-500" />
                <span className="text-xs text-base-content/60">Missed</span>
              </div>
              <p className="text-lg font-semibold text-base-content">{callStats.byStatus.missed}</p>
            </div>
            <div className="bg-base-200/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <FaVideo className="size-4 text-blue-500" />
                <span className="text-xs text-base-content/60">Total Duration</span>
              </div>
              <p className="text-lg font-semibold text-base-content">{formatTotalDuration(callStats.totalDuration)}</p>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-base-content">Recent Calls</h1>
          <div className="flex items-center gap-3">
            {isEditMode && selectedCalls.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="text-red-500 hover:text-red-600 transition-colors text-sm font-medium flex items-center gap-1"
              >
                <FaTrash className="size-3" />
                Delete ({selectedCalls.size})
              </button>
            )}
            <button
              onClick={handleEditModeToggle}
              className="text-primary hover:text-primary/80 transition-colors text-sm font-medium"
            >
              {isEditMode ? "Done" : "Edit"}
            </button>
          </div>
        </div>

        {isEditMode && calls.length > 0 && (
          <div className="mb-3">
            <button
              onClick={handleSelectAll}
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              {selectedCalls.size === calls.length ? "Deselect All" : "Select All"}
            </button>
          </div>
        )}

        {/* Create New Call Button - Hide in edit mode */}
        {!isEditMode && (
          <button
            onClick={handleCreateCall}
            className="w-full flex items-center gap-3 px-4 py-3 bg-base-200/50 hover:bg-base-200 rounded-lg transition-colors text-primary"
          >
            <FaPhone className="size-5" />
            <span className="font-medium">Create New Call</span>
          </button>
        )}
      </div>

      {/* Calls List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar pb-16 lg:pb-20">
        {isLoading ? (
          <div className="text-center py-12 px-4">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="text-base-content/60 mt-4">Loading call history...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="size-16 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-4">
              <FaPhone className="size-8 text-base-content/30" />
            </div>
            <p className="text-base-content/60 font-medium">No recent calls</p>
            <p className="text-sm text-base-content/40 mt-1">
              Start a new call to see it here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-base-200/50">
            {calls.map((call) => {
              const isSelected = selectedCalls.has(call.id);
              return (
                <div
                  key={call.id}
                  onClick={() => handleCallItemClick(call)}
                  className={`px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10'
                      : 'hover:bg-base-200/30'
                  }`}
                >
                  {/* Selection Checkbox - Show in edit mode */}
                  {isEditMode && (
                    <div
                      onClick={(e) => handleToggleSelect(call.id, e)}
                      className={`flex-shrink-0 size-6 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-base-300 hover:border-primary/50'
                      }`}
                    >
                      {isSelected && <FaCheck className="size-3 text-white" />}
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <ProfileImage
                      src={call.contact.profilePic}
                      alt={call.contact.fullname}
                      className="size-12 rounded-full object-cover"
                    />
                  </div>

                  {/* Call Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base-content truncate">
                        {call.contact.fullname}
                      </span>
                      {call.count > 1 && (
                        <span className="text-sm text-base-content/50">
                          ({call.count})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {call.type === "outgoing" ? (
                        <FaArrowUp className="size-3 text-base-content/60" />
                      ) : (
                        <FaArrowDown
                          className={`size-3 ${
                            call.status === "missed"
                              ? "text-red-500"
                              : "text-base-content/60"
                          }`}
                        />
                      )}
                      <span
                        className={`text-sm ${
                          call.status === "missed"
                            ? "text-red-500"
                            : "text-base-content/50"
                        }`}
                      >
                        {call.type === "outgoing" ? "Outgoing" : "Incoming"} •{" "}
                        {formatCallDuration(call.duration, call.status)}
                      </span>
                    </div>
                  </div>

                  {/* Date */}
                  {!isEditMode && (
                    <div className="flex-shrink-0 text-sm text-base-content/50 mr-2">
                      {formatCallDate(call.timestamp)}
                    </div>
                  )}

                  {/* Call Button - Hide in edit mode */}
                  {!isEditMode && (
                    <button
                      className="flex-shrink-0 p-2 hover:bg-base-200 rounded-lg transition-colors"
                      onClick={(e) => handleCall(call.contact._id, e)}
                      disabled={callState !== 'idle'}
                      title="Call"
                    >
                      <FaPhone className="size-5 text-primary" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        message={`Delete ${selectedCalls.size} call${selectedCalls.size > 1 ? 's' : ''}?`}
        onConfirm={confirmDelete}
        confirmText="OK"
        cancelText="Cancel"
        isDestructive={true}
      />
    </div>
  );
};

export default CallsPage;

