/** Placeholder lines while a step's content loads: the step keeps its size, then fills in. */
export function Skeleton({ lines = 2, label }: { lines?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" className="space-y-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`h-3 bg-border motion-safe:animate-pulse ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
      <div aria-hidden="true" className="h-9 w-full bg-border motion-safe:animate-pulse sm:w-44" />
    </div>
  );
}
