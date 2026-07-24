"use client";

import React from "react";

type Props = {
  deposited: string;
  target: string;
  progress: number;
};

export default function SavingsProgressCard({ deposited, target, progress }: Props) {
  const d = Number(deposited) || 0;
  const t = Number(target) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((d / t) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Escrow Down-Payment Goal</h3>
          <p className="text-xs text-slate-400">Target 30% contribution required for 70% loan unlock.</p>
        </div>
        <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-full">
          30% Goal
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-slate-800"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="text-cyan-400 transition-all duration-1000 ease-out"
              strokeDasharray={`${pct}, 100`}
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute text-center">
            <div className="text-xl font-extrabold text-white font-mono">{pct}%</div>
            <div className="text-[10px] text-slate-400">Complete</div>
          </div>
        </div>

        <div className="flex-1 space-y-3 w-full">
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-slate-300">Escrow Balance</span>
              <span className="text-cyan-400 font-mono">${d.toLocaleString()} / ${t.toLocaleString()} USDC</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Soroban Yield</span>
              <span className="text-emerald-400 font-mono font-semibold">+4.5% APY</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block uppercase font-bold">Yield Protocol</span>
              <span className="text-slate-200 font-semibold">Blend Capital</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
