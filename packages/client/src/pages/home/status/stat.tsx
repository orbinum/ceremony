/** One figure of the ceremony at a glance: its label and value. */
export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg p-3 sm:p-4">
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-x-2 font-sans text-base font-bold text-accent sm:text-lg">
        {children}
      </dd>
    </div>
  );
}
