# Metis Telemetry & Privacy Policy

Metis is an offline-first desktop workspace for PLS-SEM modeling. We believe your research data, model specifications, and structural equation calculations should **never** leave your local machine.

To support academic grant applications and track overall platform adoption, Metis includes an optional, one-time anonymous installation ping during setup.

## Privacy Guarantees

1. **Opt-In Only**: Telemetry is strictly opt-in during the initial Setup Wizard. If declined or skipped, zero network calls are made.
2. **One-Time Only**: The ping fires at most **once per device installation**. Once sent or declined, the network route is permanently disarmed in local app state (`telemetry_status.json`). App updates will never re-prompt existing users.
3. **Zero PII (Personally Identifiable Information)**: We never collect usernames, IP addresses (dropped immediately at ingestion), filenames, dataset contents, or computer names.
4. **Server-Side Country Resolution**: Country is inferred server-side from request origin headers at the moment of ingestion. Country is never read from your device or included in the client JSON payload.
5. **Data Aggregation & Auto-Purge**: Raw ping entries are automatically deleted after 30 days and rolled up into immutable monthly totals (e.g., "42 macOS installs in Germany in July 2026").

## Exact Payload Schema

When enabled, Metis sends a single HTTP POST JSON request:

```json
{
  "installation_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "version": "0.3.0",
  "build_variant": "bundle",
  "platform": "darwin",
  "os_release": "24.1.0",
  "arch": "arm64",
  "r_status": "bundled_ok",
  "system_memory_gb": 16,
  "timestamp": "2026-07-23T20:32:50Z"
}
```

## Source Code Auditing

You can verify the exact telemetry and disarm logic in our open-source codebase:
- Setup Wizard Opt-In UI: [`src/pages/SetupWizard.tsx`](src/pages/SetupWizard.tsx)
- Disarm & One-Shot Main Process Handler: [`electron/main.ts`](electron/main.ts)
