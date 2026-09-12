import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the real test directory. `next build` copies the whole project into
    // .next/standalone, tests included, so the default glob was running every
    // suite twice — the second time against whatever the last build froze,
    // which would report a stale copy as if it were current code.
    include: ["tests/**/*.test.ts"],
  },
});
