// template.tsx re-mounts on every navigation under this segment, which lets
// us run a fresh enter animation each time the user opens a new chat.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="thread-page-enter">{children}</div>;
}
