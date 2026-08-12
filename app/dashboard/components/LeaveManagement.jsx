"use client";

import { useState, useEffect, useCallback } from "react";

export default function LeaveManagement({ userRole, employeeProfile, company }) {
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState({
    allowance: 3.0,
    used: 0,
    available: 3.0,
    targetMonth: new Date().getMonth() + 1,
    targetYear: new Date().getFullYear(),
  });
  const [isHR, setIsHR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [warningNotice, setWarningNotice] = useState("");

  // Filter & Search states
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const initialIsHR = userRole === "hr_manager" || userRole === "hr_executive";
  const [activeTab, setActiveTab] = useState(initialIsHR ? "hr-inbox" : "my-leaves"); // "my-leaves" | "hr-inbox"

  // Apply Leave Modal State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "Casual",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // HR Action Modal State
  const [selectedLeaveForAction, setSelectedLeaveForAction] = useState(null);
  const [hrFeedback, setHrFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [companyHolidays, setCompanyHolidays] = useState([]);
  const [workDays, setWorkDays] = useState(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

  // Derived state: calculate duration & validation directly during render
  const getCalculatedDaysAndValidation = () => {
    if (!leaveForm.start_date || !leaveForm.end_date) {
      return { days: 0, isValid: false, error: "Please select valid start and end dates." };
    }
    const todayStr = new Date().toISOString().split("T")[0];
    if (leaveForm.start_date < todayStr) {
      return {
        days: 0,
        isValid: false,
        error: "Start date cannot be before today's date. Please choose today or a future date.",
      };
    }

    const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const getDayName = (dStr) => {
      if (!dStr) return "";
      const [y, m, d] = dStr.split("T")[0].split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return DAYS_OF_WEEK[dt.getDay()];
    };

    const startDayName = getDayName(leaveForm.start_date);
    const endDayName = getDayName(leaveForm.end_date);

    // Validate if start date is a non-working day (e.g. Sunday)
    if (workDays && workDays.length > 0 && !workDays.includes(startDayName)) {
      return {
        days: 0,
        isValid: false,
        error: `🎉 Leave application disabled: Start date ${leaveForm.start_date} is a non-working day (${startDayName} / Weekly Off). Leave applications are not required on non-working days!`,
      };
    }

    // Validate if end date is a non-working day (e.g. Sunday)
    if (workDays && workDays.length > 0 && !workDays.includes(endDayName)) {
      return {
        days: 0,
        isValid: false,
        error: `🎉 Leave application disabled: End date ${leaveForm.end_date} is a non-working day (${endDayName} / Weekly Off). Leave applications are not required on non-working days!`,
      };
    }

    // Check if start_date..end_date overlaps with any registered Company Holiday
    if (companyHolidays && companyHolidays.length > 0) {
      const holidayMatch = companyHolidays.find((h) => {
        const hDate = h.date ? h.date.split("T")[0] : "";
        return hDate && leaveForm.start_date <= hDate && leaveForm.end_date >= hDate;
      });

      if (holidayMatch) {
        const formattedDate = holidayMatch.date ? holidayMatch.date.split("T")[0] : "";
        return {
          days: 0,
          isValid: false,
          error: `🎉 Leave application disabled: ${formattedDate} is an official company holiday ("${holidayMatch.title}"). Company holidays are paid non-working days, so leave applications on company holidays are disabled!`,
        };
      }
    }

    const start = new Date(leaveForm.start_date);
    const end = new Date(leaveForm.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { days: 0, isValid: false, error: "Invalid date format." };
    }
    if (end < start) {
      return { days: 0, isValid: false, error: "End date cannot be earlier than start date." };
    }

    // Calculate actual working days excluding non-working days & company holidays
    let workingDays = 0;
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDt = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const holidayDateSet = new Set(
      (companyHolidays || []).map((h) => (h.date ? h.date.split("T")[0] : ""))
    );

    while (cur <= endDt) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      const dStr = `${y}-${m}-${d}`;
      const dName = DAYS_OF_WEEK[cur.getDay()];

      if (!holidayDateSet.has(dStr) && (!workDays || workDays.includes(dName))) {
        workingDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    if (workingDays <= 0) {
      return {
        days: 0,
        isValid: false,
        error: "🎉 Leave application disabled: Selected dates are non-working days / weekly offs. You do not need to apply for leave on non-working days!",
      };
    }

    if (workingDays > balance.available) {
      return {
        days: workingDays,
        isValid: false,
        error: `Insufficient leave balance! You requested ${workingDays} working day(s), but you only have ${balance.available} day(s) available for this month out of your 3-day allowance.`,
      };
    }
    return { days: workingDays, isValid: true, error: "" };
  };

  const { days: calculatedDays, isValid: isFormValid, error: formValidationError } = getCalculatedDaysAndValidation();

  // Helper for manual re-fetching after actions
  const fetchLeaves = useCallback(async (month = selectedMonth, year = selectedYear) => {
    try {
      const res = await fetch(`/api/leaves?month=${month}&year=${year}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to fetch leave records.");
      }
      setLeaves(data.leaves || []);
      if (data.companyHolidays) setCompanyHolidays(data.companyHolidays || []);
      if (data.workDays) setWorkDays(data.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
      if (data.balance) setBalance(data.balance);
      setIsHR(Boolean(data.isHR));
      if (data.warning) setWarningNotice(data.warning);
    } catch (err) {
      console.error("Fetch Leaves Error:", err);
      setErrorMsg(err.message);
    }
  }, [selectedMonth, selectedYear]);

  // Initial and reactive data fetching in effect
  useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      try {
        const res = await fetch(`/api/leaves?month=${selectedMonth}&year=${selectedYear}`);
        const data = await res.json();
        if (!isSubscribed) return;
        if (!res.ok) {
          throw new Error(data.message || "Failed to fetch leave records.");
        }
        setLeaves(data.leaves || []);
        if (data.companyHolidays) setCompanyHolidays(data.companyHolidays || []);
        if (data.workDays) setWorkDays(data.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
        if (data.balance) setBalance(data.balance);
        setIsHR(Boolean(data.isHR));
        if (data.warning) setWarningNotice(data.warning);
      } catch (err) {
        if (isSubscribed) setErrorMsg(err.message);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    loadData();

    const handleLeaveEvent = () => {
      if (isSubscribed) loadData();
    };

    window.addEventListener("leave-request-updated", handleLeaveEvent);

    return () => {
      isSubscribed = false;
      window.removeEventListener("leave-request-updated", handleLeaveEvent);
    };
  }, [selectedMonth, selectedYear]);

  // Handle Create Request
  const handleSubmitLeaveRequest = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaveForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to submit leave request.");
      }

      setSuccessMsg("Leave request submitted successfully for HR approval!");
      setIsApplyModalOpen(false);
      setLeaveForm({
        leave_type: "Casual",
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
        reason: "",
      });
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle HR Approve / Reject
  const handleHrAction = async (status) => {
    if (!selectedLeaveForAction) return;

    setActionLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`/api/leaves/${selectedLeaveForAction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          hr_feedback: hrFeedback,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to process leave request.");
      }

      setSuccessMsg(`Leave request successfully ${status.toLowerCase()}!`);
      setSelectedLeaveForAction(null);
      setHrFeedback("");
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel Request
  const handleCancelLeave = async (leaveId) => {
    if (!confirm("Are you sure you want to cancel this pending leave request?")) return;
    try {
      const res = await fetch(`/api/leaves/${leaveId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel leave request.");
      setSuccessMsg("Leave request cancelled.");
      fetchLeaves(selectedMonth, selectedYear);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Filtered leaves logic
  const filteredLeaves = leaves.filter((l) => {
    // If HR is on "hr-inbox" tab: show all company employee leave requests
    if (activeTab === "hr-inbox") {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const empName = l.employees?.full_name?.toLowerCase() || "";
        const empEmail = l.employees?.email?.toLowerCase() || "";
        const reason = l.reason?.toLowerCase() || "";
        const type = l.leave_type?.toLowerCase() || "";
        return empName.includes(term) || empEmail.includes(term) || reason.includes(term) || type.includes(term);
      }
      return true;
    }

    // If on "my-leaves" tab: show only current user's leaves
    if (activeTab === "my-leaves") {
      if (employeeProfile?.id && l.employee_id !== employeeProfile.id) return false;
    }

    if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const empName = l.employees?.full_name?.toLowerCase() || "";
      const empEmail = l.employees?.email?.toLowerCase() || "";
      const reason = l.reason?.toLowerCase() || "";
      const type = l.leave_type?.toLowerCase() || "";
      return empName.includes(term) || empEmail.includes(term) || reason.includes(term) || type.includes(term);
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            Rejected
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Pending HR Review
          </span>
        );
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner & Messages */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1e2330] p-6 rounded-2xl border border-[#2d3548]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Leave Management</h1>
            {isHR && (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wider">
                HR Portal Access
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Apply for leave, track monthly allowance balance (3 days / month), and manage HR approvals.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month / Year Display (Disabled) */}
          <div className="flex items-center gap-2 bg-[#141721] p-1.5 rounded-xl border border-[#2d3548] opacity-75 cursor-not-allowed">
            <select
              disabled
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent text-xs font-medium text-slate-400 focus:outline-none cursor-not-allowed px-2 py-1"
            >
              {monthNames.map((m, idx) => (
                <option key={m} value={idx + 1} className="bg-[#1e2330] text-slate-200">
                  {m}
                </option>
              ))}
            </select>
            <select
              disabled
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent text-xs font-medium text-slate-400 focus:outline-none cursor-not-allowed px-2 py-1"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y} className="bg-[#1e2330] text-slate-200">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <span>+ Apply For Leave</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {warningNotice && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="font-semibold">Database Setup Required</p>
            <p className="text-xs text-amber-300/80 mt-0.5">{warningNotice}</p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <span>❌ {errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="text-xs text-rose-400 hover:underline">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-xs text-emerald-400 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Leave Balance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monthly Allowance */}
        <div className="bg-[#1e2330] border border-[#2d3548] p-5 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Monthly Allowance</span>
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">📅</span>
          </div>
          <p className="text-3xl font-extrabold text-white">3.0 <span className="text-sm font-medium text-slate-400">Days</span></p>
          <p className="text-xs text-slate-500 mt-2">Standard quota for {monthNames[selectedMonth - 1]}</p>
        </div>

        {/* Card 2: Used Days */}
        <div className="bg-[#1e2330] border border-[#2d3548] p-5 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Days Used</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">⏳</span>
          </div>
          <p className="text-3xl font-extrabold text-amber-400">{balance.used.toFixed(1)} <span className="text-sm font-medium text-slate-400">Days</span></p>
          <p className="text-xs text-slate-500 mt-2">Approved & Pending this month</p>
        </div>

        {/* Card 3: Available Balance */}
        <div className="bg-[#1e2330] border border-[#2d3548] p-5 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Available Balance</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">✨</span>
          </div>
          <p className="text-3xl font-extrabold text-emerald-400">{balance.available.toFixed(1)} <span className="text-sm font-medium text-slate-400">Days</span></p>
          <p className="text-xs text-slate-500 mt-2">Remaining allowance for {monthNames[selectedMonth - 1]}</p>
        </div>

        {/* Card 4: Monthly Refresh Info */}
        <div className="bg-[#1e2330] border border-[#2d3548] p-5 rounded-2xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Quota Refresh Rule</span>
            <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400">🔄</span>
          </div>
          <p className="text-lg font-bold text-slate-200">Auto Refreshes</p>
          <p className="text-xs text-indigo-400 font-medium mt-1">
            Resets to 3 days on 1st of next month
          </p>
        </div>
      </div>

      {/* Main Tabs (If HR, show tab switcher between My Leaves & HR Approval Inbox) */}
      <div className="bg-[#1e2330] border border-[#2d3548] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[#2d3548] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {isHR ? (
              <div className="flex bg-[#141721] p-1 rounded-xl border border-[#2d3548]">
                <button
                  onClick={() => setActiveTab("hr-inbox")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === "hr-inbox"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  🏢 HR Approval Inbox ({leaves.filter((l) => l.status === "PENDING").length})
                </button>
                <button
                  onClick={() => setActiveTab("my-leaves")}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeTab === "my-leaves"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  👤 My Leave Requests
                </button>
              </div>
            ) : (
              <h2 className="text-lg font-bold text-white">My Leave History</h2>
            )}
          </div>

          {/* Status & Search Filter Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search leaves..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-[#141721] text-xs text-slate-200 placeholder-slate-500 pl-8 pr-3 py-2 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-500">🔍</span>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#141721] text-xs font-medium text-slate-300 px-3 py-2 rounded-xl border border-[#2d3548] focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-[#1e2330]">All Statuses</option>
              <option value="PENDING" className="bg-[#1e2330]">Pending HR Review</option>
              <option value="APPROVED" className="bg-[#1e2330]">Approved</option>
              <option value="REJECTED" className="bg-[#1e2330]">Rejected</option>
              <option value="CANCELLED" className="bg-[#1e2330]">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Leaves Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Loading leave records...</p>
            </div>
          ) : filteredLeaves.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-4xl mb-3">🌴</p>
              <p className="text-base font-semibold text-slate-300">No leave requests found</p>
              <p className="text-xs text-slate-500 mt-1">
                {activeTab === "hr-inbox"
                  ? "No employee leave requests submitted for this month."
                  : "You haven't submitted any leave requests for this month."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#141721] text-xs uppercase font-semibold text-slate-400 tracking-wider border-b border-[#2d3548]">
                <tr>
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Date Range</th>
                  <th className="py-3.5 px-4">Days</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">HR Feedback Note</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2d3548] text-slate-300">
                {filteredLeaves.map((l) => (
                  <tr key={l.id} className="hover:bg-[#252c3d]/50 transition-colors">
                    <td className="py-4 px-4 font-medium text-white">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-xs text-white uppercase">
                          {l.employees?.full_name ? l.employees.full_name.charAt(0) : "E"}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-100">{l.employees?.full_name || "Employee"}</p>
                          <p className="text-xs text-slate-400">{l.employees?.email || ""}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className="px-2 py-1 rounded bg-[#141721] border border-[#2d3548] text-xs font-medium text-indigo-300">
                        {l.leave_type}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-xs font-mono">
                      <span className="text-slate-200 font-semibold">{l.start_date}</span>
                      <span className="text-slate-500 mx-1">to</span>
                      <span className="text-slate-200 font-semibold">{l.end_date}</span>
                    </td>

                    <td className="py-4 px-4 font-bold text-indigo-400">
                      {l.total_days} {l.total_days === 1 ? "day" : "days"}
                    </td>

                    <td className="py-4 px-4 max-w-xs truncate text-xs text-slate-400" title={l.reason}>
                      {l.reason}
                    </td>

                    <td className="py-4 px-4">{getStatusBadge(l.status)}</td>

                    <td className="py-4 px-4 max-w-xs">
                      {l.hr_feedback ? (
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                          <p className="font-semibold text-[10px] text-indigo-400 uppercase tracking-wider">Note from HR:</p>
                          <p className="italic mt-0.5">{l.hr_feedback}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">—</span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right">
                      {isHR && l.status === "PENDING" && activeTab === "hr-inbox" ? (
                        <button
                          onClick={() => {
                            setSelectedLeaveForAction(l);
                            setHrFeedback("");
                          }}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow transition-all cursor-pointer"
                        >
                          Review & Action
                        </button>
                      ) : l.status === "PENDING" && (!isHR || activeTab === "my-leaves") ? (
                        <button
                          onClick={() => handleCancelLeave(l.id)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium hover:underline cursor-pointer"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── APPLY LEAVE MODAL ─── */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1e2330] border border-[#2d3548] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-[#2d3548] flex items-center justify-between bg-[#141721]">
              <div>
                <h3 className="text-lg font-bold text-white">Submit Leave Request</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Available Monthly Balance: <span className="font-bold text-emerald-400">{balance.available} Days</span>
                </p>
              </div>
              <button
                onClick={() => setIsApplyModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitLeaveRequest} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                  className="w-full bg-[#141721] text-sm text-slate-200 p-3 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
                >
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Annual">Annual Leave</option>
                  <option value="Emergency">Emergency Leave</option>
                  <option value="Unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    Start Date 📅
                  </label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full bg-[#141721] text-sm text-slate-200 p-3 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                    End Date 📅
                  </label>
                  <input
                    type="date"
                    min={leaveForm.start_date || new Date().toISOString().split("T")[0]}
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full bg-[#141721] text-sm text-slate-200 p-3 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                isFormValid
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}>
                <div>
                  <p className="font-bold text-sm">
                    Total Requested: {calculatedDays} Working {calculatedDays === 1 ? "Day" : "Days"}
                  </p>
                  {!isFormValid && (
                    <p className="mt-1 font-medium text-rose-300">{formValidationError}</p>
                  )}
                  {isFormValid && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Within your available balance of {balance.available} days for this month.
                    </p>
                  )}
                </div>
                <span className="text-2xl">{isFormValid ? "✅" : "⚠️"}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Reason for Leave
                </label>
                <textarea
                  rows={3}
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="Provide brief details regarding your leave request..."
                  className="w-full bg-[#141721] text-sm text-slate-200 p-3 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#141721] border border-[#2d3548] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition-all ${
                    !isFormValid || submitting
                      ? "bg-slate-700 opacity-50 cursor-not-allowed"
                      : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-600/20 cursor-pointer"
                  }`}
                >
                  {submitting ? "Submitting to HR..." : "Submit to HR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── HR ACTION MODAL ─── */}
      {selectedLeaveForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1e2330] border border-[#2d3548] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
            <div className="p-5 border-b border-[#2d3548] bg-[#141721] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">HR Review & Action</h3>
                <p className="text-xs text-indigo-400 font-semibold">Only HR has access to approve or reject leave requests</p>
              </div>
              <button
                onClick={() => setSelectedLeaveForAction(null)}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[#141721] p-4 rounded-xl border border-[#2d3548] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Employee:</span>
                  <span className="font-bold text-white">{selectedLeaveForAction.employees?.full_name || "Employee"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Department:</span>
                  <span className="text-slate-300">{selectedLeaveForAction.employees?.department || "General"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Leave Type:</span>
                  <span className="font-semibold text-indigo-400">{selectedLeaveForAction.leave_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration:</span>
                  <span className="font-mono text-slate-200 font-bold">
                    {selectedLeaveForAction.start_date} to {selectedLeaveForAction.end_date} ({selectedLeaveForAction.total_days} days)
                  </span>
                </div>
                <div className="pt-2 border-t border-[#2d3548]">
                  <span className="text-slate-400 block mb-1">Reason:</span>
                  <p className="text-slate-300 italic">{selectedLeaveForAction.reason}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  HR Feedback Note / Comments <span className="text-indigo-400 font-normal">(Visible to Employee)</span>
                </label>
                <textarea
                  rows={3}
                  value={hrFeedback}
                  onChange={(e) => setHrFeedback(e.target.value)}
                  placeholder="Enter feedback message for the employee (e.g. 'Approved: Have a good vacation!' or 'Rejected: Crucial project release on these dates')."
                  className="w-full bg-[#141721] text-sm text-slate-200 p-3 rounded-xl border border-[#2d3548] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2d3548]">
                <button
                  type="button"
                  onClick={() => setSelectedLeaveForAction(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#141721] border border-[#2d3548] cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleHrAction("REJECTED")}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 transition-all cursor-pointer"
                >
                  ✕ Reject Request
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleHrAction("APPROVED")}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
                >
                  ✓ Approve Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
