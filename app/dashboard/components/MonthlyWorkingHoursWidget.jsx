"use client";

import React, { useState, useEffect } from "react";

export default function MonthlyWorkingHoursWidget() {
  const [targetMonth, setTargetMonth] = useState(
    new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async (monthStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch(`/api/attendance/monthly-summary?month=${monthStr}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch monthly summary widget data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(targetMonth, true);

    const interval = setInterval(() => {
      fetchSummary(targetMonth, true);
    }, 2000);

    const handleUpdate = () => fetchSummary(targetMonth, true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [targetMonth]);

  const summary = data?.summary || {};
  const expectedMonthlyHours = data?.expectedMonthlyHours || 176;
  const actualWorkingHours = summary.actualWorkingHours ?? summary.workedHours ?? 0;
  const approvedLeaveHours = summary.approvedLeaveHours ?? 0;
  const approvedLeaveDays = summary.approvedLeaveDays ?? 0;
  const totalCombinedHours = actualWorkingHours + approvedLeaveHours;
  const overtimeHours = summary.totalOvertimeHours ?? summary.overtimeHours ?? 0;
  const timeDelayHours = summary.totalTimeGapHours ?? summary.timeDelayHours ?? 0;
  const completionRate = summary.completionRate ?? (expectedMonthlyHours > 0 ? Math.min(100, Math.round((totalCombinedHours / expectedMonthlyHours) * 100)) : 0);
  const absentDays = summary.absentDays ?? 0;

  return (
    <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 shadow-xl space-y-5 flex flex-col justify-between">
      {/* Widget Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#252d3d] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-lg text-white shadow-md">
            📊
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">
              Monthly Working Hours
            </h3>
            <p className="text-xs text-slate-400">
              Shift hours + approved leave credit calculation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#0f1117] border border-[#252d3d] rounded-xl px-3 py-1.5 self-start sm:self-auto">
          <span className="text-slate-400 text-xs">📅</span>
          <input
            type="month"
            value={targetMonth}
            onChange={(e) => setTargetMonth(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Calculating monthly working hours...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Main Big Metric & Progress */}
          <div className="bg-[#0f1117] border border-[#252d3d] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Monthly Hours
                </span>
                <div className="text-2xl font-black text-white font-mono mt-0.5">
                  {totalCombinedHours.toFixed(1)} / {expectedMonthlyHours.toFixed(1)} hrs
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  {completionRate}% Completed
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completionRate >= 95
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                    : completionRate >= 80
                    ? "bg-gradient-to-r from-indigo-500 to-sky-400"
                    : completionRate >= 60
                    ? "bg-gradient-to-r from-amber-500 to-orange-400"
                    : "bg-gradient-to-r from-rose-500 to-red-400"
                }`}
                style={{ width: `${Math.min(100, completionRate)}%` }}
              />
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Shift Hours Worked */}
            <div className="bg-[#0f1117] p-3 rounded-xl border border-[#252d3d] space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">
                Shift Worked
              </span>
              <span className="font-mono font-extrabold text-white text-sm">
                {actualWorkingHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Approved Leave Credit */}
            <div className="bg-[#0f1117] p-3 rounded-xl border border-indigo-500/30 space-y-0.5">
              <span className="text-[10px] text-indigo-400 font-bold uppercase block">
                Leave Credit
              </span>
              <span className="font-mono font-extrabold text-indigo-300 text-sm">
                +{approvedLeaveHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Overtime (+OT) */}
            <div className="bg-[#0f1117] p-3 rounded-xl border border-emerald-500/30 space-y-0.5">
              <span className="text-[10px] text-emerald-400 font-bold uppercase block">
                Overtime (+OT)
              </span>
              <span className="font-mono font-extrabold text-emerald-400 text-sm">
                +{overtimeHours.toFixed(1)} hrs
              </span>
            </div>

            {/* Absent Days */}
            <div className="bg-[#0f1117] p-3 rounded-xl border border-[#252d3d] space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">
                Absent Days
              </span>
              <span className={`font-mono font-extrabold text-sm ${absentDays > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {absentDays} Days
              </span>
            </div>
          </div>

          {/* HR Evaluation Badge Banner */}
          {summary.evaluationBadge && (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛡️</span>
                <span className="font-extrabold text-slate-200">
                  {summary.evaluationBadge}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 max-w-xs truncate">
                {summary.suggestionText}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
