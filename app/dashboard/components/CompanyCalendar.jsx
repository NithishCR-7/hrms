"use client";

import React, { useState, useEffect } from "react";

const ALL_DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const HOLIDAY_TYPES = [
  "Paid Holiday",
  "National Holiday",
  "Regional / Festival",
  "Mandatory Closure",
  "Optional Holiday",
];

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function CompanyCalendar() {
  const [loading, setLoading] = useState(true);
  const [isHR, setIsHR] = useState(false);
  const [companyName, setCompanyName] = useState("");
  
  const [schedule, setSchedule] = useState({
    dailyWorkingHours: 8.0,
    startTime: "09:00",
    endTime: "17:00",
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  });

  const [holidays, setHolidays] = useState([]);
  const [notice, setNotice] = useState({ error: "", success: "" });

  // Date Navigation State for Month View
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [activeTab, setActiveTab] = useState("month"); // 'month' | 'list'

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    dailyWorkingHours: 8.0,
    startTime: "09:00",
    endTime: "17:00",
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    holidayType: "Paid Holiday",
    description: "",
  });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Fetch Calendar Data
  const fetchCalendarData = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch("/api/company/calendar");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setIsHR(data.isHR || false);
        setCompanyName(data.companyName || "Company Workspace");
        if (data.schedule) {
          setSchedule(data.schedule);
          setScheduleForm(data.schedule);
        }
        if (data.holidays) {
          setHolidays(data.holidays);
        }
      }
    } catch (err) {
      console.error("Failed to fetch company calendar:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData(true);
  }, []);

  // Save Working Schedule (HR Only)
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    setScheduleSaving(true);
    setNotice({ error: "", success: "" });

    try {
      const res = await fetch("/api/company/calendar/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scheduleForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to update working schedule.", success: "" });
      } else {
        if (data.schedule) setSchedule(data.schedule);
        setNotice({ error: "", success: data.message || "Working hours updated successfully!" });
        setShowScheduleModal(false);
      }
    } catch {
      setNotice({ error: "Network error saving working schedule.", success: "" });
    } finally {
      setScheduleSaving(false);
    }
  };

  // Add Holiday (HR Only)
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!holidayForm.title.trim() || !holidayForm.date) {
      setNotice({ error: "Please enter holiday title and date.", success: "" });
      return;
    }

    setHolidaySaving(true);
    setNotice({ error: "", success: "" });

    try {
      const res = await fetch("/api/company/calendar/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holidayForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to add holiday.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Holiday added successfully!" });
        setShowHolidayModal(false);
        setHolidayForm({
          title: "",
          date: new Date().toISOString().split("T")[0],
          holidayType: "Paid Holiday",
          description: "",
        });
        fetchCalendarData(true);
      }
    } catch {
      setNotice({ error: "Network error adding holiday.", success: "" });
    } finally {
      setHolidaySaving(false);
    }
  };

  // Delete Holiday (HR Only)
  const handleDeleteHoliday = async (holidayId) => {
    if (!confirm("Are you sure you want to remove this holiday from the company calendar?")) return;
    setActionLoadingId(holidayId);
    setNotice({ error: "", success: "" });

    try {
      const res = await fetch(`/api/company/calendar/holidays?id=${holidayId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotice({ error: data.message || "Failed to delete holiday.", success: "" });
      } else {
        setNotice({ error: "", success: data.message || "Holiday deleted." });
        setHolidays((prev) => prev.filter((h) => h.id !== holidayId));
      }
    } catch {
      setNotice({ error: "Network error deleting holiday.", success: "" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Month Navigation
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString("en-US", {
    month: "long",
  });

  // Calculate Days Grid for Month View
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sun, 1=Mon...
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Mon=0, Sun=6

  const monthDaysGrid = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    monthDaysGrid.push(null); // blank padding
  }
  for (let day = 1; day <= daysInMonth; day++) {
    monthDaysGrid.push(day);
  }

  // Find Holidays for selected month
  const getHolidaysForDay = (dayNum) => {
    if (!dayNum) return [];
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    return holidays.filter((h) => h.date === dateStr);
  };

  // Upcoming Holidays Calculation
  const todayStr = new Date().toISOString().split("T")[0];
  const upcomingHolidays = holidays
    .filter((h) => h.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextHoliday = upcomingHolidays[0] || null;

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">📅</span>
            <h2 className="text-xl font-bold text-white tracking-tight">Company Working Calendar</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold">
              {companyName}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {isHR
              ? "HR Portal — Manage standard company working hours, work days, and official holidays."
              : "Employee Portal — View your company's official working schedule and upcoming holidays."}
          </p>
        </div>

        {/* Action Controls for HR */}
        {isHR && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setScheduleForm(schedule);
                setShowScheduleModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2 shadow-sm"
            >
              <span>⚙️</span> Configure Working Hours
            </button>
            <button
              onClick={() => setShowHolidayModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/20 flex items-center gap-2"
            >
              <span>🎉</span> Add Company Holiday
            </button>
          </div>
        )}
      </div>

      {/* Notice Banner */}
      {notice.error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
          <span>⚠️ {notice.error}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}
      {notice.success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
          <span>✅ {notice.success}</span>
          <button onClick={() => setNotice({ error: "", success: "" })} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Working Hours */}
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Standard Working Hours</span>
            <span className="text-lg">⏱️</span>
          </div>
          <div className="text-2xl font-black text-white">{schedule.dailyWorkingHours} Hours / Day</div>
          <div className="text-[11px] text-slate-400 font-mono">
            {schedule.startTime} — {schedule.endTime}
          </div>
        </div>

        {/* Work Days */}
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Work Days</span>
            <span className="text-lg">🗓️</span>
          </div>
          <div className="text-2xl font-black text-indigo-400">{schedule.workDays.length} Days / Week</div>
          <div className="text-[11px] text-slate-400 truncate">
            {schedule.workDays.join(", ")}
          </div>
        </div>

        {/* Total Holidays */}
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company Holidays</span>
            <span className="text-lg">🌴</span>
          </div>
          <div className="text-2xl font-black text-amber-400">{holidays.length} Holidays</div>
          <div className="text-[11px] text-slate-400">
            {upcomingHolidays.length} upcoming this year
          </div>
        </div>

        {/* Next Holiday */}
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Next Upcoming Holiday</span>
            <span className="text-lg">🎈</span>
          </div>
          {nextHoliday ? (
            <div>
              <div className="text-sm font-bold text-white truncate">{nextHoliday.title}</div>
              <div className="text-[11px] text-emerald-400 font-semibold mt-1">
                {formatDateDisplay(nextHoliday.date)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic py-1">No upcoming holidays scheduled</div>
          )}
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 space-y-6 shadow-xl">
        
        <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("month")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "month"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              📅 Month View
            </button>
            <button
              onClick={() => setActiveTab("list")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "list"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              📋 Holidays List ({holidays.length})
            </button>
          </div>

          {/* Month Navigator Controls */}
          {activeTab === "month" && (
            <div className="flex items-center gap-3">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition"
              >
                ‹
              </button>
              <span className="text-sm font-bold text-white font-mono min-w-[130px] text-center">
                {monthName} {currentYear}
              </span>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition"
              >
                ›
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading company calendar data…</span>
          </div>
        ) : activeTab === "month" ? (
          /* MONTH GRID VIEW */
          <div className="space-y-4">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-[#252d3d]">
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div className="text-amber-400/80">Sat</div>
              <div className="text-amber-400/80">Sun</div>
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {monthDaysGrid.map((dayNum, idx) => {
                if (!dayNum) {
                  return <div key={`empty-${idx}`} className="h-28 rounded-xl bg-slate-950/20 border border-slate-800/30" />;
                }

                const isTodayDate =
                  dayNum === today.getDate() &&
                  currentMonth === today.getMonth() &&
                  currentYear === today.getFullYear();

                const dateObj = new Date(currentYear, currentMonth, dayNum);
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                const isWorkDay = schedule.workDays.includes(dayName);
                const dayHolidays = getHolidaysForDay(dayNum);

                const formattedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

                return (
                  <div
                    key={`day-${dayNum}`}
                    onClick={() => {
                      if (isHR) {
                        setHolidayForm({
                          title: "",
                          date: formattedDateStr,
                          holidayType: "Paid Holiday",
                          description: "",
                        });
                        setShowHolidayModal(true);
                      }
                    }}
                    className={`h-28 rounded-xl p-2.5 border flex flex-col justify-between transition relative group ${
                      isHR ? "cursor-pointer hover:border-indigo-500/60" : ""
                    } ${
                      isTodayDate
                        ? "bg-indigo-500/10 border-indigo-500/50 shadow-md"
                        : dayHolidays.length > 0
                        ? "bg-amber-500/10 border-amber-500/40"
                        : !isWorkDay
                        ? "bg-slate-950/60 border-slate-800/50 opacity-75"
                        : "bg-[#0f1117] border-[#252d3d]"
                    }`}
                  >
                    {/* Top Row: Day Number & Status Badges */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center font-mono ${
                          isTodayDate
                            ? "bg-indigo-600 text-white"
                            : "text-slate-300"
                        }`}
                      >
                        {dayNum}
                      </span>

                      {!isWorkDay && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          Weekend
                        </span>
                      )}
                    </div>

                    {/* Holidays Badge List */}
                    <div className="space-y-1 overflow-y-auto max-h-14 pr-0.5">
                      {dayHolidays.map((h) => (
                        <div
                          key={h.id}
                          className="p-1 rounded bg-amber-500/20 border border-amber-500/30 text-amber-200 text-[10px] font-bold truncate flex items-center gap-1 shadow-sm"
                          title={`${h.title} (${h.holidayType})`}
                        >
                          <span>🌴</span>
                          <span className="truncate">{h.title}</span>
                        </div>
                      ))}
                    </div>

                    {/* Bottom HR Hover Hint */}
                    {isHR && (
                      <div className="text-[9px] text-indigo-400 font-semibold opacity-0 group-hover:opacity-100 transition">
                        + Click to add holiday
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* HOLIDAY LIST VIEW */
          <div className="space-y-4">
            {holidays.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-[#0f1117] rounded-2xl border border-[#252d3d]">
                <p className="text-sm font-bold text-slate-300">No Company Holidays Scheduled</p>
                <p className="text-xs text-slate-500">
                  {isHR
                    ? "Click 'Add Company Holiday' above to schedule official company holidays."
                    : "Your HR department has not scheduled any company holidays yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    className="bg-[#0f1117] border border-[#252d3d] hover:border-slate-700 p-4 rounded-2xl flex items-center justify-between transition shadow-md"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🌴</span>
                        <h4 className="text-sm font-bold text-white">{h.title}</h4>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold">
                          {h.holidayType}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-emerald-400 font-mono">
                        {formatDateDisplay(h.date)}
                      </p>
                      {h.description && (
                        <p className="text-xs text-slate-400 italic pt-0.5">{h.description}</p>
                      )}
                    </div>

                    {isHR && (
                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        disabled={actionLoadingId === h.id}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold transition disabled:opacity-50"
                        title="Delete holiday"
                      >
                        {actionLoadingId === h.id ? "…" : "🗑️"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL 1: CONFIGURE WORKING HOURS (HR ONLY) ───────────────────────── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-fadeIn">
            
            <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>⚙️</span> Configure Company Working Hours
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Set daily standard target hours, working window, and work days.</p>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-5 text-xs">
              
              {/* Target Hours */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold uppercase tracking-wider">
                  Daily Standard Target Hours *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  value={scheduleForm.dailyWorkingHours}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, dailyWorkingHours: e.target.value })
                  }
                  required
                  className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Start & End Time Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold uppercase tracking-wider">
                    Standard Start Time *
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, startTime: e.target.value })
                    }
                    required
                    className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold uppercase tracking-wider">
                    Standard End Time *
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, endTime: e.target.value })
                    }
                    required
                    className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Work Days Checkboxes */}
              <div className="space-y-2">
                <label className="block text-slate-300 font-bold uppercase tracking-wider">
                  Active Working Days *
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#0f1117] p-3 rounded-xl border border-[#252d3d]">
                  {ALL_DAYS_OF_WEEK.map((day) => {
                    const isChecked = scheduleForm.workDays.includes(day);
                    return (
                      <label key={day} className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setScheduleForm({
                                ...scheduleForm,
                                workDays: [...scheduleForm.workDays, day],
                              });
                            } else {
                              setScheduleForm({
                                ...scheduleForm,
                                workDays: scheduleForm.workDays.filter((d) => d !== day),
                              });
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium">{day}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#252d3d]">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {scheduleSaving ? "Saving Schedule…" : "Save Working Hours"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD COMPANY HOLIDAY (HR ONLY) ─────────────────────────── */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-fadeIn">
            
            <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>🎉</span> Add Company Holiday
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Schedule an official company holiday or mandatory day off.</p>
              </div>
              <button
                onClick={() => setShowHolidayModal(false)}
                className="text-slate-400 hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4 text-xs">
              
              {/* Holiday Title */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold uppercase tracking-wider">
                  Holiday Name / Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Independence Day / New Year Holiday"
                  value={holidayForm.title}
                  onChange={(e) => setHolidayForm({ ...holidayForm, title: e.target.value })}
                  required
                  className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Date & Type Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold uppercase tracking-wider">
                    Holiday Date *
                  </label>
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    required
                    className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold uppercase tracking-wider">
                    Holiday Type *
                  </label>
                  <select
                    value={holidayForm.holidayType}
                    onChange={(e) => setHolidayForm({ ...holidayForm, holidayType: e.target.value })}
                    className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                  >
                    {HOLIDAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold uppercase tracking-wider">
                  Description / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Official paid company holiday for all departments..."
                  value={holidayForm.description}
                  onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                  className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#252d3d]">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={holidaySaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  {holidaySaving ? "Adding Holiday…" : "Add Holiday"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
