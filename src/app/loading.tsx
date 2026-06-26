export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <div className="h-8 w-40 bg-surface rounded-xl animate-pulse" />
        <div className="h-4 w-24 bg-surface rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`h-48 bg-surface rounded-2xl animate-pulse ${i < 2 ? 'md:col-span-2 md:row-span-2' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
