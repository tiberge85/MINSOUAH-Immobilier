/**
 * Skeleton loader components for loading states across the app.
 */
export function SkeletonLine({ width = 'w-full', height = 'h-4', className = '' }) {
  return <div className={`skeleton ${width} ${height} ${className}`} />;
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20 flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="skeleton w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <SkeletonLine width="w-2/3" height="h-4" />
          <SkeletonLine width="w-1/3" height="h-3" />
        </div>
      </div>
      <SkeletonLine height="h-3" />
      <SkeletonLine width="w-4/5" height="h-3" />
      <SkeletonLine width="w-3/5" height="h-3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden">
      {/* Header */}
      <div className="bg-surface-container-high px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="skeleton h-3 flex-1 rounded" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex gap-4 border-t border-outline-variant/10">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className={`skeleton h-3 ${j === 0 ? 'w-1/4' : 'flex-1'} rounded`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20 flex items-center gap-3 ${className}`}>
      <div className="skeleton w-11 h-11 rounded-full flex-shrink-0" />
      <div className="flex flex-col gap-2 flex-1">
        <SkeletonLine width="w-1/2" height="h-3" />
        <SkeletonLine width="w-3/4" height="h-5" />
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonStat key={i} />)}
    </div>
  );
}

export default { SkeletonLine, SkeletonCard, SkeletonTable, SkeletonStat, SkeletonStats };
