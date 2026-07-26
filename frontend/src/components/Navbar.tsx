"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useWallet } from "../context/WalletContext";
import { useNotifications } from "@/context/NotificationContext";
import { describeNetworkMismatch } from "../lib/wallet-errors";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";

function shorten(pk: string) {
  return `${pk.slice(0, 6)}...${pk.slice(-4)}`;
}

const NAV_LINKS = [
  { href: "/verify", labelKey: "verify" },
  { href: "/dashboard", labelKey: "dashboard" },
  { href: "/invest", labelKey: "invest" },
  { href: "/repay", labelKey: "repay" },
  { href: "/contractor", labelKey: "contractor" },
  { href: "/governance", labelKey: "governance" },
  { href: "/history", labelKey: "history" },
];

function InnerNavbar() {
  const {
    publicKey,
    isConnected,
    usdcBalance,
    connect,
    disconnect,
    wrongNetwork,
    network,
    walletType,
    walletError,
    clearError,
    isConnecting,
  } = useWallet();
  const { unreadCount, togglePanel } = useNotifications();
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);

  // A disconnect detected by the wallet watcher clears publicKey and balance,
  // so the button below falls back to the Connect Wallet CTA on its own.
  const showDisconnectNotice = !!walletError && !isConnected;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#060913]/80 backdrop-blur-xl border-b border-slate-800/80 shadow-lg shadow-black/40">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 hover:opacity-90 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 via-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
                className="w-5 h-5"
              >
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
              <a
                href="/developer-playground"
                className="text-amber-400 hover:text-amber-300 font-semibold px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-xs transition-colors"
              >
                {t("playground")}
              </a>
            )}
            {NAV_LINKS.map(({ href, labelKey }) => (
              <a
                key={href}
                href={href}
                className="text-slate-300 font-medium tracking-wide hover:text-cyan-400 transition-colors"
              >
                {t(labelKey)}
              </a>
            ))}
          </nav>

          {/* Desktop Wallet */}
          <div className="hidden lg:flex items-center gap-3">
            <LocaleSwitcher />
            <NotificationButton unreadCount={unreadCount} onClick={togglePanel} />
            <WalletButton
              isConnected={isConnected}
              publicKey={publicKey}
              usdcBalance={usdcBalance}
              walletType={walletType}
              isConnecting={isConnecting}
              connect={connect}
              disconnect={disconnect}
            />
          </div>

          {/* Mobile hamburger */}
          <div className="flex lg:hidden items-center gap-3">
            <LocaleSwitcher />
            <NotificationButton unreadCount={unreadCount} onClick={togglePanel} compact />
            <WalletButton
              isConnected={isConnected}
              publicKey={publicKey}
              usdcBalance={usdcBalance}
              walletType={walletType}
              isConnecting={isConnecting}
              connect={connect}
              disconnect={disconnect}
            />
            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-2 rounded-lg text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              {menuOpen ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-6 h-6"
                  aria-hidden="true"
                >
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
              {t("playground")}
            </a>
          )}
          {NAV_LINKS.map(({ href, labelKey }) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="py-3 px-4 rounded-xl text-slate-200 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors text-base font-medium"
            >
              {t(labelKey)}
            </a>
          ))}
        </nav>
      </div>

      {wrongNetwork && (
        <div
          role="alert"
          className="fixed top-20 left-0 right-0 z-40 bg-amber-500/20 text-amber-300 border-b border-amber-500/30 text-center py-2 text-xs font-semibold backdrop-blur-md"
        >
          ⚠️ {describeNetworkMismatch(network)}
        </div>
      )}

      {showDisconnectNotice && (
        <div
          role="alert"
          className="fixed left-0 right-0 z-40 flex flex-wrap items-center justify-center gap-3 border-b border-red-500/30 bg-red-500/15 py-2 text-xs font-semibold text-red-200 backdrop-blur-md"
          style={{ top: wrongNetwork ? "5.75rem" : "5rem" }}
        >
          <span>{walletError?.message}</span>
          <button
            type="button"
            onClick={() => connect()}
            className="rounded-md border border-red-400/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-red-100 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
          >
            Reconnect
          </button>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss wallet notice"
            className="text-red-300/70 transition-colors hover:text-red-100"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

interface WalletButtonProps {
  isConnected: boolean;
  publicKey: string | null;
  usdcBalance: string | null;
  /** Type of active wallet, used to show the correct badge. */
  walletType: "stellar" | "evm" | "solana" | null;
  isConnecting: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => void;
}

function WalletButton({
  isConnected,
  publicKey,
  usdcBalance,
  walletType,
  isConnecting,
  connect,
  disconnect,
}: WalletButtonProps) {
  const t = useTranslations("nav");
  if (!isConnected) {
    return (
      <button
        onClick={() => connect()}
        disabled={isConnecting}
        className="btn-cta !py-2.5 !px-4 !text-xs md:!text-sm shadow-cyan-500/20 disabled:opacity-50"
      >
        {isConnecting ? "Connecting…" : t("connectWallet")}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {walletType === "stellar" ? (
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
      <span
        title={publicKey ?? "Connected"}
        className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-200 font-mono"
      >
        {publicKey ? shorten(publicKey) : "Connected"}
      </span>
      <button onClick={disconnect} className="btn-ghost text-xs hover:text-red-400">
        {t("disconnect")}
      </button>
    </div>
  );
}

function NotificationButton({
  unreadCount,
  onClick,
  compact = false,
}: {
  unreadCount: number;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
      className={`relative inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900/70 text-slate-200 transition-colors hover:border-cyan-400/40 hover:text-cyan-300 ${
        compact ? "h-10 w-10" : "h-11 w-11"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={compact ? "h-4.5 w-4.5" : "h-5 w-5"}
        aria-hidden="true"
      >
        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.172V11a6 6 0 1 0-12 0v3.172a2.032 2.032 0 0 1-.595 1.423L4 17h5" />
        <path d="M9.73 21a2 2 0 0 0 3.54 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950 shadow-lg shadow-cyan-400/30">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}

export default function Navbar() {
  return <InnerNavbar />;
}
