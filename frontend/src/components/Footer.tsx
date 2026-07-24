"use client";

import React from "react";

export default function Footer() {
  return (
    <footer className="bg-[#040711] border-t border-slate-800/80 text-slate-400 py-16 px-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-cyan-500/5 blur-3xl pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 relative z-10">
        {/* Brand Column */}
        <div className="space-y-4 md:col-span-1">
          <a href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" className="w-5 h-5">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Remit<span className="text-cyan-400">Mortgage</span>
            </span>
          </a>
          <p className="text-xs text-slate-400 leading-relaxed">
            Unlocking home ownership for diaspora communities through transparent, on-chain remittance history and non-custodial Soroban smart contract escrow.
          </p>
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Stellar Horizon Testnet • Active</span>
          </div>
        </div>

        {/* Protocol Links */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Protocol</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="/verify" className="hover:text-cyan-400 transition-colors">Remittance Verification</a></li>
            <li><a href="/dashboard" className="hover:text-cyan-400 transition-colors">Down-Payment Escrow</a></li>
            <li><a href="/invest" className="hover:text-cyan-400 transition-colors">DeFi Lending Pool</a></li>
            <li><a href="/repay" className="hover:text-cyan-400 transition-colors">Mortgage Repayments</a></li>
          </ul>
        </div>

        {/* Governance & Ops */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Governance & Ops</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="/contractor" className="hover:text-cyan-400 transition-colors">Contractor Evidence Hub</a></li>
            <li><a href="/governance" className="hover:text-cyan-400 transition-colors">Multisig Milestone Approval</a></li>
            <li><a href="/history" className="hover:text-cyan-400 transition-colors">On-Chain Audit Trail</a></li>
            <li><a href="/analytics" className="hover:text-cyan-400 transition-colors">Protocol Analytics</a></li>
          </ul>
        </div>

        {/* Stellar & Soroban Specs */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Ecosystem</h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Built on Stellar Horizon API and Soroban Smart Contracts. Settlements execute in 3-5 seconds with instant finality in USDC.
          </p>
          <div className="pt-1 flex items-center gap-3">
            <a
              href="https://stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-medium"
            >
              Stellar.org ↗
            </a>
            <span className="text-slate-700">•</span>
            <a
              href="https://soroban.stellar.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              Soroban Docs ↗
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-800/60 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div>© 2026 RemitMortgage Protocol. Open Source & Non-Custodial.</div>
        <div className="flex items-center gap-6">
          <span>Terms of Service</span>
          <span>Privacy Policy</span>
          <span>Security Audit</span>
        </div>
      </div>
    </footer>
  );
}
