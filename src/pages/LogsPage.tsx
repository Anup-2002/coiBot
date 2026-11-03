import React from "react";
import {
  Terminal as TerminalIcon,
  Clock,
  ArrowLeft,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
} from "lucide-react";
import { CustomSelect } from "../components/CustomSelect";
import { formatLocalTime } from "../utils/ui-helpers";

export function renderLogsPage(
  logsTab: any,
  setLogsTab: any,
  navigateTo: any,
  setInlineConfirmModal: any,
  runCommand: any,
  isPending: any,
  logSearchQuery: any,
  setLogSearchQuery: any,
  autoScroll: any,
  setAutoScroll: any,
  terminalContainerRef: any,
  logFilter: any,
  setLogFilter: any,
  filteredLogs: any,
  terminalEndRef: any,
  schedulerLogs: any,
  schedulerLogQuery: any,
  setSchedulerLogQuery: any
) {
  return (
    /* DEDICATED LOGS SCREEN (/logs) */
    <main key="view-logs" className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto w-full animate-in fade-in duration-200">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <TerminalIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              Activity Logs
            </h1>
            <p className="text-sm text-slate-400">Live Activity and Posting History</p>
          </div>
        </div>

        {/* Sub-tab Switcher & Dashboard Return */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setLogsTab("system")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                logsTab === "system"
                  ? "bg-emerald-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TerminalIcon className="h-3.5 w-3.5" />
              <span>System Activity</span>
            </button>
            <button
              onClick={() => setLogsTab("scheduler")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition cursor-pointer flex items-center gap-1.5 ${
                logsTab === "scheduler"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Scheduler Logs</span>
            </button>
          </div>

        </div>
      </div>

      {/* TAB 1: SYSTEM ACTIVITY LOGS */}
      {logsTab === "system" ? (
        <section className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex flex-col gap-3.5 mb-3.5 border-b border-slate-800 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-white tracking-tight flex items-center gap-2">
                  <span className="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700">
                    <TerminalIcon className="h-4 w-4" />
                  </span>
                  Activity
                </h2>
              </div>
              <button
                onClick={() =>
                  setInlineConfirmModal({
                    isOpen: true,
                    title: "Clear Activity Logs & Queue",
                    message: "Clear activity logs and queued coins/comments for this account? Your posted history stays safe.",
                    onConfirm: () => runCommand("/api/clear-all", "clear")
                  })
                }
                disabled={isPending.clear}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 cursor-pointer"
                title="Clear activity logs"
                aria-label="Clear activity logs"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Filter logs by keyword..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 placeholder-slate-500 font-mono"
              />

              {filteredLogs.length > 10 && (
                <div className="inline-flex items-center rounded-xl border border-slate-800 bg-slate-950 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoScroll(false);
                      if (terminalContainerRef.current) {
                        terminalContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    }}
                    className="px-2 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title="Jump directly to oldest logs (top)"
                    aria-label="Jump directly to oldest logs (top)"
                  >
                    <ArrowUp className="h-3 w-3" />
                    <span className="hidden sm:inline">Top</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (terminalContainerRef.current) {
                        terminalContainerRef.current.scrollTo({
                          top: terminalContainerRef.current.scrollHeight,
                          behavior: "smooth",
                        });
                      }
                    }}
                    className="px-2 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title="Jump directly to latest logs (bottom)"
                    aria-label="Jump directly to latest logs (bottom)"
                  >
                    <ArrowDown className="h-3 w-3" />
                    <span className="hidden sm:inline">Bottom</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  const nextVal = !autoScroll;
                  setAutoScroll(nextVal);
                  if (nextVal && terminalContainerRef.current) {
                    terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
                  }
                }}
                className={`px-3 py-1.5 text-sm font-bold rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
                  autoScroll
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title={autoScroll ? "Pause auto-scrolling when new logs arrive" : "Resume auto-scrolling to the bottom"}
                aria-label="Toggle auto-scroll"
              >
                <ArrowDown className={`h-3.5 w-3.5 ${autoScroll ? "animate-pulse" : ""}`} />
                Scroll: {autoScroll ? "ON" : "PAUSED"}
              </button>

              <CustomSelect
                value={logFilter}
                onChange={(val) => setLogFilter(val)}
                accent="emerald"
                title="Filter logs by level"
                menuMinWidth={155}
                className="py-1.5 px-3 text-slate-200"
                options={[
                  { value: "all", label: "All Activity" },
                  { value: "info", label: "Info" },
                  { value: "success", label: "Success" },
                  { value: "warning", label: "Warnings" },
                  { value: "error", label: "Errors" },
                ]}
              />
            </div>
          </div>

          {/* Terminal console */}
          <div
            ref={terminalContainerRef}
            className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[460px] overflow-y-auto font-mono text-xs sm:text-sm space-y-1.5 leading-relaxed shadow-inner"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-slate-400 italic text-center pt-12">No activity messages matching filter.</div>
            ) : (
              filteredLogs.slice(-100).map((log: any, index: number) => {
                let colorClass = "text-slate-300";
                if (log.level === "success") colorClass = "text-emerald-400";
                else if (log.level === "warning") colorClass = "text-amber-400";
                else if (log.level === "error") colorClass = "text-red-400 font-semibold";
                else if (log.level === "info") colorClass = "text-blue-400";

                return (
                  <div key={index} className="flex gap-2 items-start hover:bg-slate-900/40 p-0.5 rounded transition">
                    <span className="text-slate-400 flex-shrink-0 select-none">[{formatLocalTime(log.createdAt, log.timestamp)}]</span>
                    <span className={colorClass}>{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef}></div>
          </div>
        </section>
      ) : (
        /* TAB 2: SCHEDULER LOGS WITH SINGLE DOWNLOAD LINK */
        <section className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-slate-800 text-indigo-400 rounded-lg border border-slate-700">
                <Clock className="h-4 w-4" />
              </span>
              <h2 className="font-bold text-white tracking-tight">Scheduler Execution Log</h2>
              <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                {schedulerLogs.length} events
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Filter scheduler logs..."
                value={schedulerLogQuery}
                onChange={(e) => setSchedulerLogQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500 font-mono flex-1 sm:w-48 min-w-[140px]"
              />
              {schedulerLogs.length > 10 && (
                <div className="inline-flex items-center rounded-xl border border-slate-800 bg-slate-950 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      const box = document.getElementById("scheduler-log-scroll-box");
                      if (box) box.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="px-2 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title="Jump directly to oldest scheduler logs (top)"
                    aria-label="Jump directly to oldest scheduler logs (top)"
                  >
                    <ArrowUp className="h-3 w-3" />
                    <span className="hidden sm:inline">Top</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const box = document.getElementById("scheduler-log-scroll-box");
                      if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
                    }}
                    className="px-2 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition flex items-center gap-1 cursor-pointer"
                    title="Jump directly to latest scheduler logs (bottom)"
                    aria-label="Jump directly to latest scheduler logs (bottom)"
                  >
                    <ArrowDown className="h-3 w-3" />
                    <span className="hidden sm:inline">Bottom</span>
                  </button>
                </div>
              )}
              <a
                href="/api/scheduler/logs/download"
                download="scheduler_execution.log"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Scheduler Logs</span>
              </a>
            </div>
          </div>

          <div
            id="scheduler-log-scroll-box"
            className="bg-slate-950 rounded-xl border border-slate-800 p-4 h-[460px] overflow-y-auto font-mono text-xs sm:text-sm space-y-1.5 leading-relaxed shadow-inner"
          >
            {schedulerLogs.length === 0 ? (
              <div className="text-slate-400 italic text-center pt-12">No scheduler logs recorded yet.</div>
            ) : (
              schedulerLogs
                .filter((l: any) => !schedulerLogQuery || l.message.toLowerCase().includes(schedulerLogQuery.toLowerCase()))
                .map((l: any, idx: number) => {
                  const isErr = l.level === "error";
                  const isWarn = l.level === "warning";
                  const isSucc = l.level === "success";
                  return (
                    <div key={idx} className="flex gap-2 items-start hover:bg-slate-900/40 p-0.5 rounded transition">
                      <span className="text-slate-400 flex-shrink-0 select-none">[{formatLocalTime(l.createdAt, l.timestamp)}]</span>
                      <span className={`text-xs uppercase font-bold shrink-0 px-1 py-0.2 rounded ${
                        isErr ? "bg-rose-500/20 text-rose-300" : isWarn ? "bg-amber-500/20 text-amber-300" : isSucc ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                      }`}>{l.level}</span>
                      <span className={isErr ? "text-rose-400" : isWarn ? "text-amber-400" : isSucc ? "text-emerald-400" : "text-slate-300"}>{l.message}</span>
                    </div>
                  );
                })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
