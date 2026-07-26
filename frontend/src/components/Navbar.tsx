"use client";

import React, { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { WalletSelectModal } from "./WalletSelectModal";

function shorten(pk: string) {
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

const NAV_LINKS = [
  { href: "/verify", label: "Verify" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/invest", label: "Invest Pool" },
  { href: "/repay", label: "Repay" },
  { href: "/contractor", label: "Contractor" },
  { href: "/governance", label: "Governance" },
  { href: "/history", label: "Audit Log" },
];

function InnerNavbar() {
  const { publicKey, isConnected, usdcBalance, walletType, disconnect, wrongNetwork } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#060913]/80 backdrop-blur-xl border-b border-slate-800/80 shadow-lg shadow-black/40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 hover:opacity-90 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" className="w-5 h-5">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Remit<span className="text-cyan-400">Mortgage</span>
            </span>
          </a>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm">
            {process.env.NODE_ENV !== "production" && (
              <a href="/developer-playground" className="text-amber-400 hover:text-amber-300 font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-xs transition-colors">
                Playground
              </a>
            )}
            {NAV_LINKS.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-slate-300 font-medium tracking-wide hover:text-cyan-400 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Desktop Wallet */}
          <div className="hidden lg:flex items-center gap-3">
            <WalletButton isConnected={isConnected} publicKey={publicKey} usdcBalance={usdcBalance} walletType={walletType} openModal={() => setWalletModalOpen(true)} disconnect={disconnect} />
          </div>

          {/* Mobile hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            <WalletButton isConnected={isConnected} publicKey={publicKey} usdcBalance={usdcBalance} walletType={walletType} openModal={() => setWalletModalOpen(true)} disconnect={disconnect} />
            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-2 rounded-lg text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              {menuOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-Out Drawer */}
      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation"
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-[#0b0f1d] border-l border-slate-800 flex flex-col pt-24 pb-8 px-6 lg:hidden transition-transform duration-300 ease-in-out ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-2">
          {process.env.NODE_ENV !== "production" && (
            <a
              href="/developer-playground"
              onClick={() => setMenuOpen(false)}
              className="py-3 px-3 rounded-lg text-amber-400 bg-amber-500/10 border border-amber-500/20 text-sm font-semibold"
            >
              Playground
            </a>
          )}
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="py-3 px-4 rounded-xl text-slate-200 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors text-base font-medium"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      {wrongNetwork && (
        <div className="fixed top-20 left-0 right-0 z-40 bg-amber-500/20 text-amber-300 border-b border-amber-500/30 text-center py-2 text-xs font-semibold backdrop-blur-md">
          ⚠️ Connected to non-testnet account. Please switch your Stellar wallet to Stellar Testnet.
        </div>
      )}

      {/* Stellar wallet picker — Freighter or Ledger */}
      <WalletSelectModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        onConnected={() => setWalletModalOpen(false)}
      />
    </>
  );
}

interface WalletButtonProps {
  isConnected: boolean;
  publicKey: string | null;
  usdcBalance: string | null;
  /** Type of active Stellar wallet, used to show the correct badge. */
  walletType: "stellar" | "ledger" | "evm" | "solana" | null;
  /** Opens the WalletSelectModal to choose Freighter or Ledger. */
  openModal: () => void;
  disconnect: () => void;
}

function WalletButton({ isConnected, publicKey, usdcBalance, walletType, openModal, disconnect }: WalletButtonProps) {
  if (!isConnected) {
    return (
      <button onClick={openModal} className="btn-cta !py-2.5 !px-4 !text-xs md:!text-sm shadow-cyan-500/20">
        Connect Wallet
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {/* Wallet-type badge — amber for Ledger, cyan for Freighter */}
      {walletType === "ledger" ? (
        <span
          title="Connected via Ledger hardware wallet"
          className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-md"
        >
          {/* Ledger chip icon */}
          <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3" aria-hidden="true">
            <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <rect x="3" y="5" width="3" height="4" rx="0.4" fill="currentColor" />
          </svg>
          Ledger
        </span>
      ) : walletType === "stellar" ? (
        <span
          title="Connected via Freighter"
          className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 uppercase tracking-wider px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-md"
        >
          <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3" aria-hidden="true">
            <circle cx="7" cy="7" r="6" />
          </svg>
          Freighter
        </span>
      ) : null}

      <div className="text-xs md:text-sm text-cyan-400 font-semibold px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
        {usdcBalance != null ? `${usdcBalance} USDC` : "—"}
      </div>
      <button
        onClick={openModal}
        title="Manage wallet"
        className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-200 font-mono hover:border-cyan-500/50 transition-colors"
      >
        {publicKey ? shorten(publicKey) : "Connected"}
      </button>
      <button onClick={disconnect} className="btn-ghost text-xs hover:text-red-400">
        Disconnect
      </button>
    </div>
  );
}

export default function Navbar() {
  return <InnerNavbar />;
}
