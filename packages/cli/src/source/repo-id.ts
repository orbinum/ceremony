/**
 * A git remote URL as `host/path`, lowercase, without credentials, scheme, `.git` or trailing
 * slash: `git@github.com:o/r.git`, `ssh://git@github.com/o/r` and `https://github.com/o/r` are one
 * repository. Anything else is returned as given, lowercase.
 */

export function repoId(url: string): string {
  const scp = /^[^/@:]+@([^/:]+):(.+)$/.exec(url);
  let id = scp ? `${scp[1]}/${scp[2]}` : url;
  const parsed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?(.+)$/i.exec(id);
  if (parsed) id = parsed[1] as string;
  return id
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}
