"use client";

import React from "react";
import dynamic from "next/dynamic";
import { OptionalWalletProvider } from "@/context/WalletContext";
import { OptionalToastProvider } from "@/context/ToastContext";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });
const MilestoneCard = dynamic(() => import("../../components/MilestoneCard"), { ssr: false });
const BuilderReputationTable = dynamic(
  () => import("../../components/BuilderReputationTable"),
  { ssr: false }
);

const MILESTONES = [
  { id: "m1", name: "Foundation", initialStage: "Pending" as const },
  { id: "m2", name: "Structure", initialStage: "Pending" as const },
  { id: "m3", name: "Roofing", initialStage: "Pending" as const },
  { id: "m4", name: "Finishing", initialStage: "Pending" as const },
];

export default function ContractorDashboard() {
  return (
    <OptionalToastProvider>
      <OptionalWalletProvider>
        <ContractorDashboardInner />
      </OptionalWalletProvider>
    </OptionalToastProvider>
  );
}

function ContractorDashboardInner() {
  return (
    <main className="rm-app-page rm-contractor-page min-h-screen bg-[#060913] text-slate-100 pb-20">
      <Navbar />

      <div className="rm-contractor-shell pt-32 px-6 max-w-7xl mx-auto">
        <div className="mb-10">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4 border border-cyan-500/20">
            Soroban Milestone Disbursement Hub
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white mb-2">
            Contractor Portal
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-2xl">
            Upload construction inspection evidence to IPFS, request disbursement approvals, and
            track multisig voting status.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {MILESTONES.map((milestone) => (
            <MilestoneCard
              key={milestone.id}
              id={milestone.id}
              name={milestone.name}
              initialStage={milestone.initialStage}
            />
          ))}
        </div>

        <BuilderReputationTable />
      </div>
    </main>
  );
}
