/** A wallet's announced logo, or its initials when it announced none (as in the Hub). */
export function WalletIcon({ name, src }: { name: string; src: string | undefined }) {
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden border border-border bg-surface">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-5 w-5 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className="text-[10px] font-black text-accent">{name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}
