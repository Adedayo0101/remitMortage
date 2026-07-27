"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import loadDynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useWallet } from "../../context/WalletContext";
import SavingsProgressCard from "../../components/SavingsProgressCard";
import LoanStatusCard from "../../components/LoanStatusCard";
import DepositModal from "../../components/DepositModal";
import WithdrawModal from "../../components/WithdrawModal";
import MilestoneTimeline, { type MilestoneNode } from "../../components/MilestoneTimeline";
import {
  consumeTxSuccessFeedback,
  shortenAddress,
  STELLARCHAIN_TX_BASE,
} from "../../lib/transaction-status";
import {
  createStatementMetadata,
  downloadStatementPdf,
  type StatementRow,
} from "@/lib/statementExport";

const Navbar = loadDynamic(() => import("../../components/Navbar"), { ssr: false });

type BorrowerStatus = {
  address: string;
  escrow: { deposited: string; target: string; progress: number };
  loan: { status: string; principal: string; disbursed: string; repaid: string };
};

const SAMPLE_MILESTONES: MilestoneNode[] = [
  {
    id: "m1",
    title: "Foundation Inspection",
    state: "Disbursed",
    scheduledDate: "2026-03-15",
    completedDate: "2026-03-14",
    description: "Structural foundation inspection and soil report verification.",
    evidence: [
      { label: "Inspection Report (PDF)", url: "ipfs://QmX1...foundation" },
      { label: "Soil Analysis", url: "https://example.com/soil-report" },
    ],
    voters: [
      { address: "GABC...1234", vote: "yes", weight: 40 },
      { address: "GDEF...5678", vote: "yes", weight: 35 },
      { address: "GHIJ...9012", vote: "abstain", weight: 25 },
    ],
  },
  {
    id: "m2",
    title: "Framing Completion",
    state: "Approved",
    scheduledDate: "2026-05-01",
    completedDate: "2026-04-28",
    description: "Wall framing, roof trusses, and window installation verified.",
    evidence: [
      { label: "Framing Photos", url: "ipfs://QmY2...framing" },
      { label: "Contractor Sign-off", url: "ipfs://QmZ3...signoff" },
    ],
    voters: [
      { address: "GABC...1234", vote: "yes", weight: 40 },
      { address: "GDEF...5678", vote: "yes", weight: 35 },
      { address: "GHIJ...9012", vote: "yes", weight: 25 },
    ],
  },
  {
    id: "m3",
    title: "Plumbing & Electrical",
    state: "Voting",
    scheduledDate: "2026-06-15",
    description: "Full plumbing rough-in and electrical wiring inspection.",
    evidence: [{ label: "Plumbing Permit", url: "ipfs://QmA4...plumbing" }],
    voters: [
      { address: "GABC...1234", vote: "yes", weight: 40 },
      { address: "GDEF...5678", vote: "no", weight: 35 },
      { address: "GHIJ...9012", vote: "yes", weight: 25 },
    ],
  },
  {
    id: "m4",
    title: "Final Finishes",
    state: "Proposed",
    scheduledDate: "2026-08-01",
    description: "Interior paint, flooring, fixtures, and final walkthrough.",
  },
  {
    id: "m5",
    title: "Occupancy Permit",
    state: "Proposed",
    scheduledDate: "2026-09-01",
    description: "Certificate of occupancy issued by local authority.",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { publicKey, isConnected } = useWallet();
  const [status, setStatus] = useState<BorrowerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<{ hash: string; type: string } | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneNode[]>([]);

  function buildDashboardStatement() {
    if (!publicKey || !status) return null;

    const rows: StatementRow[] = milestones.map((milestone) => ({
      date: milestone.completedDate ?? milestone.scheduledDate,
      type: milestone.state,
      amount: milestone.title,
      status: milestone.state,
      reference: milestone.id,
      counterparty:
        milestone.voters?.map((voter) => shortenAddress(voter.address)).join(", ") ||
        "Protocol governance",
      notes: milestone.description,
    }));

    return {
      title: "RemitMortgage Borrower Statement",
      subtitle:
        "Escrow savings, loan status, and milestone progress for mortgage underwriting review.",
      metadata: createStatementMetadata({
        borrowerName: `Wallet ${shortenAddress(publicKey)}`,
        borrowerAddress: publicKey,
        walletType: "Freighter / Stellar",
      }),
      summary: [
        { label: "Escrow deposited", value: `${status.escrow.deposited} USDC` },
        { label: "Escrow target", value: `${status.escrow.target} USDC` },
        { label: "Escrow progress", value: `${status.escrow.progress}%` },
        { label: "Loan principal", value: `${status.loan.principal} USDC` },
        { label: "Loan disbursed", value: `${status.loan.disbursed} USDC` },
        { label: "Loan repaid", value: `${status.loan.repaid} USDC` },
      ],
      rows,
    };
  }

  function handleDownloadStatement() {
    const payload = buildDashboardStatement();
    if (!payload) return;

    downloadStatementPdf(payload, `remitmortgage-borrower-statement-${Date.now()}.pdf`);
  }

  useEffect(() => {
    const feedback = consumeTxSuccessFeedback();
    if (feedback) {
      setTxSuccess(feedback);
    }
  }, []);

  useEffect(() => {
    if (!isConnected) {
      router.push("/");
      return;
    }

    if (!publicKey) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/borrower/${publicKey}/status`);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.json();
        setStatus(data);
        setMilestones(SAMPLE_MILESTONES);
      } catch (e: any) {
        setError(e?.message || "Failed to load borrower status");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [isConnected, publicKey, router]);

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 pt-32">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase tracking-wider">
                Soroban Escrow Protocol
              </span>
              <span className="text-xs text-slate-400 font-mono">Stellar Testnet</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
              Borrower <span className="gradient-text">Dashboard</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Track your 30% down-payment escrow savings, accrued protocol yield, and mortgage
              milestone disbursements.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadStatement}
              disabled={!status}
              className="btn-outline-blue disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download Statement
            </button>
            <button onClick={() => setShowDeposit(true)} className="btn-cta shadow-cyan-500/20">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Deposit USDC
            </button>
            <button onClick={() => setShowWithdraw(true)} className="btn-outline-blue">
              Early Exit
            </button>
          </div>
        </div>

        {/* Transaction Success Feedback */}
        {txSuccess && (
          <div
            role="status"
            className="mb-8 p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg"
          >
            <div>
              <p className="text-sm font-bold text-emerald-300 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                {txSuccess.type} confirmed successfully
              </p>
              <p className="text-xs text-emerald-400/80 mt-0.5 font-mono">
                Transaction {shortenAddress(txSuccess.hash)} is finalized on Soroban ledger.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`${STELLARCHAIN_TX_BASE}${txSuccess.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-cyan-400 hover:underline"
              >
                View Explorer &rarr;
              </a>
              <button
                type="button"
                onClick={() => setTxSuccess(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
            <div className="h-64 rounded-2xl bg-slate-900 border border-slate-800" />
            <div className="h-64 rounded-2xl bg-slate-900 border border-slate-800" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-6 bg-red-500/10 text-red-300 border border-red-500/20 rounded-2xl text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Loaded Content */}
        {!loading && !error && status && (
          <div className="space-y-8">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Escrow Deposited
                </span>
                <div className="text-2xl font-extrabold text-cyan-400 mt-1 font-mono">
                  ${Number(status.escrow.deposited).toLocaleString()} USDC
                </div>
              </div>
              <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Target Down Payment
                </span>
                <div className="text-2xl font-extrabold text-white mt-1 font-mono">
                  ${Number(status.escrow.target).toLocaleString()} USDC
                </div>
              </div>
              <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Escrow Progress
                </span>
                <div className="text-2xl font-extrabold text-emerald-400 mt-1 font-mono">
                  {status.escrow.progress}%
                </div>
              </div>
              <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Loan Principal
                </span>
                <div className="text-2xl font-extrabold text-indigo-400 mt-1 font-mono">
                  ${Number(status.loan.principal).toLocaleString()} USDC
                </div>
              </div>
            </div>

            {/* Savings & Loan Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
                <SavingsProgressCard
                  deposited={status.escrow.deposited}
                  target={status.escrow.target}
                  progress={status.escrow.progress}
                  shareId={publicKey ?? undefined}
                />
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl flex flex-col justify-between">
                <LoanStatusCard loan={status.loan} />
                <div className="mt-6 pt-6 border-t border-slate-800 flex gap-3">
                  <button
                    onClick={() => setShowDeposit(true)}
                    className="btn-cta flex-1 justify-center"
                  >
                    Deposit Savings
                  </button>
                  <button
                    onClick={() => router.push("/repay")}
                    className="btn-outline-blue flex-1 justify-center"
                  >
                    Repay Installments &rarr;
                  </button>
                </div>
              </div>
            </div>

            {/* Milestone Timeline */}
            {milestones.length > 0 && (
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Loan Milestone Timeline</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time status of construction disbursements gated by IPFS proof and
                      multisig approval.
                    </p>
                  </div>
                  <a
                    href="/contractor"
                    className="text-xs font-semibold text-cyan-400 hover:underline"
                  >
                    Contractor Portal &rarr;
                  </a>
                </div>
                <MilestoneTimeline milestones={milestones} title="" />
              </div>
            )}
          </div>
        )}

        <DepositModal isOpen={showDeposit} onClose={() => setShowDeposit(false)} />
        <WithdrawModal
          isOpen={showWithdraw}
          onClose={() => setShowWithdraw(false)}
          deposited={status?.escrow.deposited || "0"}
        />
      </main>
    </div>
  );
}
