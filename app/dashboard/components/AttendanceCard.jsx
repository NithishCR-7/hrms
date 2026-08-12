"use client";

import React, { useState, useEffect, useRef } from "react";

function formatSecondsToHHMMSS(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00h 00m 00s";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

/**
 * AttendanceCard Component
 * Real-Time 8-Hour Working Standard Tracker with SVG Circular Progress Ring.
 * Synchronizes server & client time. Employs silent background polling to eliminate loading flicker.
 * Freezes shift timer and progress ring on Lunch Break start; resumes seamlessly on Finish.
 */
export default function AttendanceCard() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);
  const [checkInTime, setCheckInTime] = useState(null);
  const [checkOutTime, setCheckOutTime] = useState(null);
  const [workDate, setWorkDate] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalWorkingHoursToday, setTotalWorkingHoursToday] = useState(0);
  const [totalCompletedHoursToday, setTotalCompletedHoursToday] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);

  // Lunch break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [hasCompletedBreak, setHasCompletedBreak] = useState(false);
  const [breakStart, setBreakStart] = useState(null);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [currentBreakSeconds, setCurrentBreakSeconds] = useState(0);

  // Early checkout & HR approval states
  const [approvalStatus, setApprovalStatus] = useState("APPROVED");
  const [earlyReason, setEarlyReason] = useState("");
  const [isLop, setIsLop] = useState(false);
  const [hrFeedback, setHrFeedback] = useState("");
  
  // Modal state for early checkout reason prompt
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

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ error: "", success: "" });

  // ─── Timer refs (never stale, no closure issues) ─────────────────────────────
  const workSecondsRef  = useRef(0);
  const breakSecondsRef = useRef(0);
  const isOnBreakRef    = useRef(false);
  const timerRef        = useRef(null);

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

        // ─── Metadata — safe to update every poll ────────────────────────────
        setCheckedIn(data.checkedIn);
        setHasCompletedToday(data.hasCompletedToday || false);
        setCheckInTime(data.checkInTime);
        setCheckOutTime(data.checkOutTime || null);
        setWorkDate(data.workDate || null);
        setTotalWorkingHoursToday(data.totalWorkingHoursToday || 0);
        setTotalCompletedHoursToday(data.totalCompletedHoursToday || 0);
        setApprovalStatus(data.approvalStatus || (data.status === "PENDING_APPROVAL" ? "PENDING" : data.status === "REJECTED_LOP" ? "REJECTED" : "APPROVED"));
        setEarlyReason(data.earlyReason || "");
        setIsLop(data.isLop || data.status === "REJECTED_LOP");
        setHrFeedback(data.hrFeedback || "");
        setIsHoliday(Boolean(data.isHoliday));
        setHolidayTitle(data.holidayTitle || "");
        setHolidayType(data.holidayType || "");
        setIsOnLeaveToday(Boolean(data.isOnLeave));
        setLeaveTypeToday(data.leaveType || "");

        // If today is a clean new day (neither checked in nor completed today)
        if (!data.checkedIn && !data.hasCompletedToday) {
          workSecondsRef.current  = 0;
          breakSecondsRef.current = 0;
          isOnBreakRef.current    = false;
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
          const onBreak    = data.isOnBreak || false;
          const netSeconds = Number(data.netWorkingSeconds ?? data.elapsedSeconds) || 0;
          const breakSec   = Number(data.currentBreakSeconds) || 0;

          workSecondsRef.current  = netSeconds;
          breakSecondsRef.current = breakSec;
          isOnBreakRef.current    = onBreak;

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

    const pollInterval = setInterval(() => {
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
      clearInterval(pollInterval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, []);

  // ─── SINGLE INTERVAL TIMER ────────────────────────────────────────────────────
  // One interval runs whenever checkedIn=true.
  // Every tick reads isOnBreakRef (a ref — never stale) to decide what to count:
  //   isOnBreakRef=false → increment workSecondsRef → update elapsedSeconds display
  //   isOnBreakRef=true  → increment breakSecondsRef → update currentBreakSeconds display
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!checkedIn) {
      workSecondsRef.current  = 0;
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
        workSecondsRef.current  = 0;
        breakSecondsRef.current = 0;
        isOnBreakRef.current    = false;
        setIsOnBreak(false);
        setHasCompletedBreak(false);
        setBreakStart(null);
        setTotalBreakSeconds(0);
        setCurrentBreakSeconds(0);
        setHasCompletedToday(false);
        setCheckInTime(data.checkInTime);
        if (data.workDate) setWorkDate(data.workDate);
        setApprovalStatus("APPROVED");
        setEarlyReason("");
        setIsLop(false);
        setElapsedSeconds(0);
        setNotice({ error: "", success: `Checked in at ${new Date(data.checkInTime).toLocaleTimeString()} (Postgres Server Time)` });
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
  // START: isOnBreakRef=true  → interval immediately stops touching workSecondsRef
  // END  : isOnBreakRef=false → interval immediately resumes from workSecondsRef
  // ─────────────────────────────────────────────────────────────────────────────
  const handleToggleBreak = async (actionType) => {
    // Hard guard: only one lunch break per day (blocked if break was already taken or completed)
    if (actionType === "START" && (hasCompletedBreak || totalBreakSeconds > 0)) return;

    setActionLoading(true);
    setNotice({ error: "", success: "" });

    const prevIsOnBreak         = isOnBreak;
    const prevBreakStart        = breakStart;
    const prevTotalBreakSeconds = totalBreakSeconds;
    const prevHasCompletedBreak = hasCompletedBreak;
    const prevWorkSeconds       = workSecondsRef.current;
    const prevBreakSeconds      = breakSecondsRef.current;

    if (actionType === "START") {
      isOnBreakRef.current    = true;
      breakSecondsRef.current = 0;
      setIsOnBreak(true);
      setBreakStart(new Date().toISOString());
      setCurrentBreakSeconds(0);
    } else {
      isOnBreakRef.current    = false;
      breakSecondsRef.current = 0;
      setIsOnBreak(false);
      setElapsedSeconds(workSecondsRef.current);
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
        isOnBreakRef.current    = prevIsOnBreak;
        workSecondsRef.current  = prevWorkSeconds;
        breakSecondsRef.current = prevBreakSeconds;
        setIsOnBreak(prevIsOnBreak);
        setBreakStart(prevBreakStart);
        setTotalBreakSeconds(prevTotalBreakSeconds);
        setHasCompletedBreak(prevHasCompletedBreak);
        setElapsedSeconds(prevWorkSeconds);
        setNotice({ error: data.message || "Failed to update lunch break status.", success: "" });
      } else {
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
      isOnBreakRef.current    = prevIsOnBreak;
      workSecondsRef.current  = prevWorkSeconds;
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

  // Called when user clicks "Check Out"
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
            success: `Early Check-Out Recorded (${data.workingHours} net hrs, <8h). Reason sent to HR for approval.`,
          });
        } else {
          setNotice({
            error: "",
            success: `Shift completed! Calculated net working hours: ${data.durationFormatted || `${data.workingHours} hrs`}`,
          });
        }
        if (typeof window !== "undefined") window.dispatchEvent(new Event("attendance-updated"));
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
      setModalError("Please specify a reason for early check-out (< 8 hours).");
      return;
    }
    executeCheckOut(reasonInput.trim());
  };

  const runtimeWorkingHoursDecimal = (elapsedSeconds / 3600).toFixed(2);
  const formattedCheckInTime = checkInTime
    ? new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const formattedCheckOutTime = checkOutTime
    ? new Date(checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  // Real-time progress calculations towards 8 hours (28,800 seconds)
  const targetSeconds = 8 * 3600;
  const totalEffectiveSeconds = checkedIn ? elapsedSeconds : (totalWorkingHoursToday * 3600);
  const progressRatio = Math.min(1.0, Math.max(0, totalEffectiveSeconds / targetSeconds));
  const progressPercentInt = Math.min(100, Math.round(progressRatio * 100));

  // SVG Circular Ring Dimensions
  const circleRadius = 50;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circleCircumference - progressRatio * circleCircumference;

  return (
    <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xl hover:border-slate-700/60 transition-all duration-300 relative">
      
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>⏱️</span> Daily Attendance
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Overall company working time: 8 Hours</p>
        </div>
        
        {/* Dynamic Status Badge */}
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
            isOnBreak
              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
              : checkedIn
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse"
              : hasCompletedToday && approvalStatus === "PENDING"
              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
              : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
              ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
              : hasCompletedToday
              ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
              : "bg-slate-800/60 text-slate-400 border-slate-700"
          }`}
        >
          {isOnBreak
            ? "🍱 ON LUNCH BREAK (PAUSED)"
            : checkedIn
            ? "● ON DUTY"
            : hasCompletedToday && approvalStatus === "PENDING"
            ? "⌛ PENDING HR APPROVAL (<8h)"
            : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
            ? "✖ REJECTED (LOSS OF PAY / LOP)"
            : hasCompletedToday
            ? "✓ SHIFT COMPLETED (APPROVED)"
            : "○ OFF DUTY"}
        </span>
      </div>

      {isHoliday && (
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-200 text-xs font-semibold flex items-center justify-between gap-2 shadow-sm mb-3">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span className="truncate">Holiday Today: &quot;{holidayTitle}&quot;</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[9px] font-mono font-bold uppercase tracking-wider border border-purple-500/40 shrink-0">
            Check-In Active
          </span>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Syncing attendance server state…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Circular Indicator with Live SVG Progress Ring */}
          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* SVG Ring Background & Animated Fill */}
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r={circleRadius}
                  className="stroke-[#0f1117]"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={circleRadius}
                  className={`transition-all duration-1000 ease-out ${
                    isOnBreak
                      ? "stroke-amber-400 opacity-80"
                      : checkedIn
                      ? "stroke-emerald-400"
                      : hasCompletedToday && (approvalStatus === "REJECTED" || isLop)
                      ? "stroke-rose-400"
                      : "stroke-sky-400"
                  }`}
                  strokeWidth="8"
                  strokeDasharray={circleCircumference}
                  strokeDashoffset={checkedIn || hasCompletedToday ? strokeDashoffset : circleCircumference}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>

              {/* Central Clock Contents */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {checkedIn ? (
                  <>
                    <span className={`text-xs font-mono font-extrabold tracking-wider ${isOnBreak ? "text-amber-400" : "text-emerald-400"}`}>
                      {formatSecondsToHHMMSS(elapsedSeconds)}
                    </span>
                    <span className={`text-[10px] font-bold mt-0.5 ${isOnBreak ? "text-amber-300" : "text-emerald-400/80"}`}>
                      {runtimeWorkingHoursDecimal} / 8.0 hrs
                    </span>
                    {isOnBreak ? (
                      <span className="mt-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold uppercase tracking-wider animate-pulse">
                        Paused
                      </span>
                    ) : (
                      <span className="mt-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase tracking-wider">
                        {progressPercentInt}%
                      </span>
                    )}
                  </>
                ) : hasCompletedToday ? (
                  <>
                    <span className={`text-xl font-bold font-mono ${
                      isLop || approvalStatus === "REJECTED"
                        ? "text-rose-400"
                        : approvalStatus === "PENDING"
                        ? "text-amber-400"
                        : "text-sky-400"
                    }`}>
                      {totalWorkingHoursToday.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">/ 8.0 hrs net</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl mb-1">◎</span>
                    <span className="text-[10px] font-semibold text-slate-400">Offline</span>
                  </>
                )}
              </div>
            </div>

            {/* Subtitle Details */}
            <div className="mt-3 text-center space-y-1">
              {isOnBreak ? (
                <>
                  <p className="text-xs font-bold text-amber-400">Shift timer stopped for Lunch Break</p>
                  <p className="text-[11px] text-slate-400">
                    Lunch Duration: <span className="font-mono text-amber-300 font-bold">{formatSecondsToHHMMSS(currentBreakSeconds)}</span>
                  </p>
                </>
              ) : checkedIn ? (
                <>
                  <p className="text-xs font-bold text-emerald-400">Shift active since {formattedCheckInTime}</p>
                  {totalBreakSeconds > 0 && (
                    <p className="text-[11px] text-amber-400">Lunch break deducted: {formatSecondsToHHMMSS(totalBreakSeconds)}</p>
                  )}
                </>
              ) : hasCompletedToday ? (
                <>
                  <p className={`text-xs font-bold ${
                    isLop || approvalStatus === "REJECTED"
                      ? "text-rose-400"
                      : approvalStatus === "PENDING"
                      ? "text-amber-400"
                      : "text-sky-400"
                  }`}>
                    {approvalStatus === "PENDING"
                      ? "Early Check-Out Sent to HR for Approval"
                      : isLop || approvalStatus === "REJECTED"
                      ? "Early Check-Out Rejected — Loss of Pay (LOP)"
                      : "Shift Completed & Approved"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    In: {formattedCheckInTime || "—"} | Out: {formattedCheckOutTime || "—"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Not checked in yet today</p>
              )}
            </div>
          </div>

          {/* LOP Banner Alert if rejected by HR */}
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

          {/* HR Approval Pending Banner */}
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

          {/* Feedback Notice Banner */}
          {notice.error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-medium">
              {notice.error}
            </div>
          )}
          {notice.success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs text-center font-medium">
              {notice.success}
            </div>
          )}

          {/* Action Buttons */}
          {checkedIn ? (
            <div className="space-y-2">
              {isOnBreak ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleBreak("END")}
                    disabled={actionLoading}
                    className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>▶</span>
                    <span>Resume Shift</span>
                  </button>
                  <button
                    type="button"
                    onClick={initiateCheckOut}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>⏹</span>
                    <span>Check Out</span>
                  </button>
                </div>
              ) : (hasCompletedBreak || totalBreakSeconds > 0) ? (
                <div className="space-y-2">
                  <div className="py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-bold text-center flex items-center justify-center gap-1.5">
                    <span>✓</span>
                    <span>Lunch Break Completed (Single break policy)</span>
                  </div>
                  <button
                    type="button"
                    onClick={initiateCheckOut}
                    disabled={actionLoading}
                    className="w-full py-3 rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>⏹</span>
                    <span>Check Out</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleBreak("START")}
                    disabled={actionLoading || hasCompletedBreak || totalBreakSeconds > 0}
                    className="py-3 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>🍱</span>
                    <span>Start Lunch</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={initiateCheckOut}
                    disabled={actionLoading}
                    className="py-3 rounded-xl border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>⏹</span>
                    <span>Check Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : hasCompletedToday ? (
            <button
              disabled
              className={`w-full py-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-not-allowed opacity-90 ${
                isLop || approvalStatus === "REJECTED"
                  ? "bg-rose-950/40 border-rose-500/30 text-rose-400"
                  : approvalStatus === "PENDING"
                  ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                  : "bg-slate-800/80 border-slate-700 text-slate-400"
              }`}
            >
              <span>{isLop ? "✖" : approvalStatus === "PENDING" ? "⌛" : "✓"}</span>
              <span>
                {isLop
                  ? "Attendance Completed (Loss of Pay)"
                  : approvalStatus === "PENDING"
                  ? "Early Check-Out Awaiting HR Approval"
                  : "Attendance Completed For Today"}
              </span>
            </button>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={actionLoading || isHoliday || isOnLeaveToday}
              className={`w-full py-3 rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center gap-2 ${
                isHoliday
                  ? "bg-slate-900 border border-purple-500/40 text-purple-300 cursor-not-allowed"
                  : isOnLeaveToday
                  ? "bg-slate-900 border border-cyan-500/40 text-cyan-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              }`}
            >
              {actionLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Fetching server timestamp…</span>
                </>
              ) : isHoliday ? (
                <>
                  <span>🎉</span>
                  <span>COMPANY HOLIDAY — CHECK-IN CLOSED</span>
                </>
              ) : isOnLeaveToday ? (
                <>
                  <span>✈️</span>
                  <span>ON APPROVED LEAVE — ABSENT TODAY</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>Check In Now</span>
                </>
              )}
            </button>
          )}

          {/* Footer Total Working Hours & Progress Bar */}
          <div className="pt-2 border-t border-[#252d3d] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Net Shift Working Hours:</span>
              <span className="font-bold text-slate-200 font-mono">
                {(totalCompletedHoursToday + (checkedIn ? Number(runtimeWorkingHoursDecimal) : totalWorkingHoursToday)).toFixed(2)} / 8.0 hrs
              </span>
            </div>

            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-[#252d3d]">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isOnBreak
                    ? "bg-gradient-to-r from-amber-500 to-orange-400 opacity-80"
                    : "bg-gradient-to-r from-indigo-500 via-emerald-500 to-teal-400"
                }`}
                style={{ width: `${progressPercentInt}%` }}
              />
            </div>
          </div>
        </div>
      )}

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
                Company standard overall working time is <strong className="text-amber-400">8 Hours</strong>. Your net shift duration (deducting lunch break) is <strong className="text-white font-mono">{runtimeWorkingHoursDecimal} hrs</strong>.
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
                
                {/* Quick Selection Chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    "Medical Emergency",
                    "Personal Urgent Work",
                    "Completed Today's Tasks",
                    "Manager Prior Approval",
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setReasonInput(tag);
                        setModalError("");
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition cursor-pointer ${
                        reasonInput === tag
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                          : "bg-[#0f1117] text-slate-400 border-[#252d3d] hover:text-slate-200 hover:border-slate-600"
                      }`}
                    >
                      + {tag}
                    </button>
                  ))}
                </div>

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
