"use client";

import React, { useState, useEffect, useRef } from "react";
import AttendanceOverviewCard from "./AttendanceOverviewCard";
import HRAttendanceTracker from "./HRAttendanceTracker";

function formatSecondsToHHMMSS(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00h 00m 00s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function formatDurationText(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "0s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AttendancePage({ userRole }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalWorkingHoursToday, setTotalWorkingHoursToday] = useState(0);
  const [totalCompletedHoursToday, setTotalCompletedHoursToday] = useState(0);
  const [todayLogs, setTodayLogs] = useState([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Lunch break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [hasCompletedBreak, setHasCompletedBreak] = useState(false);
  const [breakStart, setBreakStart] = useState(null);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [currentBreakSeconds, setCurrentBreakSeconds] = useState(0);

  // Early check-out approval states
  const [approvalStatus, setApprovalStatus] = useState("APPROVED");
  const [earlyReason, setEarlyReason] = useState("");
  const [isLop, setIsLop] = useState(false);
  const [hrFeedback, setHrFeedback] = useState("");

  // Early check-out reason modal state
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonInput, setReasonInput] = useState("");
  const [modalError, setModalError] = useState("");

  // Holiday state for today
  const [isHoliday, setIsHoliday] = useState(false);
  const [holidayTitle, setHolidayTitle] = useState("");
  const [holidayType, setHolidayType] = useState("");

  // Approved Leave state for today
  const [isOnLeaveToday, setIsOnLeaveToday] = useState(false);
  const [leaveTypeToday, setLeaveTypeToday] = useState("");
  const [leaveReasonToday, setLeaveReasonToday] = useState("");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ error: "", success: "" });

  // ─── Timer refs (never stale, no closure issues) ─────────────────────────────
  // workSecondsRef  : live counter of net worked seconds (source of truth for display)
  // breakSecondsRef : live counter of current break seconds
  // isOnBreakRef    : mirror of isOnBreak state — readable inside setInterval without stale closure
  // timerRef        : the single running interval ID
  const workSecondsRef = useRef(0);
  const breakSecondsRef = useRef(0);
  const isOnBreakRef = useRef(false);
  const timerRef = useRef(null);

  const lastCheckedDateRef = useRef(typeof window !== "undefined" ? new Date().toDateString() : "");

  const fetchAttendanceStatus = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch("/api/attendance/status");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();

        // ─── Metadata — safe to update every poll ─────────────────────────────
        setCheckedIn(data.checkedIn);
        setHasCompletedToday(data.hasCompletedToday || false);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime || null);
        setTotalWorkingHoursToday(data.totalWorkingHoursToday || 0);
        setTotalCompletedHoursToday(data.totalCompletedHoursToday || 0);
        setTodayLogs(data.todayLogs || []);
        setApprovalStatus(data.approvalStatus || (data.status === "PENDING_APPROVAL" ? "PENDING" : data.status === "REJECTED_LOP" ? "REJECTED" : "APPROVED"));
        setEarlyReason(data.earlyReason || "");
        setIsLop(data.isLop || data.status === "REJECTED_LOP");
        setHrFeedback(data.hrFeedback || "");
        setIsHoliday(Boolean(data.isHoliday));
        setHolidayTitle(data.holidayTitle || "");
        setHolidayType(data.holidayType || "");
        setIsOnLeaveToday(Boolean(data.isOnLeave));
        setLeaveTypeToday(data.leaveType || "");
        setLeaveReasonToday(data.leaveReason || "");

        // If today is a clean new day (neither checked in nor completed today)
        if (!data.checkedIn && !data.hasCompletedToday) {
          workSecondsRef.current = 0;
          breakSecondsRef.current = 0;
          isOnBreakRef.current = false;
          setIsOnBreak(false);
          setHasCompletedBreak(false);
          setBreakStart(null);
          setTotalBreakSeconds(0);
          setCurrentBreakSeconds(0);
          setElapsedSeconds(0);
        } else {
          if (data.hasCompletedBreak || (data.totalBreakSeconds > 0 && !data.isOnBreak)) {
            setHasCompletedBreak(true);
          }
        }

        // ─── Timer / break state — initial load OR session active ──────────────
        if (!isSilent && (data.checkedIn || data.hasCompletedToday)) {
          const onBreak = data.isOnBreak || false;
          const netSeconds = Number(data.netWorkingSeconds ?? data.elapsedSeconds) || 0;
          const breakSec = Number(data.currentBreakSeconds) || 0;

          workSecondsRef.current = netSeconds;
          breakSecondsRef.current = breakSec;
          isOnBreakRef.current = onBreak;

          setElapsedSeconds(netSeconds);
          setCurrentBreakSeconds(breakSec);
          setIsOnBreak(onBreak);
          setBreakStart(data.breakStart || null);
          setTotalBreakSeconds(Number(data.totalBreakSeconds) || 0);
          setHasCompletedBreak(Boolean(data.hasCompletedBreak || (data.totalBreakSeconds > 0 && !onBreak)));
        }
      }
    } catch (err) {
      console.error("Failed to fetch attendance status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initStatus = async () => {
      await fetchAttendanceStatus(false);
    };
    initStatus();

    const interval = setInterval(() => {
      const currentDateStr = new Date().toDateString();
      if (currentDateStr !== lastCheckedDateRef.current) {
        lastCheckedDateRef.current = currentDateStr;
        fetchAttendanceStatus(false); // Midnight rollover — full refresh
      } else {
        fetchAttendanceStatus(true); // Silent background polling
      }
    }, 15000);

    const handleUpdate = () => fetchAttendanceStatus(true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, []);

  // ─── SINGLE INTERVAL TIMER ────────────────────────────────────────────────────
  // One interval runs whenever the user is checked in.
  // Every second it reads isOnBreakRef (a ref — never stale) to decide:
  //   - NOT on break → increment workSecondsRef, update elapsedSeconds display
  //   - ON break     → increment breakSecondsRef, update currentBreakSeconds display
  // Because we use refs for arithmetic and state only for display, there are
  // zero race conditions between handleToggleBreak and the interval.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!checkedIn) {
      workSecondsRef.current = 0;
      breakSecondsRef.current = 0;
      setElapsedSeconds(0);
      setCurrentBreakSeconds(0);
      return;
    }

    timerRef.current = setInterval(() => {
      if (isOnBreakRef.current) {
        breakSecondsRef.current += 1;
        setCurrentBreakSeconds(breakSecondsRef.current);
      } else {
        workSecondsRef.current += 1;
        setElapsedSeconds(workSecondsRef.current);
      }
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [checkedIn]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    setNotice({ error: "", success: "" });
    try {
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to check in.", success: "" });
        if (data.hasCompletedToday) setHasCompletedToday(true);
      } else {
        setCheckedIn(true);
        // Reset all timer refs for the fresh session
        workSecondsRef.current = 0;
        breakSecondsRef.current = 0;
        isOnBreakRef.current = false;
        setIsOnBreak(false);
        setHasCompletedBreak(false);
        setBreakStart(null);
        setTotalBreakSeconds(0);
        setCurrentBreakSeconds(0);
        setHasCompletedToday(false);
        setCheckInTime(data.checkInTime);
        setApprovalStatus("APPROVED");
        setEarlyReason("");
        setIsLop(false);
        setElapsedSeconds(0);
        setNotice({
          error: "",
          success: `Check-in recorded at ${new Date(data.checkInTime).toLocaleTimeString()} (PostgreSQL Server Timestamp)`,
        });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
        await fetchAttendanceStatus(true);
      }
    } catch {
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  // ─── LUNCH BREAK HANDLER ─────────────────────────────────────────────────────
  // START:
  //   1. isOnBreakRef flips to true  → the running interval immediately stops
  //      touching workSecondsRef and starts counting breakSecondsRef instead.
  //   2. No need to "save" a frozen value — workSecondsRef IS the frozen value.
  //   3. setIsOnBreak(true) syncs React state for UI rendering.
  //
  // END:
  //   1. isOnBreakRef flips to false → the running interval immediately resumes
  //      counting workSecondsRef from exactly where it stopped.
  //   2. breakSecondsRef resets to 0 for the next display.
  //   3. No server fetch — the 15s background poll handles eventual sync.
  // ─────────────────────────────────────────────────────────────────────────────
  const handleToggleBreak = async (actionType) => {
    // Hard guard: only one lunch break per day (blocked if break was already taken or completed)
    if (actionType === "START" && (hasCompletedBreak || totalBreakSeconds > 0)) return;

    setActionLoading(true);
    setNotice({ error: "", success: "" });

    // Capture rollback values BEFORE any changes
    const prevIsOnBreak = isOnBreak;
    const prevBreakStart = breakStart;
    const prevTotalBreakSeconds = totalBreakSeconds;
    const prevHasCompletedBreak = hasCompletedBreak;
    const prevWorkSeconds = workSecondsRef.current;
    const prevBreakSeconds = breakSecondsRef.current;

    if (actionType === "START") {
      // Flip the ref FIRST — the interval reads this immediately on next tick
      isOnBreakRef.current = true;
      breakSecondsRef.current = 0;
      // Sync React state for UI
      setIsOnBreak(true);
      setBreakStart(new Date().toISOString());
      setCurrentBreakSeconds(0);
      // workSecondsRef is untouched — timer just stops adding to it
    } else {
      // Flip the ref FIRST — the interval resumes working seconds immediately
      isOnBreakRef.current = false;
      breakSecondsRef.current = 0;
      // Sync React state for UI
      setIsOnBreak(false);
      setElapsedSeconds(workSecondsRef.current); // display catches up to ref
      setCurrentBreakSeconds(0);
      setHasCompletedBreak(true);
      setBreakStart(null);
    }

    try {
      const res = await fetch("/api/attendance/break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionType }),
      });

      if (res.status === 401) { window.location.href = "/login"; return; }

      const data = await res.json();

      if (!res.ok) {
        // Rollback refs and state
        isOnBreakRef.current = prevIsOnBreak;
        workSecondsRef.current = prevWorkSeconds;
        breakSecondsRef.current = prevBreakSeconds;
        setIsOnBreak(prevIsOnBreak);
        setBreakStart(prevBreakStart);
        setTotalBreakSeconds(prevTotalBreakSeconds);
        setHasCompletedBreak(prevHasCompletedBreak);
        setElapsedSeconds(prevWorkSeconds);
        setNotice({ error: data.message || "Failed to update break status.", success: "" });
      } else {
        // Server confirmed — sync total break seconds and net working seconds (authoritative)
        if ((actionType === "END" || actionType === "FINISH") && data.totalBreakSeconds !== undefined) {
          setTotalBreakSeconds(Number(data.totalBreakSeconds) || 0);
          if (data.netWorkingSeconds !== undefined) {
            const netSec = Number(data.netWorkingSeconds) || 0;
            workSecondsRef.current = netSec;
            setElapsedSeconds(netSec);
          }
        }
        setNotice({ error: "", success: data.message });
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
      }
    } catch {
      // Rollback on network error
      isOnBreakRef.current = prevIsOnBreak;
      workSecondsRef.current = prevWorkSeconds;
      breakSecondsRef.current = prevBreakSeconds;
      setIsOnBreak(prevIsOnBreak);
      setBreakStart(prevBreakStart);
      setTotalBreakSeconds(prevTotalBreakSeconds);
      setHasCompletedBreak(prevHasCompletedBreak);
      setElapsedSeconds(prevWorkSeconds);
      setNotice({ error: "Network error updating break status.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  // Triggers pop-up modal when user clicks Check Out before 8 hours
  const initiateCheckOut = () => {
    const runtimeHours = Number((elapsedSeconds / 3600).toFixed(2));
    const totalHours = Number((totalWorkingHoursToday + (checkedIn ? runtimeHours : 0)).toFixed(2));
    if (runtimeHours < 8.0 || totalHours < 8.0) {
      setReasonInput("");
      setModalError("");
      setShowReasonModal(true);
    } else {
      executeCheckOut(null);
    }
  };

  const executeCheckOut = async (reasonText) => {
    setActionLoading(true);
    setNotice({ error: "", success: "" });
    try {
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonText }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresReason) {
          setShowReasonModal(true);
          setModalError(data.message);
        } else {
          setNotice({ error: data.message || "Failed to check out.", success: "" });
        }
      } else {
        setShowReasonModal(false);
        setCheckedIn(false);
        setIsOnBreak(false);
        setHasCompletedToday(true);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime);
        setElapsedSeconds(0);
        setTotalWorkingHoursToday(data.workingHours || 0);
        setApprovalStatus(data.approvalStatus || (data.isEarly ? "PENDING" : "APPROVED"));
        setEarlyReason(data.earlyReason || reasonText || "");

        if (data.isEarly) {
          setNotice({
            error: "",
            success: `Early Check-Out Recorded (${data.workingHours} ) is less than 8 hrs. Reason sent to HR for approval.`,
          });
        } else {
          setNotice({
            error: "",
            success: `Checked out successfully! Net working hours: ${data.durationFormatted || `${data.workingHours} hrs`}`,
          });
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
        await fetchAttendanceStatus(true);
      }
    } catch {
      setNotice({ error: "Network error. Please try again.", success: "" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReasonSubmit = (e) => {
    e.preventDefault();
    if (!reasonInput.trim()) {
      setModalError("Please specify a reason for checking out before 8 hours.");
      return;
    }
    executeCheckOut(reasonInput.trim());
  };

  const runtimeDecimal = (elapsedSeconds / 3600).toFixed(2);
  const currentCumulativeHours = Number(
    (totalCompletedHoursToday + (checkedIn ? Number(runtimeDecimal) : totalWorkingHoursToday)).toFixed(2)
  );
  const targetWorkHours = 8.0;

  // Real-time progress calculations towards 8 hours (28,800 seconds)
  const targetSeconds = 8 * 3600;
  const totalEffectiveSeconds = checkedIn ? elapsedSeconds : (totalWorkingHoursToday * 3600);
  const progressRatio = Math.min(1.0, Math.max(0, totalEffectiveSeconds / targetSeconds));
  const progressPercentInt = Math.min(100, Math.round(progressRatio * 100));

  // SVG Circular Ring Dimensions for Hero Clock
  const circleRadius = 90;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - progressRatio * circleCircumference;

  const isHR = ["ADMIN", "hr_manager", "hr_executive", "manager", "team_lead"].includes(userRole);

  return (
    <div className="space-y-6 animate-fadeIn relative">
      {/* Top Banner Header */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-[#252d3d] p-6 md:p-8 overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Company Working Standard: 8 Hours
            </div>
            <h1 className="text-xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <span>⏱️</span> Attendance & Working Hours
            </h1>
            <p className="mt-1.5 text-xs md:text-sm text-slate-400 max-w-xl">
              Overall company working time is 8 hours. Start Lunch Break pauses active work time.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[#0f1117]/80 px-4 py-3 rounded-2xl border border-[#252d3d]">
            <div className="text-right">
              <p className="text-[10px] text-slate-500 font-bold uppercase">Status</p>
              <p
                className={`text-xs font-bold ${isOnBreak
                    ? "text-amber-400"
                    : checkedIn
                      ? "text-emerald-400"
                      : hasCompletedToday && approvalStatus === "PENDING"
                        ? "text-amber-400"
                        : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                          ? "text-rose-400"
                          : hasCompletedToday
                            ? "text-sky-400"
                            : "text-slate-400"
                  }`}
              >
                {isOnBreak
                  ? "🍱 ON LUNCH BREAK (PAUSED)"
                  : checkedIn
                    ? "● ON DUTY"
                    : hasCompletedToday && approvalStatus === "PENDING"
                      ? "⌛ PENDING HR APPROVAL"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                        ? "✖ REJECTED (LOP)"
                        : hasCompletedToday
                          ? "✓ COMPLETED TODAY"
                          : "○ OFF DUTY"}
              </p>
            </div>
            <div
              className={`w-3 h-3 rounded-full ${isOnBreak
                  ? "bg-amber-400 animate-pulse"
                  : checkedIn
                    ? "bg-emerald-400 animate-pulse"
                    : hasCompletedToday && approvalStatus === "PENDING"
                      ? "bg-amber-400 animate-pulse"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                        ? "bg-rose-400"
                        : hasCompletedToday
                          ? "bg-sky-400"
                          : "bg-slate-600"
                }`}
            />
          </div>
        </div>
      </div>

      {/* Holiday Notification Banner */}
      {isHoliday && (
        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">🎉</span>
            <div>
              <span className="font-extrabold text-purple-300 text-sm block">Official Company Holiday Today: &quot;{holidayTitle}&quot; ({holidayType || "Paid Holiday"})</span>
              <p className="text-purple-300/80 font-normal mt-0.5">Check-in process is disabled today for all employees in accordance with company policy.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold uppercase tracking-wider border border-purple-500/40 shrink-0">
            Check-In Closed
          </span>
        </div>
      )}

      {/* Approved Leave Notification Banner */}
      {isOnLeaveToday && !checkedIn && (
        <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0">✈️</span>
            <div>
              <span className="font-extrabold text-cyan-300 text-sm block">Status Today: Absent (Approved Leave — {leaveTypeToday})</span>
              <p className="text-cyan-300/80 font-normal mt-0.5">Your leave request was approved by HR. You are credited with 8.0 hours standard leave time.</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold uppercase tracking-wider border border-cyan-500/40 shrink-0">
            Approved Leave
          </span>
        </div>
      )}

      {/* HR Staff Attendance Tracking Inbox (Visible to HR & Admins) */}
      {isHR && <HRAttendanceTracker />}

      {/* Main Punch Clock Hero Card & Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Giant Punch Clock Hero Card */}
        <div className="lg:col-span-2 bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 md:p-8 flex flex-col justify-between space-y-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚡</span> Real-Time Shift Counter
              </h3>
              <p className="text-xs text-slate-400">Standard working time: 8.00 Hours</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${isOnBreak
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                  : checkedIn
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse"
                    : hasCompletedToday && approvalStatus === "PENDING"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : hasCompletedToday
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
            >
              {isOnBreak
                ? "LUNCH BREAK (PAUSED)"
                : checkedIn
                  ? "ACTIVE SHIFT"
                  : hasCompletedToday && approvalStatus === "PENDING"
                    ? "PENDING HR APPROVAL (<8h)"
                    : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                      ? "REJECTED (LOSS OF PAY)"
                      : hasCompletedToday
                        ? "ATTENDANCE COMPLETED"
                        : "SHIFT INACTIVE"}
            </span>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Fetching server status…</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Central Clock Display with SVG Circular Ring */}
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="relative w-48 h-48 md:w-56 md:h-56 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
                    <circle
                      cx="100"
                      cy="100"
                      r={circleRadius}
                      className="stroke-[#0f1117]"
                      strokeWidth="10"
                      fill="transparent"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r={circleRadius}
                      className={`transition-all duration-1000 ease-out ${isOnBreak
                          ? "stroke-amber-400 opacity-80"
                          : checkedIn
                            ? "stroke-emerald-400"
                            : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                              ? "stroke-rose-400"
                              : "stroke-sky-400"
                        }`}
                      strokeWidth="10"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={checkedIn || hasCompletedToday ? strokeDashoffset : circleCircumference}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    {checkedIn ? (
                      <>
                        <span className={`text-xl md:text-3xl font-mono font-black tracking-wider ${isOnBreak ? "text-amber-400" : "text-emerald-400"}`}>
                          {formatSecondsToHHMMSS(elapsedSeconds)}
                        </span>
                        <span className={`text-xs font-bold mt-1 ${isOnBreak ? "text-amber-300" : "text-emerald-400/80"}`}>
                          {runtimeDecimal} / 8.0 hrs
                        </span>
                        {isOnBreak ? (
                          <span className="mt-2 px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider animate-pulse">
                            Timer Paused
                          </span>
                        ) : (
                          <span className="mt-2 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider">
                            {progressPercentInt}% Shift
                          </span>
                        )}
                      </>
                    ) : hasCompletedToday ? (
                      <>
                        <span className={`text-3xl font-black font-mono ${isLop || approvalStatus === "REJECTED"
                            ? "text-rose-400"
                            : approvalStatus === "PENDING"
                              ? "text-amber-400"
                              : "text-sky-400"
                          }`}>
                          {totalWorkingHoursToday.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold text-slate-300">/ 8.0 hrs net</span>
                        <span className={`mt-2 px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${isLop || approvalStatus === "REJECTED"
                            ? "bg-rose-500/20 text-rose-300"
                            : approvalStatus === "PENDING"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-sky-500/20 text-sky-300"
                          }`}>
                          {approvalStatus === "PENDING"
                            ? "Pending Approval"
                            : isLop || approvalStatus === "REJECTED"
                              ? "Loss of Pay"
                              : "Approved"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl mb-2 text-slate-600">⏱️</span>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ready to Check In</span>
                        <span className="text-[10px] text-slate-600 mt-1">8 Hours Shift Target</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-center space-y-1">
                  {isOnBreak ? (
                    <p className="text-xs font-semibold text-amber-400">
                      Shift timer stopped for Lunch Break. Break Duration: <span className="font-mono text-amber-300 font-bold">{formatSecondsToHHMMSS(currentBreakSeconds)}</span>
                    </p>
                  ) : checkedIn ? (
                    <p className="text-xs font-semibold text-emerald-400">
                      Check-in timestamp: <span className="font-mono">{new Date(checkInTime).toLocaleTimeString()}</span>
                      {totalBreakSeconds > 0 && <span className="block text-[11px] text-amber-400">Lunch Break Deducted: {formatSecondsToHHMMSS(totalBreakSeconds)}</span>}
                    </p>
                  ) : hasCompletedToday ? (
                    <p className="text-xs font-semibold text-sky-400">
                      Check-In: <span className="font-mono">{checkInTime ? new Date(checkInTime).toLocaleTimeString() : "—"}</span> | Check-Out: <span className="font-mono">{checkOutTime ? new Date(checkOutTime).toLocaleTimeString() : "—"}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">Postgres server time will be captured upon Check-In</p>
                  )}
                </div>
              </div>

              {/* Loss of Pay Banner */}
              {hasCompletedToday && (approvalStatus === "REJECTED" || isLop) && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-400">
                    <span>⚠️</span> HR Decision: Loss of Pay (LOP) Applied
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Your early check-out request (8h) was rejected by HR. Marked as Loss of Pay.
                    {hrFeedback && <span className="block mt-1 italic text-slate-300">Note: "{hrFeedback}"</span>}
                  </p>
                </div>
              )}

              {/* Pending HR Approval Banner */}
              {hasCompletedToday && approvalStatus === "PENDING" && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-400">
                    <span>⌛</span> HR Approval Pending
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    Early check-out note delivered to HR. Pending HR review and decision.
                    {earlyReason && <span className="block mt-1 italic text-amber-200">Your Reason: "{earlyReason}"</span>}
                  </p>
                </div>
              )}

              {/* Feedback Notices */}
              {notice.error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium">
                  {notice.error}
                </div>
              )}
              {notice.success && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs text-center font-medium">
                  {notice.success}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                {checkedIn ? (
                  <div className="space-y-2">
                    {isOnBreak ? (
                      <button
                        type="button"
                        onClick={() => handleToggleBreak("END")}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span className="text-base">▶</span>
                            <span>Finish Lunch Break (Resume Shift Timer)</span>
                          </>
                        )}
                      </button>
                    ) : (hasCompletedBreak || totalBreakSeconds > 0) ? (
                      <div className="space-y-2">
                        <div className="py-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                          <span>✓</span>
                          <span>Lunch Break Completed for Today (Single break policy)</span>
                        </div>
                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="w-full py-4 rounded-xl border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-sm font-bold transition shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">⏹</span>
                          <span>Check Out</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleBreak("START")}
                          disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                          className="py-3.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">🍱</span>
                          <span>Start Lunch Break</span>
                        </button>

                        <button
                          type="button"
                          onClick={initiateCheckOut}
                          disabled={actionLoading}
                          className="py-3.5 rounded-xl border border-rose-500/30 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span className="text-base">⏹</span>
                          <span>Check Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : hasCompletedToday ? (
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center space-y-1">
                    <p className={`text-xs font-bold flex items-center justify-center gap-1.5 ${isLop ? "text-rose-400" : approvalStatus === "PENDING" ? "text-amber-400" : "text-sky-400"
                      }`}>
                      <span>{isLop ? "✖" : approvalStatus === "PENDING" ? "⌛" : "✓"}</span>
                      <span>
                        {isLop
                          ? "Attendance Completed (Loss of Pay)"
                          : approvalStatus === "PENDING"
                            ? "Early Check-Out Awaiting HR Approval"
                            : "Attendance Completed For Today"}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Single daily check-in rule enforced. Net working hours locked.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCheckIn}
                    disabled={actionLoading || isHoliday || isOnLeaveToday}
                    className={`w-full py-4 rounded-xl text-sm font-bold transition shadow-xl flex items-center justify-center gap-2 ${
                      isHoliday
                        ? "bg-slate-900 border border-purple-500/40 text-purple-300 cursor-not-allowed"
                        : isOnLeaveToday
                        ? "bg-slate-900 border border-cyan-500/40 text-cyan-300 cursor-not-allowed"
                        : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    }`}
                  >
                    {actionLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Fetching PostgreSQL server timestamp…</span>
                      </>
                    ) : isHoliday ? (
                      <>
                        <span className="text-base">🎉</span>
                        <span>COMPANY HOLIDAY — CHECK-IN CLOSED</span>
                      </>
                    ) : isOnLeaveToday ? (
                      <>
                        <span className="text-base">✈️</span>
                        <span>ON APPROVED LEAVE — ABSENT TODAY</span>
                      </>
                    ) : (
                      <>
                        <span className="text-base">▶</span>
                        <span>Check In Now (Record Server Time)</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side Summary Stats Cards Column */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-[#252d3d] pb-3">
              Daily Hours Summary (Net Working Time)
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-slate-400 font-semibold">Daily Shift Target (8 hrs)</span>
                  <span className="font-bold text-white font-mono">{currentCumulativeHours} / 8.00 hrs</span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-[#252d3d]">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${isOnBreak
                        ? "bg-gradient-to-r from-amber-500 to-orange-400 opacity-80"
                        : "bg-gradient-to-r from-indigo-500 via-emerald-500 to-teal-400"
                      }`}
                    style={{ width: `${progressPercentInt}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 text-right">{progressPercentInt}% of target shift completed</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-[#0f1117] border border-[#252d3d] rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Check-In Time</span>
                  <p className="text-xs font-mono font-bold text-slate-200">
                    {checkInTime ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>

                <div className="p-3 bg-[#0f1117] border border-[#252d3d] rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Net Working Hours</span>
                  <p className="text-xs font-mono font-bold text-emerald-400">
                    {currentCumulativeHours.toFixed(2)} hrs
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Org Presence Card */}
          <AttendanceOverviewCard />
        </div>
      </div>

      {/* Today's Punch History Logs Table */}
      <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📋</span> Today's Shift Record
            </h3>
            <p className="text-xs text-slate-400">Historical single-shift attendance log recorded in PostgreSQL for today</p>
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-[#252d3d] text-slate-400 text-[10px] font-mono">
            {todayLogs.length} Record
          </span>
        </div>

        {todayLogs.length === 0 ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <p className="text-3xl">⏱️</p>
            <p className="text-xs">No check-in log recorded for today yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#252d3d] text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Check In (PostgreSQL)</th>
                  <th className="py-3 px-4">Check Out (PostgreSQL)</th>
                  <th className="py-3 px-4">Lunch Break Duration</th>
                  <th className="py-3 px-4">Net Working Hours</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252d3d]/60">
                {todayLogs.map((log, idx) => {
                  const checkInMs = new Date(log.check_in).getTime();
                  let checkOutMs;
                  if (log.check_out) {
                    checkOutMs = new Date(log.check_out).getTime();
                  } else if (log.status === "ON_BREAK") {
                    const breakStartIso = log.break_start || log.updated_at || log.check_in;
                    checkOutMs = new Date(breakStartIso).getTime();
                  } else {
                    checkOutMs = checkInMs + Math.max(0, elapsedSeconds * 1000);
                  }
                  const grossSec = Math.max(0, Math.floor((checkOutMs - checkInMs) / 1000));
                  const breakSec = Number(log.total_break_seconds) || 0;
                  const netSec = Math.max(0, grossSec - breakSec);
                  const isActive = log.status === "CHECKED_IN" || log.status === "ON_BREAK";
                  const hoursVal = (!isActive && log.working_hours) ? Number(log.working_hours).toFixed(2) : (netSec / 3600).toFixed(2);

                  return (
                    <tr key={log.id || idx} className="hover:bg-[#1e2334] transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-200 font-semibold">
                        {new Date(log.check_in).toLocaleTimeString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {log.check_out ? new Date(log.check_out).toLocaleTimeString() : log.status === "ON_BREAK" ? <span className="text-amber-400 font-bold animate-pulse">On Lunch Break</span> : <span className="text-emerald-400 font-bold">Active Shift</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-amber-400">
                        {formatDurationText(breakSec)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400">
                        {hoursVal} hrs
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${log.status === "ON_BREAK"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                              : log.status === "CHECKED_IN"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : log.status === "PENDING_APPROVAL"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : log.status === "REJECTED_LOP"
                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    : "bg-sky-500/10 text-sky-400 border-sky-500/20"
                            }`}
                        >
                          {log.status === "ON_BREAK"
                            ? "🍱 ON LUNCH BREAK"
                            : log.status === "CHECKED_IN"
                              ? "● ON DUTY"
                              : log.status === "PENDING_APPROVAL"
                                ? "⌛ PENDING HR (<8h)"
                                : log.status === "REJECTED_LOP"
                                  ? "✖ LOSS OF PAY"
                                  : "✓ COMPLETED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── EARLY CHECKOUT REASON POP-UP MODAL ────────────────────────────────────── */}
      {showReasonModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1a1e2a] border border-amber-500/50 rounded-2xl p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#252d3d] pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <span className="text-lg">⏱️</span>
                <span>Early Check-Out Reason Required</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReasonModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2">
              <p className="leading-relaxed">
                Company standard overall working time is <strong className="text-amber-400">8 Hours</strong>. Your net shift duration (deducting lunch break) is <strong className="text-white font-mono">{runtimeDecimal} hrs</strong>.
              </p>
              <p className="text-slate-400 text-[11px]">
                Please enter a reason for checking out before 8 hours. This message will be delivered to HR for approval or rejection (Loss of Pay).
              </p>
            </div>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleReasonSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Reason for Early Check-Out *
                </label>
                <textarea
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="e.g. Medical emergency / Personal work / Prior approval from manager..."
                  className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReasonModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#252d3d] text-slate-400 hover:text-white text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Submit to HR</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
