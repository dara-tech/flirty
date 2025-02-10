// ChatContainer.jsx
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { useAuthStore } from "../store/useAuthStore";
import { CheckCheck, Check } from "lucide-react";
import ChatHeader from "./ChatHeader";
import MessageInput from "./MessageInput";
import MessageSkeleton from "./skeletons/MessageSkeleton";
import { formatMessageTime } from "../lib/utils";

const ChatContainer = () => {
  const { 
    messages, 
    getMessages, 
    isMessagesLoading, 
    selectedUser, 
    subscribeToMessages, 
    unsubscribeFromMessages,
  } = useChatStore();
  const { authUser, socket } = useAuthStore();
  const messageEndRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (selectedUser?._id) {
      getMessages(selectedUser._id);
      subscribeToMessages();

      // Mark messages as seen when component mounts
      messages.forEach(message => {
        if (!message.seen && message.senderId === selectedUser._id) {
          socket.emit("messageSeen", {
            messageId: message._id,
            senderId: message.senderId
          });
        }
      });
    }

    return () => {
      unsubscribeFromMessages();
    };
  }, [selectedUser?._id, getMessages, subscribeToMessages, unsubscribeFromMessages]);

  // Handle typing events
  useEffect(() => {
    if (!socket || !selectedUser) return;

    const handleTyping = ({ senderId }) => {
      if (senderId === selectedUser._id) {
        setTypingUsers(prev => [...new Set([...prev, senderId])]);
      }
    };

    const handleStopTyping = ({ senderId }) => {
      if (senderId === selectedUser._id) {
        setTypingUsers(prev => prev.filter(id => id !== senderId));
      }
    };

    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);

    return () => {
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
    };
  }, [socket, selectedUser]);

  // Handle new messages being marked as seen
  useEffect(() => {
    const handleNewMessage = (newMessage) => {
      if (
        newMessage.senderId === selectedUser?._id && 
        !newMessage.seen
      ) {
        socket.emit("messageSeen", {
          messageId: newMessage._id,
          senderId: newMessage.senderId
        });
      }
    };

    socket.on("newMessage", handleNewMessage);

    return () => {
      socket.off("newMessage", handleNewMessage);
    };
  }, [selectedUser, socket]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages.map((msg) => msg.seen).join(","), typingUsers]);

  const handleTyping = (e) => {
    if (!selectedUser?._id) return;
    
    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing", {
        receiverId: selectedUser._id
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit("stopTyping", {
        receiverId: selectedUser._id
      });
    }, 2000);
  };

  const MessageStatus = ({ message }) => (
    <div className="flex items-center gap-0.5 ml-1">
      <span className="text-xs">
        {formatMessageTime(message.createdAt)}
      </span>
      {message.senderId === authUser._id && (
        <span className="ml-1">
          {message.seen ? (
            <CheckCheck className="w-4 h-4 text-base-300" />
          ) : (
            <Check className="w-4 h-4 text-base-100" />
          )}
        </span>
      )}
    </div>
  );

  const TypingIndicator = () => (
    <div className="flex items-end gap-2 max-w-[80%]">
      <div className="chat-image avatar">
        <div className="size-8 rounded-full">
          <img
            src={selectedUser.profilePic || "/avatar.png"}
            alt="profile pic"
          />
        </div>
      </div>
      <div className="px-4 py-2 rounded-xl shadow-sm bg-base-200">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );

  if (isMessagesLoading) return <MessageSkeleton />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base-100 rounded-xl">
      <ChatHeader />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div 
            key={message._id} 
            className={`flex ${message.senderId === authUser._id ? "justify-end" : "justify-start"}`}
          >
            <div className={`flex items-end gap-2 max-w-[80%] ${
              message.senderId === authUser._id ? "flex-row-reverse" : ""
            }`}>
              <div className="chat-image avatar">
                <div className="size-8 rounded-full">
                  <img
                    src={message.senderId === authUser._id 
                      ? authUser.profilePic || "/avatar.png"
                      : selectedUser.profilePic || "/avatar.png"
                    }
                    alt="profile pic"
                  />
                </div>
              </div>
              <div className={`relative p-3 rounded-xl shadow-sm text-sm ${
                message.senderId === authUser._id
                  ? "bg-primary text-primary-content"
                  : "bg-base-200"
              }`}>
                {message.image && (
                  <img
                    src={message.image}
                    alt="Attachment"
                    className="sm:max-w-[200px] rounded-xl my-2"
                  />
                )}
                {message.text && <p className="mb-1">{message.text}</p>}
                <div className={`flex items-center text-xs opacity-70 ${
                  message.senderId === authUser._id 
                    ? "text-primary-content" 
                    : "text-base-content"
                }`}>
                  <MessageStatus message={message} />
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {typingUsers.includes(selectedUser?._id) && (
          <div ref={messageEndRef}>
            <TypingIndicator />
          </div>
        )}
        {!typingUsers.includes(selectedUser?._id) && <div ref={messageEndRef} />}
      </div>
      <MessageInput onTyping={handleTyping} />
    </div>
  );
};

export default ChatContainer;
