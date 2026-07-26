"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { X, Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useTransactionMonitor } from "../hooks/useTransactionMonitor";
import { buildDepositTx, signAndSubmit, type GasConfig, type SimulationEstimate } from "../lib/soroban";
import {
  formatTransactionErrorMessage,
  type TransactionModalPhase,
} from "../lib/transaction-status";
import TransactionModal from "./tx/TransactionModal";
import GasConfigPanel from "./tx/GasConfigPanel";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function DepositModal({ isOpen, onClose }: Props) {
  const { publicKey, usdcBalance } = useWallet();
  const [amount, setAmount] = useState("");

  // ── Gas config state ──────────────────────────────────────────────────────
  const [gasConfig, setGasConfig] = useState<GasConfig>({});
  const [simEstimate, setSimEstimate] = useState<SimulationEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  // ── Transaction lifecycle ─────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [txPhase, setTxPhase] = useState<TransactionModalPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const txMonitor = useTransactionMonitor(txHash ?? undefined);

  // Reset all local state when the modal is closed.
  function resetAll() {
    setAmount("");
    setGasConfig({});
    setSimEstimate(null);
    setEstimating(false);
    setTxPhase("idle");
    setTxHash(null);
    setTxError(null);
    setSubmitting(false);
  }

  function handleTransactionModalClose() {
    const wasSuccessful = txPhase === "success";
    setTxPhase("idle");
    setTxHash(null);
    setTxError(null);
    if (wasSuccessful) {
      resetAll();
      onClose();
    }
  }

  // Watch on-chain confirmation.
  useEffect(() => {
    if (txPhase !== "pending" || !txHash) return;
    if (txMonitor.phase === "confirmed") { setTxPhase("success"); return; }
    if (txMonitor.phase === "failed") {
      setTxError(txMonitor.contractError || "The transaction reverted on-chain.");
      setTxPhase("error"); return;
    }
    if (txMonitor.pollError) { setTxError(txMonitor.pollError); setTxPhase("error"); }
  }, [txHash, txMonitor.contractError, txMonitor.phase, txMonitor.pollError, txPhase]);

  // Clear estimate when amount changes so stale numbers are not shown.
  useEffect(() => { setSimEstimate(null); }, [amount]);

  if (!isOpen) return null;

  const balanceNum = parseFloat(usdcBalance || "0");
  const amountNum = parseFloat(amount) || 0;
  const exceedsBalance = amountNum > balanceNum;
  const valid = amountNum > 0 && !exceedsBalance;

  // ── Handlers ───────────────────────────────────────────────────────────────

  /**
   * Run a dry-run simulation to populate the GasConfigPanel with real
   * estimates before the user commits to signing.
   */
  async function handleEstimate() {
    if (!valid || !publicKey) return;
    setEstimating(true);
    setSimEstimate(null);
    try {
      const { estimate } = await buildDepositTx(publicKey, amount, gasConfig);
      setSimEstimate(estimate);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Estimation failed");
    } finally {
      setEstimating(false);
    }
  }

  async function handleConfirm() {
    if (!valid || !publicKey) return;
    setSubmitting(true);
    setTxError(null);
    setTxHash(null);
    setTxPhase("simulating");
    try {
      // Build (and apply any gas overrides) then sign + submit.
      const { xdr, estimate } = await buildDepositTx(publicKey, amount, gasConfig);
      // Update the estimate panel even if the user didn't run Estimate first.
      setSimEstimate(estimate);
      setTxPhase("signing");
      const hash = await signAndSubmit(xdr);
      setTxHash(hash);
      setTxPhase("pending");
    } catch (error) {
      setTxError(formatTransactionErrorMessage(error));
      setTxPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = submitting || txPhase !== "idle";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Deposit USDC</h2>
          <button
            onClick={onClose}
            aria-label="Close deposit modal"
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount input */}
          <div>
            <label
              htmlFor="deposit-amount"
              className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                id="deposit-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                disabled={isLocked}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 pr-20 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-lg font-mono outline-none focus:border-[var(--accent-primary)] transition-colors disabled:opacity-40"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
                USDC
              </span>
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-[var(--text-muted)]">
                Balance: {usdcBalance || "—"} USDC
              </span>
              {exceedsBalance && (
                <span className="text-xs text-[var(--error)] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Insufficient balance
                </span>
              )}
            </div>
          </div>

          {/* ── Gas config panel ─────────────────────────────────────────── */}
          <GasConfigPanel
            estimate={simEstimate}
            value={gasConfig}
            onChange={setGasConfig}
            disabled={isLocked}
          />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleEstimate}
              disabled={!valid || estimating || isLocked}
              className="flex-1 btn-outline justify-center gap-2 disabled:opacity-40"
            >
              {estimating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Zap className="w-4 h-4" />}
              {estimating ? "Estimating…" : "Estimate Gas"}
            </button>

            <button
              onClick={handleConfirm}
              disabled={!valid || submitting || isLocked}
              className="flex-1 btn-primary justify-center disabled:opacity-40"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              {submitting ? "Processing…" : "Confirm & Sign"}
            </button>
          </div>
        </div>
      </div>

      <TransactionModal
        isOpen={txPhase !== "idle"}
        phase={txPhase}
        transactionType="Deposit"
        hash={txHash}
        errorMessage={txError}
        onClose={handleTransactionModalClose}
      />
    </div>
  );
}
