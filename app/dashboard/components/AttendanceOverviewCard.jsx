"use client";

import React, { useState, useEffect } from "react";

/**
 * AttendanceOverviewCard Component
 * Displays today's organization-wide attendance stats & health score for the Owner/Manager.
 */
export default function AttendanceOverviewCard({ totalStaffCount = 1 }) {
  const [liveStats, setLiveStats] = useState({
    presentCount: 0,
    totalStaff: totalStaffCount,
    attendanceRate: 0,
  });

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch("/api/attendance/summary");
        if (res.ok) {
          const data = await res.json();
          setLiveStats({
            presentCount: data.presentCount ?? 0,
            totalStaff: data.totalStaffCount || totalStaffCount,
            attendanceRate: data.attendanceRate ?? 0,
          });
        }
      } catch (err) {
        console.error("Failed to fetch attendance summary:", err);
      }
    }
    fetchSummary();

    const interval = setInterval(fetchSummary, 5000);
    const handleUpdate = () => fetchSummary();
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [totalStaffCount]);

  const presentCount = liveStats.presentCount;
  const effectiveTotalStaff = Math.max(1, liveStats.totalStaff);
  const attendanceRate = liveStats.attendanceRate || (effectiveTotalStaff > 0 ? Math.round((presentCount / effectiveTotalStaff) * 100) : 0);
  const offlineCount = Math.max(0, effectiveTotalStaff - presentCount);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-5 hover:border-slate-700/80 transition duration-300 shadow-xl flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
              ⏱️
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Today's Attendance Overview</h3>
              <p className="text-xs text-slate-400">Live PostgreSQL organization presence</p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
            {attendanceRate}% On-Duty
          </span>
        </div>

        {/* Big Health Rate Metric */}
        <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Attendance Health</span>
            <div className="text-2xl font-black text-white">{presentCount} / {effectiveTotalStaff} Present</div>
          </div>
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500 border-t-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400 font-mono">
            {attendanceRate}%
          </div>
        </div>

        {/* Breakdown Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-0.5">
            <span className="text-[10px] text-emerald-300 font-semibold uppercase">Currently Checked In</span>
            <div className="text-xl font-bold text-emerald-400">{presentCount}</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-0.5">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Off Duty / Offline</span>
            <div className="text-xl font-bold text-slate-300">{offlineCount}</div>
          </div>
        </div>
      </div>

      <div className="pt-2 text-center">
        <span className="text-[11px] text-slate-400 italic">⚡ Live attendance updates automatically as staff check in</span>
      </div>
    </div>
  );
}
