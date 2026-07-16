function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
      <div className="aspect-[4/3] bg-surface-2 shimmer" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-24 rounded bg-surface-2 shimmer" />
            <div className="h-3 w-32 rounded bg-surface-2 shimmer" />
          </div>
          <div className="h-7 w-10 rounded-lg bg-surface-2 shimmer" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-8 rounded bg-surface-2 shimmer" />
          <div className="h-8 rounded bg-surface-2 shimmer" />
          <div className="h-8 rounded bg-surface-2 shimmer" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="h-8 w-28 rounded bg-surface-2 shimmer" />
          <div className="h-8 w-16 rounded bg-surface-2 shimmer" />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-edge px-3 py-3">
        <div className="h-8 w-28 rounded-lg bg-surface-2 shimmer" />
        <div className="ml-auto h-8 w-16 rounded-lg bg-surface-2 shimmer" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
