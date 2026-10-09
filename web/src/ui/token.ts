/** Resolves a custom property from `tokens.css` to its value, for code that
 * cannot use a Tailwind utility (the WebGL globe). Throws on a missing token
 * rather than quietly drawing black. Call it after first render, not at
 * module load: the stylesheet is applied by then, but is not guaranteed to
 * be when modules are first evaluated. */
export function token(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) throw new Error(`Missing design token ${name}`);
  return value;
}
