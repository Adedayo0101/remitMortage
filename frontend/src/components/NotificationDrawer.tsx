"use client";

import { BellRing, CheckCheck, X, Trash2 } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";

function formatTimestamp(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationDrawer() {
  const {
    notificationHistory,
    unreadCount,
    isPanelOpen,
    closePanel,
    clearHistory,
    markAllRead,
  } = useNotifications();

  return (
    <>
      {isPanelOpen && (
        <button
          type="button"
          aria-label="Close notifications overlay"
          onClick={closePanel}
          className="fixed inset-0 z-[950] bg-black/50 backdrop-blur-[2px]"
        />
      )}

      <aside
        aria-label="Notifications panel"
        aria-hidden={!isPanelOpen}
        className={`fixed right-0 top-0 z-[960] h-full w-full max-w-[22rem] border-l border-slate-800 bg-[#0b1020]/95 shadow-2xl shadow-black/50 backdrop-blur-xl transition-transform duration-300 ease-out ${
          isPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 pb-4 pt-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                <BellRing className="h-3.5 w-3.5" />
                Live feed
              </div>
              <h2 className="mt-3 text-xl font-bold text-white">Notifications</h2>
              <p className="mt-1 text-sm text-slate-400">
                {unreadCount} unread updates across milestones, deposits, and disbursements.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close notifications panel"
              onClick={closePanel}
              className="rounded-lg border border-slate-700 p-2 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/15"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-200"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {notificationHistory.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-6 py-12 text-center">
                <div className="mb-4 rounded-full border border-cyan-500/20 bg-cyan-500/10 p-3 text-cyan-300">
                  <BellRing className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-white">No notifications yet</p>
                <p className="mt-2 text-sm text-slate-400">
                  Contract events and transaction confirmations will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notificationHistory
                  .slice()
                  .reverse()
                  .map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-2xl border p-4 transition-colors ${
                        item.read
                          ? "border-slate-800 bg-slate-950/55"
                          : "border-cyan-400/25 bg-cyan-500/8"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">{item.title}</p>
                          {item.message ? (
                            <p className="mt-1 text-sm leading-5 text-slate-400">{item.message}</p>
                          ) : null}
                        </div>
                        <span
                          className={`mt-0.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
                            item.read
                              ? "bg-slate-800 text-slate-300"
                              : "bg-cyan-400/10 text-cyan-200"
                          }`}
                        >
                          {item.read ? "Read" : "New"}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>{formatTimestamp(item.createdAt)}</span>
                        <span>{item.variant.toUpperCase()}</span>
                      </div>
                    </article>
                  ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

export default NotificationDrawer;