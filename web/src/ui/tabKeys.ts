/** Which tab an arrow, Home or End key moves to, wrapping at the ends; null
 * for any other key. */
export function nextTabIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
