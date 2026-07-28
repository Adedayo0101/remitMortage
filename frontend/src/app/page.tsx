"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import CreditCalculator from "@/components/CreditCalculator";
import YieldAnalyticsChart from "@/components/YieldAnalyticsChart";

const Navbar = dynamic(() => import("../components/Navbar"), { ssr: false });

/* ── Data ─────────────────────────────────────────────────────────── */

const STATS = [
  { value: "$2.45M+", label: "USDC Escrowed", change: "+18% this month", color: "text-cyan-400" },
  {
    value: "4.5%",
    label: "Avg Interest Rate",
    change: "Fixed via Soroban",
    color: "text-emerald-400",
  },
  {
    value: "480+",
    label: "Families Funded",
    change: "Across 4 countries",
    color: "text-indigo-400",
  },
  { value: "3.2s", label: "Horizon Finality", change: "Sub-cent fees", color: "text-purple-400" },
];

const FEATURES = [
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: "Instant Settlement",
    description:
      "USDC remittances settle in 3–5 seconds on Stellar. No delays, no hidden wire fees.",
    accent: "from-cyan-500/20 to-blue-500/20 text-cyan-400 border-cyan-500/30",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 3v18h18" />
        <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
      </svg>
    ),
    title: "Objective Credit Score",
    description:
      "Your verified on-chain payment history builds a transparent credit rating — zero traditional bias.",
    accent: "from-indigo-500/20 to-purple-500/20 text-indigo-400 border-indigo-500/30",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Non-Custodial Safety",
    description:
      "We never hold your private keys. All transactions are authorized via your own Freighter wallet.",
    accent: "from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
    title: "Soroban Smart Contracts",
    description:
      "Audited Soroban contracts hold your escrow down-payment and automate tranche disbursements.",
    accent: "from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Global Diaspora Focus",
    description:
      "Remit from anywhere worldwide. Finance family homes in Nigeria, Ghana, Kenya, and beyond.",
    accent: "from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30",
  },
  {
    icon: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "IPFS Photo Evidence",
    description:
      "Contractor progress payouts are protected by multisig votes and IPFS photo evidence.",
    accent: "from-cyan-500/20 to-emerald-500/20 text-cyan-400 border-cyan-500/30",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Verify Remittance History",
    desc: "Connect your Stellar Freighter wallet. Our backend queries Horizon API to audit your historical USDC transfers and calculate your objective credit rating.",
    badge: "Verification Layer",
  },
  {
    num: "02",
    title: "Accumulate Escrow & Earn Yield",
    desc: "Save your 30% down payment over 6–12 months into a Soroban smart contract. Your idle USDC earns yield via Soroban Blend lending integration.",
    badge: "Settlement Escrow",
  },
  {
    num: "03",
    title: "Disburse & Build Property",
    desc: "Once target is met, 70% lending pool capital releases directly to contractors in tranches, gated by IPFS photo evidence and multisig approvals.",
    badge: "Milestone Disbursements",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Been using RemitMortgage since January. My regular USDC transfers to family now build my credit score on Stellar. Truly revolutionary diaspora financing.",
    name: "Ayinde O.",
    role: "Diaspora Professional (UK -> Nigeria)",
    initials: "AO",
  },
  {
    quote:
      "Smooth, fast, and transparent! I never thought my remittance history could help me secure a mortgage for my parents in Lagos.",
    name: "Farida K.",
    role: "Software Engineer (US -> Nigeria)",
    initials: "FK",
  },
  {
    quote:
      "RemitMortgage solves the exact barrier diaspora Africans face: lack of local credit history. The Soroban escrow yield is a huge bonus.",
    name: "Luisa M.",
    role: "Healthcare Specialist (Canada -> Ghana)",
    initials: "LM",
  },
];

const FAQ_ITEMS = [
  {
    q: "What is the minimum remittance history required?",
    a: "We recommend at least 6 months of regular USDC remittances on the Stellar network to build a strong credit rating. However, even 3-month histories qualify for entry-level down-payment plans.",
  },
  {
    q: "Is my escrow savings safe?",
    a: "Yes. Down payment contributions are held in non-custodial Soroban smart contracts. Your keys remain in your Freighter wallet, and your escrowed USDC earns yield via verified DeFi lending pools.",
  },
  {
    q: "How are mortgage disbursements managed?",
    a: "Once your 30% down payment goal is reached, the remaining 70% is funded from the protocol's liquidity pool. Milestone disbursements are released to whitelisted contractors only after IPFS photo proof and multisig vote approvals.",
  },
  {
    q: "Which countries are currently supported?",
    a: "RemitMortgage currently supports property development in Nigeria, Ghana, and Kenya, with expansion planned across West & East Africa. Remittances can be sent from any country globally.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-trigger" onClick={() => setOpen(!open)} type="button">
        <span>{q}</span>
        <span className="faq-trigger-icon">
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 1v10M1 6h10" />
          </svg>
        </span>
      </button>
      <div className="faq-content">
        <p>{a}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const t = useTranslations("landing");
  const [activeTab, setActiveTab] = useState<"calculator" | "onboarding">("calculator");

  return (
    <main className="landing-page pb-12">
      <Navbar />

      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero__inner animate-fade-in-up">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            {t("heroBadge")}
          </div>

          <h1 className="hero__title">
            {t("heroTitle")}
          </h1>

          <p className="hero__subtitle">
            {t("heroSubtitle")}
          </p>

          <div className="hero__actions">
            <button
              onClick={() => {
                setActiveTab("onboarding");
                document.getElementById("tools")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="btn-cta"
            >
              Start Onboarding
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
            <a href="/verify" className="btn-outline-blue">
              {t("heroPrimaryCta")}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>

          {/* Stats Bar */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl text-left hover:border-cyan-500/30 transition-all"
              >
                <div
                  className={`text-2xl md:text-3xl font-extrabold ${s.color} font-mono tracking-tight`}
                >
                  {s.value}
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1">{s.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{s.change}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────── */}
      <section id="features" className="section section--alt">
        <div className="section__inner">
          <div className="section__header">
            <h2 className="section__title">{t("sectionTitle")}</h2>
            <p className="section__subtitle">
              Direct, non-custodial property financing backed by transparent Stellar payment rails.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl hover:border-cyan-500/40 hover:-translate-y-1 transition-all group"
              >
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.accent} border flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}
                >
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ANALYTICS ───────────────────────────────────────────── */}
      <section id="analytics" className="section">
        <div className="section__inner">
          <div className="section__header">
            <h2 className="section__title">{t("footer.protocol")}</h2>
            <p className="section__subtitle">Transparent historical growth of Total Value Locked and average Yield metrics.</p>
          </div>
          
          <YieldAnalyticsChart />
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────── */}
      <section id="how-it-works" className="section section--dark">
        <div className="section__inner">
          <div className="section__header">
            <h2 className="section__title">{t("sectionTitle")}</h2>
            <p className="section__subtitle">
              Three automated phases that turn historical payments into property ownership.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800/80 relative overflow-hidden flex flex-col justify-between hover:border-indigo-500/40 transition-all"
              >
                <div className="absolute top-0 right-0 px-4 py-1.5 bg-indigo-500/10 border-l border-b border-indigo-500/20 text-[11px] font-semibold text-indigo-400 rounded-bl-xl font-mono">
                  {s.badge}
                </div>
                <div>
                  <div className="text-4xl font-extrabold text-cyan-400/40 mb-4 font-mono">
                    {s.num}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE TOOLS ───────────────────────────────────── */}
      <section id="tools" className="section">
        <div className="section__inner">
          <div className="section__header">
            <h2 className="section__title">
              {activeTab === "calculator"
                ? "Credit Reputation Calculator"
                : "Borrower Onboarding Wizard"}
            </h2>
            <p className="section__subtitle">
              {activeTab === "calculator"
                ? "Simulate remittance frequency and duration to estimate your credit score and down-payment targets."
                : "Connect Freighter wallet, scan Horizon remittance history, and set up your Soroban escrow contract."}
            </p>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center justify-center mb-10">
            <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800 flex gap-2">
              <button
                onClick={() => setActiveTab("calculator")}
                className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "calculator"
                    ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25"
                    : "text-slate-400 hover:text-white"
                }`}
                type="button"
              >
                Calculate Eligibility
              </button>
              <button
                onClick={() => setActiveTab("onboarding")}
                className={`px-6 py-3 rounded-xl text-xs font-bold transition-all ${
                  activeTab === "onboarding"
                    ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25"
                    : "text-slate-400 hover:text-white"
                }`}
                type="button"
              >
                Start Onboarding
              </button>
            </div>
          </div>

          <div className="max-w-5xl mx-auto">
            {activeTab === "calculator" ? <CreditCalculator /> : <OnboardingWizard />}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────── */}
      <section className="section section--alt">
        <div className="section__inner">
          <div className="section__header">
            <h2 className="section__title">Trusted by Diaspora Communities</h2>
            <p className="section__subtitle">
              Hear from professionals using RemitMortgage to build homes across Africa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col justify-between"
              >
                <p className="text-xs text-slate-300 leading-relaxed italic mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center font-bold text-slate-950 text-xs shadow-md">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section className="section">
        <div className="section__inner section__inner--narrow">
          <div className="section__header">
            <h2 className="section__title">Frequently Asked Questions</h2>
            <p className="section__subtitle">
              Everything you need to know about remittance verification and Soroban escrow.
            </p>
          </div>
          <div className="faq-list">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
