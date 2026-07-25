"use client";

import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { X, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useTransactionMonitor } from "../hooks/useTransactionMonitor";
import { buildDepositTx, signAndSubmit } from "../lib/soroban";
import {
  formatTransactionErrorMessage,
  type TransactionModalPhase,
} from "../lib/transaction-status";
import TransactionModal from "./tx/TransactionModal";
import { useXlmPrice } from "../hooks/useXlmPrice";
import { useGasEstimate } from "../hooks/useGasEstimate";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function DepositModal({ isOpen, onClose }: Props) {
  const { publicKey, usdcBalance } = useWallet();
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [txXdr, setTxXdr] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txPhase, setTxPhase] = useState<TransactionModalPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const txMonitor = useTransactionMonitor(txHash ?? undefined);

  function resetTransactionState() {
    setTxPhase("idle");
    setTxHash(null);
    setTxError(null);
  }

  function handleTransactionModalClose() {
    const wasSuccessful = txPhase === "success";
    resetTransactionState();

    if (wasSuccessful) {
      setAmount("");
      setDebouncedAmount("");
      setTxXdr(null);
      onClose();
    }
  }

  useEffect(() => {
    if (txPhase !== "pending" || !txHash) return;

    if (txMonitor.phase === "confirmed") {
      setTxPhase("success");
      return;
    }

    if (txMonitor.phase === "failed") {
      setTxError(txMonitor.contractError || "The transaction reverted on-chain.");
      setTxPhase("error");
      return;
    }

    if (txMonitor.pollError) {
      setTxError(txMonitor.pollError);
      setTxPhase("error");
    }
  }, [txHash, txMonitor.contractError, txMonitor.phase, txMonitor.pollError, txPhase]);

  if (!isOpen) return null;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(amount), 500);
    return () => clearTimeout(timer);
  }, [amount]);

  const xlmPrice = useXlmPrice();
  const gasEstimate = useGasEstimate(txXdr, xlmPrice);

  const balanceNum = parseFloat(usdcBalance || "0");
  const amountNum = parseFloat(debouncedAmount) || 0;
  const exceedsBalance = amountNum > balanceNum;
  const valid = amountNum > 0 && !exceedsBalance;

  useEffect(() => {
    if (!valid || !publicKey) {
      setTxXdr(null);
      return;
    }
    let active = true;
    setEstimating(true);
    buildDepositTx(publicKey, debouncedAmount)
      .then((xdr) => {
        if (active) setTxXdr(xdr);
      })
      .catch((e) => {
        if (active) setTxXdr(null);
      })
      .finally(() => {
        if (active) setEstimating(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedAmount, publicKey, valid]);

  async function handleConfirm() {
    if (!valid || !publicKey || !txXdr) return;
    setSubmitting(true);
    setTxError(null);
    setTxHash(null);
    setTxPhase("signing");
    try {
      const hash = await signAndSubmit(txXdr);
      setTxHash(hash);
      setTxPhase("pending");
    } catch (error) {
      setTxError(formatTransactionErrorMessage(error));
      setTxPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xl rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Deposit USDC</h2>
          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                }}
                className="w-full p-3 pr-20 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-lg font-mono outline-none focus:border-[var(--accent-primary)] transition-colors"
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

          {gasEstimate ? (
            <div className="p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
              <div className="flex items-center gap-2 mb-2 text-sm text-[var(--text-primary)] font-semibold">
                <ArrowRight className="w-4 h-4 text-[var(--accent-primary)]" />
                Transaction Fee Estimate
              </div>
              <div className="space-y-1 pl-6">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Standard</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    ~${gasEstimate.standardFeeUsd} <span className="text-[var(--text-muted)] text-xs">({gasEstimate.standardFeeXlm} XLM)</span>
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">High Congestion</span>
                  <span className="text-[var(--text-primary)] font-mono">
                    ~${gasEstimate.highFeeUsd} <span className="text-[var(--text-muted)] text-xs">({gasEstimate.highFeeXlm} XLM)</span>
                  </span>
                </div>
              </div>
            </div>
          ) : estimating ? (
            <div className="flex items-center justify-center p-4 text-sm text-[var(--text-secondary)]">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-[var(--accent-primary)]" />
              Estimating network fee...
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={!valid || estimating || !txXdr || submitting}
              className="w-full btn-primary justify-center disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Confirm & Sign
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
