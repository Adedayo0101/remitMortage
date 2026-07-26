"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { QuorumProgressBar } from "./governance/QuorumProgressBar";
import { fetchMilestoneSigningStatus, MilestoneSigningStatus } from "@/lib/milestoneSigning";

export interface MilestoneSigningProgressPanelProps {
  proposalId: string;
  /** Called exactly once, the first time the proposal crosses quorum. */
  onFullyApproved?: () => void;
  /** Poll interval in ms while the proposal is still open. Exposed for tests. */
  pollIntervalMs?: number;
}

function shortAddress(address: string): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function MilestoneSigningProgressPanel({
  proposalId,
  onFullyApproved,
  pollIntervalMs = 3000,
}: MilestoneSigningProgressPanelProps) {
  const [status, setStatus] = useState<MilestoneSigningStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasNotifiedApproval = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const latest = await fetchMilestoneSigningStatus(proposalId);
      setStatus(latest);
      setError(null);

      if (latest.status === "Passed" && !hasNotifiedApproval.current) {
        hasNotifiedApproval.current = true;
        onFullyApproved?.();
      }
    } catch {
      setError("Unable to load signing status. Retrying…");
    }
  }, [proposalId, onFullyApproved]);

  useEffect(() => {
    void refresh();

    const interval = setInterval(() => {
      void refresh();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  if (!status) {
    return (
      <div
        data-testid="signing-progress-loading"
        className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-muted)]"
      >
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading signing status…
      </div>
    );
  }

  const quorumPercent = Math.round((status.requiredWeight / status.totalWeight) * 100);
  const isFullyApproved = status.status === "Passed";

  return (
    <div
      data-testid="signing-progress-panel"
      className="mt-4 space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Multisig Signing Progress
        </p>
        {error && <span className="text-xs text-amber-500">{error}</span>}
      </div>

      <QuorumProgressBar
        currentVotes={status.currentWeight}
        requiredVotes={status.requiredWeight}
        quorumThresholdPercent={quorumPercent}
      />

      <ul className="space-y-1.5">
        {status.signers.map((signer) => (
          <li
            key={signer.address}
            data-testid="signer-row"
            data-status={signer.status}
            className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              {signer.status === "approved" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                  <span
                    data-testid="pending-signer-pulse"
                    className="absolute h-full w-full animate-ping rounded-full bg-amber-400/40"
                  />
                  <Clock className="relative h-4 w-4 text-amber-500" />
                </span>
              )}
              <span className="truncate text-sm text-[var(--text-secondary)]">{signer.label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">
                {shortAddress(signer.address)} · weight {signer.weight}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 font-semibold ${
                  signer.status === "approved"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-500"
                }`}
              >
                {signer.status === "approved" ? "Signed" : "Awaiting review"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {isFullyApproved && (
        <p
          data-testid="disbursement-unlocked-banner"
          className="flex items-center gap-2 text-sm font-semibold text-emerald-400"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Quorum reached — disbursement unlocked
        </p>
      )}
    </div>
  );
}
