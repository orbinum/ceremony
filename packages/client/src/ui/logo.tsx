/** The Orbinum wordmark, white on the dark theme and black on the light one. */
export function Logo() {
  return (
    <>
      <img
        src="/orbinum-horizontal-white.svg"
        alt="Orbinum"
        className="only-dark h-6 w-auto sm:h-7"
      />
      <img
        src="/orbinum-horizontal-black.svg"
        alt="Orbinum"
        className="only-light h-6 w-auto sm:h-7"
      />
    </>
  );
}
