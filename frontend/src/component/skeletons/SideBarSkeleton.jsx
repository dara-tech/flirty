import { FaUsers, FaSearch, FaComment } from "react-icons/fa";

const SidebarSkeleton = ({ type = "contacts" }) => {
  // Create 8 skeleton items
  const skeletonItems = Array(8).fill(null);
  const isChats = type === "chats";

  return (
    <div className="h-full flex flex-col overflow-hidden bg-base-100">
      {/* Header Section */}
      <div className="flex-shrink-0 border-b border-base-200/50 bg-base-100 px-4 py-3">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="skeleton h-6 w-6 rounded-lg" />
          <div className="skeleton h-6 w-20" />
          <div className="skeleton h-6 w-6 rounded-lg" />
        </div>

        {/* Tabs Skeleton (only for chats) */}
        {isChats && (
          <div className="flex gap-2 p-1 bg-base-200/50 rounded-lg mb-3">
            <div className="flex-1 skeleton h-8 rounded-md" />
            <div className="flex-1 skeleton h-8 rounded-md" />
          </div>
        )}

        {/* Search Bar Skeleton */}
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-base-content/40" />
          <div className="skeleton w-full h-10 rounded-lg" />
        </div>
      </div>

      {/* List Skeleton */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="px-4 py-2 space-y-0">
          {skeletonItems.map((_, idx) => (
            <div
              key={idx}
              className="w-full px-4 py-3 flex items-center gap-3"
            >
              {/* Avatar skeleton */}
              <div className="relative flex-shrink-0">
                <div className="skeleton size-12 rounded-full" />
                {/* Online status skeleton */}
                <div className="absolute bottom-0 right-0 skeleton size-3 rounded-full ring-2 ring-base-100" />
              </div>

              {/* User info skeleton */}
              <div className="flex-1 min-w-0">
                <div className="skeleton h-5 w-32 mb-2" />
                <div className="skeleton h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SidebarSkeleton;