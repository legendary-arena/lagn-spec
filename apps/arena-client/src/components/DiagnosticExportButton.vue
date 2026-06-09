<script lang="ts">
import { defineComponent } from 'vue';

import {
  getDiagnosticEntries,
  getDroppedEntryCount,
  redactCredentialsFromUrl,
  buildDiagnosticReport,
  serializeDiagnosticReport,
  buildDiagnosticFileName,
  type DiagnosticContext,
} from '../diagnostics/diagnostics';

/**
 * Small, unobtrusive fixed-position "Download diagnostics" button mounted on
 * the play surface. On click it reads the live browser context, builds a
 * credential-redacted {@link DiagnosticReport} from the captured buffer,
 * downloads it as a `.json` file, and best-effort copies the same payload to
 * the clipboard so a frozen game can be diagnosed.
 *
 * Per the vue-sfc-loader separate-compile pipeline (D-6512) this SFC uses
 * `defineComponent({ setup() { return {...} } })` so the template's non-prop
 * binding (`onDownloadDiagnostics`) reaches `_ctx`. Placement idiom mirrors the
 * `position: fixed` `VersionBadge.vue` sibling.
 *
 * @see WP-228 §Scope; EC-260 §Locked Values; DECISIONS.md D-22801
 */
export default defineComponent({
  name: 'DiagnosticExportButton',
  setup() {
    /**
     * Collects the live browser context for the report. `locationHref` is
     * redacted here, before the pure builder runs, so the secret never reaches
     * the serialized output. `matchId` / `playerId` are parsed from the same
     * (redaction-safe) query string.
     *
     * @param capturedAtMs The single click-time `Date.now()` read.
     * @returns The collected context.
     */
    function collectContext(capturedAtMs: number): DiagnosticContext {
      const redactedHref = redactCredentialsFromUrl(window.location.href);
      const params = new URLSearchParams(window.location.search);
      return {
        appVersion: __APP_VERSION__,
        gitSha: __GIT_SHA__,
        buildTimestamp: __BUILD_TIMESTAMP__,
        // why: toISOString() here is a client-layer diagnostic timestamp for the
        // export moment, outside the engine determinism boundary (which governs
        // packages/game-engine only).
        capturedAtIso: new Date(capturedAtMs).toISOString(),
        locationHref: redactedHref,
        matchId: params.get('match'),
        playerId: params.get('player'),
        userAgent: navigator.userAgent,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        entryDroppedCount: getDroppedEntryCount(),
      };
    }

    /**
     * Triggers a browser file download of the serialized report via a transient
     * object-URL anchor.
     *
     * @param fileName   The `.json` download file name.
     * @param serialized The serialized report payload.
     */
    function triggerDownload(fileName: string, serialized: string): void {
      const blob = new Blob([serialized], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    }

    /**
     * Copies the serialized report to the clipboard when the API is available.
     *
     * @param serialized The serialized report payload.
     */
    async function copyToClipboardBestEffort(serialized: string): Promise<void> {
      // why: the clipboard write is best-effort — when the API is absent it is
      // skipped, and a rejection (permissions, focus) is swallowed so it never
      // blocks the file download, which is the primary share path.
      if (typeof navigator.clipboard?.writeText !== 'function') {
        return;
      }
      try {
        await navigator.clipboard.writeText(serialized);
      } catch (clipboardError) {
        // why: a clipboard rejection is intentionally swallowed; the download
        // already delivered the report.
      }
    }

    /**
     * Click handler: reads the clock once, builds + serializes the report,
     * downloads it, and best-effort copies it to the clipboard.
     */
    function onDownloadDiagnostics(): void {
      // why: Date.now() is read once at click and threaded into both the file
      // name and the context envelope; the pure builders never read the clock.
      const capturedAtMs = Date.now();
      const context = collectContext(capturedAtMs);
      const entries = getDiagnosticEntries();
      const report = buildDiagnosticReport(entries, context);
      const serialized = serializeDiagnosticReport(report);
      const fileName = buildDiagnosticFileName(context.matchId, capturedAtMs);
      triggerDownload(fileName, serialized);
      void copyToClipboardBestEffort(serialized);
    }

    return { onDownloadDiagnostics };
  },
});
</script>

<template>
  <button
    type="button"
    class="diagnostic-export-button"
    data-testid="diagnostic-export-button"
    @click="onDownloadDiagnostics"
  >
    Download diagnostics
  </button>
</template>

<style scoped>
.diagnostic-export-button {
  position: fixed;
  bottom: 4px;
  left: 8px;
  font-size: 11px;
  font-family: monospace;
  padding: 2px 6px;
  opacity: 0.5;
  color: #aaa;
  background: transparent;
  border: 1px solid #555;
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
  z-index: 50;
}

.diagnostic-export-button:hover {
  opacity: 0.9;
}
</style>
