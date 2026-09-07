/**
 * Split out from lib/reviews.ts because that file imports lib/db.ts (the `pg`
 * client, Node-only) — RejectForm.tsx is a client component and needs this
 * constant without pulling `pg` into the browser bundle.
 */
export const REJECTION_REASONS = [
  "Required element cropped or cut off",
  "Text illegible or too small",
  "Layout doesn't match brand/industry expectations",
  "Compliance element missing or altered",
  "Elements overlap/collide",
  "Unspecified / overall impression",
] as const;
