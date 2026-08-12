"use client";

import React, { useState, useEffect } from "react";
import EmployeeMonthlySummaryTable from "./EmployeeMonthlySummaryTable";

function formatTimeString(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export default function HRAttendanceTracker() {
  const [hrTab, setHrTab] = useState("daily"); // "daily" | "monthly"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalStaff: 0,
    checkedInCount: 0,
    checkedOutCount: 0,
    notCheckedInCount: 0,
    presentTotal: 0,
    attendanceRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Rejection Feedback Modal
  const [rejectingAttId, setRejectingAttId] = useState(null);
  const [rejectFeedbackInput, setRejectFeedbackInput] = useState("");
  const [actionNotice, setActionNotice] = useState({ error: "", success: "" });

  const fetchAttendanceList = async (dateStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch(`/api/attendance/list?date=${dateStr}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch HR attendance list:", err);
    } finally {
      setLoading(false);
    }
  };

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to fetch HR notifications:", err);
    }
  };

  const markNotificationsAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadCount(0);
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark notifications as read:", err);
    }
  };

  const lastDateRef = React.useRef(typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : "");

  useEffect(() => {
    const initData = async () => {
      await fetchAttendanceList(selectedDate, false);
      await fetchNotifications();
    };
    initData();

    const interval = setInterval(() => {
      const todayIso = new Date().toISOString().split("T")[0];
      if (todayIso !== lastDateRef.current && selectedDate === lastDateRef.current) {
        lastDateRef.current = todayIso;
        setSelectedDate(todayIso);
      } else {
        fetchAttendanceList(selectedDate, true);
        fetchNotifications();
      }
    }, 5000);

    const handleUpdateEvent = () => {
      fetchAttendanceList(selectedDate, true);
      fetchNotifications();
    };
    window.addEventListener("attendance-updated", handleUpdateEvent);

    return () => {
      clearInterval(interval);
      window.removeEventListener("attendance-updated", handleUpdateEvent);
    };
  }, [selectedDate]);

  // Live 1-second ticker to increment active employees' working hours in real-time
  useEffect(() => {
    const ticker = setInterval(() => {
      setRecords((prevRecords) =>
        prevRecords.map((emp) => {
          if (emp.status === "CHECKED_IN") {
            return {
              ...emp,
              workingHours: emp.workingHours + 1 / 3600,
            };
          }
          return emp;
        })
      );
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const handleActionEarlyCheckout = async (attendanceId, action, feedbackText = "") => {
    if (!attendanceId) return;
    setActionLoadingId(attendanceId);
    setActionNotice({ error: "", success: "" });

    try {
      const res = await fetch("/api/attendance/approve-early", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceId,
          action,
          hrFeedback: feedbackText,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setActionNotice({ error: data.message || "Failed to process request.", success: "" });
      } else {
        setActionNotice({ error: "", success: data.message });
        setRejectingAttId(null);
        setRejectFeedbackInput("");
        await fetchAttendanceList(selectedDate);
      }
    } catch {
      setActionNotice({ error: "Network error processing HR decision.", success: "" });
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingEarlyCount = records.filter(
    (r) => r.status === "PENDING_APPROVAL" || r.approvalStatus === "PENDING"
  ).length;

  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      !searchQuery ||
      rec.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      rec.status === statusFilter ||
      (statusFilter === "PENDING_APPROVAL" && (rec.status === "PENDING_APPROVAL" || rec.approvalStatus === "PENDING")) ||
      (statusFilter === "REJECTED_LOP" && (rec.status === "REJECTED_LOP" || rec.isLop));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-3 bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-2 shadow-lg">
        <button
          onClick={() => setHrTab("daily")}
          className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            hrTab === "daily"
              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <span className="text-base">📅</span>
          <span>Daily Shift Tracker & Approvals</span>
          {pendingEarlyCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black animate-pulse">
              {pendingEarlyCount} Pending
            </span>
          )}
        </button>

        <button
          onClick={() => setHrTab("monthly")}
          className={`flex-1 py-3 px-4 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            hrTab === "monthly"
              ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          <span className="text-base">📊</span>
          <span>Employee Monthly Summary</span>
        </button>
      </div>

      {hrTab === "monthly" ? (
        <EmployeeMonthlySummaryTable />
      ) : (
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl relative">
          
          {/* Header & Date Selector */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#252d3d] pb-5">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20 mb-2">
                <span>🛡️</span> HR Management Control
              </div>
          <h2 className="text-lg md:text-xl font-extrabold text-white flex items-center gap-2">
            Employee Attendance Tracker & Approval Inbox
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Overall working standard is 8 Hours. Approve early check-outs or reject with Loss of Pay (LOP)
          </p>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0f1117] border border-[#252d3d] rounded-xl px-3 py-2">
            <span className="text-slate-400 text-xs">📅</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none font-mono cursor-pointer"
            />
          </div>
          <button
            onClick={() => fetchAttendanceList(selectedDate)}
            className="p-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
            title="Refresh List"
          >
            🔄
          </button>
        </div>
      </div>

      {/* HR Unread Notifications & Reasons Banner */}
      {unreadCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 animate-pulse shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔔</span>
            <div>
              <span className="font-bold text-amber-300 block text-xs">
                {unreadCount} New Check-Out Request / Reason Noted by HR
              </span>
              <span className="text-[11px] text-amber-200/90">
                {notifications.find((n) => !n.is_read)?.message || "Employee submitted early check-out request with reason."}
              </span>
            </div>
          </div>
          <button
            onClick={markNotificationsAsRead}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[11px] transition shrink-0 cursor-pointer"
          >
            Mark as Read & Noted
          </button>
        </div>
      )}

      {/* Action Notice Alert Banner */}
      {actionNotice.success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center justify-between">
          <span>{actionNotice.success}</span>
          <button onClick={() => setActionNotice({ error: "", success: "" })} className="text-emerald-400 text-xs">✕</button>
        </div>
      )}
      {actionNotice.error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center justify-between">
          <span>{actionNotice.error}</span>
          <button onClick={() => setActionNotice({ error: "", success: "" })} className="text-rose-400 text-xs">✕</button>
        </div>
      )}

      {/* Summary Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-[#0f1117] border border-[#252d3d] space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Staff</span>
          <div className="text-2xl font-black text-white">{summary.totalStaff}</div>
          <span className="text-[10px] text-slate-400">Registered members</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">On Duty</span>
          <div className="text-2xl font-black text-emerald-400">{summary.checkedInCount}</div>
          <span className="text-[10px] text-emerald-300/80">Active shifts</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Pending Early Requests</span>
          <div className="text-2xl font-black text-amber-400">{pendingEarlyCount}</div>
          <span className="text-[10px] text-amber-300/80">&lt;8h reason submitted</span>
        </div>

        <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 space-y-1">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">Completed Shifts</span>
          <div className="text-2xl font-black text-sky-400">{summary.checkedOutCount}</div>
          <span className="text-[10px] text-sky-300/80">Checked out today</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Not Checked In</span>
          <div className="text-2xl font-black text-slate-300">{summary.notCheckedInCount}</div>
          <span className="text-[10px] text-slate-500">Off duty</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#0f1117]/60 p-3 rounded-xl border border-[#252d3d]">
        <div className="relative flex-1 w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          <input
            type="text"
            placeholder="Search employee name, email, department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1a1e2a] border border-[#252d3d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-auto bg-[#1a1e2a] border border-[#252d3d] text-slate-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All Statuses ({records.length})</option>
          <option value="PENDING_APPROVAL">Pending HR Review ({pendingEarlyCount})</option>
          <option value="CHECKED_IN">On Duty ({summary.checkedInCount})</option>
          <option value="ON_BREAK">On Lunch Break</option>
          <option value="ON_LEAVE">On Approved Leave ({summary.onLeaveCount || 0})</option>
          <option value="COMPANY_HOLIDAY">Company Holiday ({summary.holidayCount || 0})</option>
          <option value="COMPLETED">Completed/Approved ({summary.checkedOutCount})</option>
          <option value="REJECTED_LOP">Loss of Pay (LOP)</option>
          <option value="NOT_CHECKED_IN">Not Checked In ({summary.notCheckedInCount})</option>
        </select>
      </div>

      {/* Employee Attendance Table */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading attendance records for {selectedDate}…</span>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="py-12 text-center text-slate-500 space-y-2">
          <p className="text-3xl">👥</p>
          <p className="text-xs">No employee records match the selected filter on {selectedDate}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#252d3d] text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Check-In / Out</th>
                <th className="py-3 px-4">Shift Duration</th>
                <th className="py-3 px-4">Early Check-Out Reason (&lt;8h)</th>
                <th className="py-3 px-4">Status & HR Approval</th>
                <th className="py-3 px-4 text-right">HR Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252d3d]/60">
              {filteredRecords.map((emp) => {
                const isPendingHR = emp.status === "PENDING_APPROVAL" || emp.approvalStatus === "PENDING";
                const isRejectedLop = emp.status === "REJECTED_LOP" || emp.approvalStatus === "REJECTED" || emp.isLop;

                return (
                  <tr key={emp.employeeId} className={`hover:bg-[#1e2334] transition group ${isPendingHR ? "bg-amber-500/5" : ""}`}>
                    {/* Employee info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                          {emp.fullName?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{emp.fullName}</div>
                          <div className="text-slate-500 text-[10px]">{emp.department} · {emp.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Check In / Out */}
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div className="text-slate-200">In: {emp.status === "COMPANY_HOLIDAY" ? <span className="text-purple-400 font-sans font-bold">Company Holiday</span> : emp.status === "ON_LEAVE" ? <span className="text-cyan-400 font-sans font-bold">Approved Leave</span> : formatTimeString(emp.checkIn)}</div>
                      <div className="text-slate-400">Out: {emp.status === "CHECKED_IN" ? <span className="text-emerald-400 font-bold animate-pulse">Active</span> : emp.status === "COMPANY_HOLIDAY" ? <span className="text-purple-400 font-sans font-bold">Company Holiday</span> : emp.status === "ON_LEAVE" ? <span className="text-cyan-400 font-sans font-bold">Approved Leave</span> : formatTimeString(emp.checkOut)}</div>
                    </td>

                    {/* Working Hours */}
                    <td className="py-3.5 px-4 font-mono">
                      <span className={`font-bold ${emp.status === "COMPANY_HOLIDAY" ? "text-purple-400" : emp.status === "ON_LEAVE" ? "text-cyan-400" : emp.workingHours < 8.0 && emp.status !== "NOT_CHECKED_IN" ? "text-amber-400" : "text-emerald-400"}`}>
                        {emp.status === "NOT_CHECKED_IN" ? "0.00 hrs" : `${emp.workingHours.toFixed(2)} hrs`}
                      </span>
                      {emp.status === "COMPANY_HOLIDAY" && (
                        <span className="block text-[9px] font-sans text-purple-400/90 font-semibold">Holiday Credit (+8.0h)</span>
                      )}
                      {emp.status === "ON_LEAVE" && (
                        <span className="block text-[9px] font-sans text-cyan-400/90 font-semibold">Leave Credit (+8.0h)</span>
                      )}
                      {emp.workingHours < 8.0 && emp.status !== "NOT_CHECKED_IN" && emp.status !== "CHECKED_IN" && emp.status !== "ON_LEAVE" && emp.status !== "COMPANY_HOLIDAY" && (
                        <span className="block text-[9px] font-sans text-amber-400/90">Under 8h standard</span>
                      )}
                    </td>

                    {/* Early Reason */}
                    <td className="py-3.5 px-4 max-w-xs">
                      {emp.earlyReason ? (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] font-medium leading-relaxed shadow-sm">
                          <span className="block text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">📝 Reason Noted by Employee:</span>
                          &quot;{emp.earlyReason}&quot;
                        </div>
                      ) : emp.workingHours < 8.0 && emp.status !== "CHECKED_IN" && emp.status !== "NOT_CHECKED_IN" && emp.status !== "COMPANY_HOLIDAY" ? (
                        <span className="text-slate-500 italic text-[11px]">No reason recorded</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          emp.status === "ON_BREAK"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                            : emp.status === "CHECKED_IN"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : emp.status === "ON_LEAVE"
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                            : emp.status === "COMPANY_HOLIDAY"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                            : isPendingHR
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                            : isRejectedLop
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : emp.status === "NOT_CHECKED_IN"
                            ? "bg-slate-800/80 text-slate-400 border-slate-700"
                            : "bg-sky-500/10 text-sky-400 border-sky-500/30"
                        }`}
                      >
                        {emp.status === "ON_BREAK"
                          ? "🍱 ON LUNCH BREAK"
                          : emp.status === "CHECKED_IN"
                          ? "● ON DUTY"
                          : emp.status === "ON_LEAVE"
                          ? `✈️ ON APPROVED LEAVE${emp.leaveType ? ` (${emp.leaveType})` : ""}`
                          : emp.status === "COMPANY_HOLIDAY"
                          ? `🎉 COMPANY HOLIDAY${emp.holidayTitle ? ` (${emp.holidayTitle})` : ""}`
                          : isPendingHR
                          ? "⌛ PENDING HR APPROVAL"
                          : isRejectedLop
                          ? "✖ REJECTED (LOSS OF PAY / LOP)"
                          : emp.status === "NOT_CHECKED_IN"
                          ? "○ OFF DUTY"
                          : "✓ APPROVED (COMPLETED)"}
                      </span>
                    </td>

                    {/* HR Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {isPendingHR && emp.attendanceRecordId ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setRejectingAttId(emp.attendanceRecordId);
                              setRejectFeedbackInput("");
                            }}
                            disabled={actionLoadingId === emp.attendanceRecordId}
                            className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[11px] font-bold shadow transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <span>📝 Review Reason & Decide</span>
                          </button>
                        </div>
                      ) : isRejectedLop ? (
                        <span className="text-rose-400 font-bold text-[10px] uppercase">LOP Applied</span>
                      ) : emp.status !== "NOT_CHECKED_IN" && emp.status !== "CHECKED_IN" ? (
                        <span className="text-emerald-400 font-bold text-[10px] uppercase">Approved</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* HR Approval & Review Modal (Displays Employee Reason & HR Actions) */}
      {rejectingAttId && (() => {
        const targetRec = records.find((r) => r.attendanceRecordId === rejectingAttId);
        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[#1a1e2a] border border-amber-500/40 rounded-2xl p-6 md:p-7 space-y-5 shadow-2xl animate-scaleUp">
              <div className="flex items-center justify-between border-b border-[#252d3d] pb-3.5">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/20 mb-1">
                    <span>⌛</span> Early Check-Out Request Review
                  </div>
                  <h3 className="text-base font-extrabold text-white">
                    HR Approval Inbox & Decision
                  </h3>
                </div>
                <button
                  onClick={() => setRejectingAttId(null)}
                  className="text-slate-400 hover:text-white text-base font-bold"
                >
                  ✕
                </button>
              </div>

              {targetRec && (
                <div className="space-y-4">
                  {/* Employee Metadata */}
                  <div className="flex items-center justify-between bg-[#0f1117] p-3.5 rounded-xl border border-[#252d3d] text-xs">
                    <div>
                      <div className="font-bold text-white text-sm">{targetRec.fullName}</div>
                      <div className="text-slate-400 text-[11px]">{targetRec.department} · {targetRec.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-400 text-sm">
                        {targetRec.workingHours.toFixed(2)} hrs net
                      </div>
                      <div className="text-[10px] text-slate-500">Under 8.0h standard</div>
                    </div>
                  </div>

                  {/* PROMINENT REASON BOX */}
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2 shadow-inner">
                    <div className="flex items-center gap-2 font-bold text-amber-400 text-xs uppercase tracking-wider">
                      <span>📝</span> Employee&apos;s Submitted Check-Out Reason:
                    </div>
                    <div className="bg-[#0f1117] p-3.5 rounded-lg border border-[#252d3d] text-xs text-slate-200 italic leading-relaxed font-sans">
                      &quot;{targetRec.earlyReason || "No reason recorded in system"}&quot;
                    </div>
                  </div>

                  {/* HR Feedback / Note Input */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      HR Decision Note / Remarks (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={rejectFeedbackInput}
                      onChange={(e) => setRejectFeedbackInput(e.target.value)}
                      placeholder="e.g. Approved due to medical emergency / Shift minimum hours not met..."
                      className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      disabled={actionLoadingId === rejectingAttId}
                      onClick={() => handleActionEarlyCheckout(rejectingAttId, "APPROVE", rejectFeedbackInput.trim())}
                      className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
                    >
                      {actionLoadingId === rejectingAttId ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>✓</span>
                          <span>Approve Early Check-Out</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={actionLoadingId === rejectingAttId}
                      onClick={() => handleActionEarlyCheckout(rejectingAttId, "REJECT", rejectFeedbackInput.trim())}
                      className="py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
                    >
                      {actionLoadingId === rejectingAttId ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <span>✖</span>
                          <span>Reject (Loss of Pay)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

        </div>
      )}
    </div>
  );
}
