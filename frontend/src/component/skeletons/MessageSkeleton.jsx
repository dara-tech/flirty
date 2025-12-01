const MessageSkeleton = () => {
  // Create an array of 8 items for skeleton messages with varied widths
  const skeletonMessages = Array(8).fill(null);

  // Generate random widths for more realistic skeleton
  const getMessageWidth = (idx) => {
    const widths = ['w-32', 'w-40', 'w-48', 'w-56', 'w-64', 'w-72'];
    return widths[idx % widths.length];
  };

  const getLineCount = (idx) => {
    // Some messages have 1 line, some have 2-3 lines
    return idx % 3 === 0 ? 1 : idx % 3 === 1 ? 2 : 3;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base-100 h-full">
      {/* Header Skeleton */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-base-200/50 bg-base-100/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Back button skeleton */}
            <div className="skeleton size-9 rounded-full" />
            
            {/* Avatar skeleton */}
            <div className="relative">
              <div className="skeleton size-10 sm:size-11 rounded-full" />
            </div>
            
            {/* Name and status skeleton */}
            <div>
              <div className="skeleton h-4 sm:h-5 w-28 sm:w-32 mb-2" />
              <div className="skeleton h-3 w-16 sm:w-20" />
            </div>
          </div>
          
          {/* Close button skeleton */}
          <div className="skeleton size-9 rounded-full" />
        </div>
      </div>

      {/* Messages Skeleton */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:p-6 space-y-2 min-h-0">
        {skeletonMessages.map((_, idx) => {
          const isMyMessage = idx % 3 !== 0; // More varied distribution
          const lineCount = getLineCount(idx);
          const messageWidth = getMessageWidth(idx);
          
          return (
            <div
              key={idx}
              className={`flex ${isMyMessage ? "justify-end" : "justify-start"} group mb-1`}
            >
              <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${isMyMessage ? "flex-row-reverse" : ""}`}>
                {/* Avatar skeleton - Always visible but subtle */}
                <div className="flex-shrink-0 opacity-60">
                  <div className="skeleton size-7 rounded-full" />
                </div>
                
                {/* Message bubble skeleton */}
                <div className={`relative px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  isMyMessage
                    ? "bg-primary/10 rounded-br-md"
                    : "bg-base-200 rounded-bl-md"
                }`}>
                  {/* Message text lines */}
                  <div className="space-y-1.5">
                    {Array(lineCount).fill(null).map((_, lineIdx) => (
                      <div
                        key={lineIdx}
                        className={`skeleton h-4 ${lineIdx === lineCount - 1 ? messageWidth : 'w-full'}`}
                      />
                    ))}
                  </div>
                  
                  {/* Footer skeleton (time and status) */}
                  <div className={`flex items-center gap-2 mt-2 ${
                    isMyMessage ? "justify-end" : "justify-start"
                  }`}>
                    <div className="skeleton h-3 w-12" />
                    {isMyMessage && (
                      <div className="skeleton size-3 rounded-full" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Input area skeleton - subtle */}
      <div className="flex-shrink-0 px-4 pt-3 border-t border-base-200/50 bg-base-100">
        <div className="flex items-center gap-2 bg-base-200/90 rounded-2xl px-4 py-3">
          <div className="skeleton size-7 rounded-lg" />
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton size-7 rounded-lg" />
          <div className="skeleton size-7 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export default MessageSkeleton;