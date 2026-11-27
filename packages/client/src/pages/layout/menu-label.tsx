/** A section heading of the phone menu. */
export function MenuLabel({ children }: { children: string }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}
