// Route group layout — nav + QueryProvider are provided by the root layout.
// This group organises charts, log, and settings under a shared layout segment.
export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
