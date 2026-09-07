import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "48px", maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        Creative Resize Platform
      </h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        Internal Designer workbench for scanning client Google Drive folders, computing
        must-have size coverage against versioned specs, and running deterministic /
        OpenAI-assisted resize with Designer review. Phase 1 (Job Create, Drive Scan, Asset
        Inventory, Coverage &amp; Gap Matrix, routing display) is built — see{" "}
        <Link href="/jobs" style={{ textDecoration: "underline" }}>
          Jobs
        </Link>
        . Deterministic/AI execution (Phase 2/3) is not built yet.
      </p>
      <p style={{ color: "var(--muted)", marginTop: 16, fontSize: 14 }}>
        Source of truth (local file, not a live link): {" "}
        <code>
          Obsidian Vault/02 - Work/Creative Asset Automation/28 Technical Plan - Designer
          Creative Resize Platform.md
        </code>
      </p>
    </main>
  );
}
