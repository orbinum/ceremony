/**
 * Step 1's content for a visitor who is signed out: the GitHub sign-in, or why it is not offered
 * yet. `announced` undefined: not known yet, so neither the button nor the notice is shown. The
 * sign-in is a full navigation: the coordinator redirects to GitHub and back.
 */
import { Notice, Skeleton } from "../../../ui";
import { NOT_ANNOUNCED } from "../text";

export function SignIn({ announced }: { announced: boolean | undefined }) {
  if (announced === undefined) return <Skeleton label="Loading the ceremony" />;
  if (!announced) return <Notice tone="info">{NOT_ANNOUNCED}</Notice>;
  return (
    <>
      <p>
        The account must be at least 30 days old, with a public repository and five accounts it
        follows. No permission is requested.
      </p>
      <a
        href="/auth/github"
        className="btn-primary block w-full px-4 py-3 text-center text-xs font-bold sm:inline-block sm:w-auto sm:py-2"
      >
        Sign in with GitHub
      </a>
    </>
  );
}
