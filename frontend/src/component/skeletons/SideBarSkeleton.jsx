import { Users, Search } from "lucide-react";

const SidebarSkeleton = () => {
  // Create 8 skeleton items
  const skeletonContacts = Array(8).fill(null);

  return (
    <aside className="fixed inset-0 lg:relative h-full w-full lg:w-80 bg-base-100 lg:bg-transparent border-r border-base-300 flex flex-col z-50">
      {/* Header Section */}
      <div className="border-b border-base-300 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-base-200 rounded-lg">
              <Users className="size-5 text-primary animate-pulse" />
            </div>
            <div className="skeleton h-6 w-24" />
          </div>
        </div>

        {/* Search Bar Skeleton */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <div className="skeleton w-full h-10 rounded-lg" />
        </div>

        {/* Filter Options Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="skeleton w-4 h-4 rounded" />
            <div className="skeleton w-24 h-4" />
          </div>
          <div className="skeleton w-16 h-4" />
        </div>
      </div>

      {/* Users List Skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
          {skeletonContacts.map((_, idx) => (
            <div
              key={idx}
              className="w-full p-3 rounded-lg flex items-center gap-4 bg-base-200/50"
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
                <div className="skeleton h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default SidebarSkeleton;