/** A small uppercase tag beside an archived ceremony's name (Current, Invite only). */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}
