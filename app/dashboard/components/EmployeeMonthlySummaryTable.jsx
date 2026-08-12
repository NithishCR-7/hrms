"use client";

import React, { useState, useEffect } from "react";

export default function EmployeeMonthlySummaryTable() {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7) // 'YYYY-MM'
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [summaryData, setSummaryData] = useState({
    staffSummaryTable: [],
    expectedWorkDaysInMonth: 22,
    expectedMonthlyHours: 176,
    dailyTargetHours: 8.0,
  });
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState("");

  // Modal for individual employee daily shift breakdown
  const [activeModalEmp, setActiveModalEmp] = useState(null);
  const [empDailyBreakdown, setEmpDailyBreakdown] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchMonthlySummary = async (monthStr, isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      setErrorNotice("");
      const res = await fetch(`/api/attendance/monthly-summary?month=${monthStr}`);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setErrorNotice(errJson.message || "Failed to load monthly summary data.");
      } else {
        const data = await res.json();
        setSummaryData({
          staffSummaryTable: data.staffSummaryTable || [],
          expectedWorkDaysInMonth: data.expectedWorkDaysInMonth || 22,
          expectedMonthlyHours: data.expectedMonthlyHours || 176,
          dailyTargetHours: data.dailyTargetHours || 8.0,
          departmentBenchmarks: data.departmentBenchmarks || [],
        });
      }
    } catch (err) {
      console.error("Error fetching monthly summary:", err);
      setErrorNotice("Network error loading employee monthly summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlySummary(selectedMonth, true);

    // Real-time 2-second polling ticker & postgres update event listener
    const interval = setInterval(() => {
      fetchMonthlySummary(selectedMonth, true);
    }, 2000);

    const handleUpdate = () => fetchMonthlySummary(selectedMonth, true);
    if (typeof window !== "undefined") {
      window.addEventListener("attendance-updated", handleUpdate);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("attendance-updated", handleUpdate);
      }
    };
  }, [selectedMonth]);

  // Open individual employee detail daily record breakdown
  const handleOpenBreakdownModal = async (emp) => {
    setActiveModalEmp(emp);
    setModalLoading(true);
    setEmpDailyBreakdown([]);
    try {
      const res = await fetch(
        `/api/attendance/monthly-summary?month=${selectedMonth}&employeeId=${emp.employeeId}`
      );
      if (res.ok) {
        const data = await res.json();
        setEmpDailyBreakdown(data.dailyBreakdown || []);
      }
    } catch (err) {
      console.error("Error loading employee daily breakdown:", err);
    } finally {
      setModalLoading(false);
    }
  };

  // Export Table to Clean, Professional Excel/CSV
  const exportToCSV = () => {
    if (!summaryData.staffSummaryTable || summaryData.staffSummaryTable.length === 0) return;

    const headers = [
      "Employee ID",
      "Full Name",
      "Email",
      "Department",
      "Designation",
      "Health Score (0-100)",
      "Attendance Status",
      "Total Effective Working Days",
      "Shift Days Worked",
      "Approved Leave Days",
      "HR Company Holidays",
      "Expected Work Days",
      "Required Monthly Hours (hrs)",
      "Real-Time Worked Hours (hrs)",
      "Approved Leave Credit Hours (hrs)",
      "Loss of Pay (LOP) Shortage Hours (hrs)",
      "Overtime (+OT) Hours (hrs)",
      "Completion Rate (%)",
      "Burnout Risk Level",
      "HR Remarks & Evaluation Notes",
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredStaff.map((emp) => [
      escapeCsv(emp.employeeId || ""),
      escapeCsv(emp.fullName || ""),
      escapeCsv(emp.email || ""),
      escapeCsv(emp.department || "General"),
      escapeCsv(emp.designation || ""),
      emp.healthScore ?? 90,
      escapeCsv((emp.evaluationBadge || "Satisfactory").replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim()),
      emp.totalWorkingDays || 0,
      emp.attendanceWorkedDays || emp.totalWorkingDays || 0,
      emp.approvedLeaveDays || 0,
      emp.companyHolidaysCount || 0,
      summaryData.expectedWorkDaysInMonth || 0,
      Number(emp.requiredHours ?? emp.expectedMonthlyHours ?? summaryData.expectedMonthlyHours ?? 0).toFixed(1),
      Number(emp.workedHours ?? emp.actualWorkingHours ?? 0).toFixed(1),
      Number(emp.approvedLeaveHours || 0).toFixed(1),
      Number(emp.totalLopShortageHours || 0).toFixed(1),
      Number(emp.overtimeHours || 0).toFixed(1),
      `${emp.completionRate || 0}%`,
      escapeCsv(emp.burnoutRiskLevel || "LOW"),
      escapeCsv(emp.hrRemarks || emp.suggestionText || ""),
    ]);

    // Use BOM \uFEFF for UTF-8 compatibility in Excel
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Employee_Monthly_Summary_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Derive unique departments
  const uniqueDepartments = Array.from(
    new Set(summaryData.staffSummaryTable.map((s) => s.department || "General"))
  ).filter(Boolean);

  // Filtered staff list
  const filteredStaff = summaryData.staffSummaryTable.filter((emp) => {
    const matchesSearch =
      !searchQuery ||
      emp.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept =
      departmentFilter === "ALL" || (emp.department || "General") === departmentFilter;

    return matchesSearch && matchesDept;
  });

  // Aggregated Metrics
  const totalEmployeesCount = summaryData.staffSummaryTable.length;
  const totalWorkedHoursSum = summaryData.staffSummaryTable.reduce(
    (acc, curr) => acc + (curr.workedHours || curr.totalWorkingHours || 0),
    0
  );
  const totalOvertimeHoursSum = summaryData.staffSummaryTable.reduce(
    (acc, curr) => acc + (curr.overtimeHours || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* ── HEADER CONTROLS & METRICS ───────────────────────────────────────── */}
      <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#252d3d] pb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Real-Time HR Summary & Evaluation
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-white flex items-center gap-2">
              Employee Monthly Summary
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Working days, required hours, worked hours, shortfalls, Loss of Pay (LOP), and HR holidays processed in real-time.
            </p>
          </div>

          {/* Month Selector & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0f1117] border border-[#252d3d] rounded-xl px-3 py-2">
              <span className="text-slate-400 text-xs">📅</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => fetchMonthlySummary(selectedMonth, false)}
              className="p-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              title="Refresh / Recalculate"
            >
              <span>🔄</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={exportToCSV}
              disabled={filteredStaff.length === 0}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <span>📥</span>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#0f1117] border border-[#252d3d] rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl text-indigo-400">
              👥
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Total Evaluated
              </div>
              <div className="text-xl font-extrabold text-white mt-0.5">
                {totalEmployeesCount} Employees
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                Target: {summaryData.expectedWorkDaysInMonth}d / {summaryData.expectedMonthlyHours}h
              </div>
            </div>
          </div>

          <div className="bg-[#0f1117] border border-[#252d3d] rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400">
              ⏱️
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Total Worked Hours
              </div>
              <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                {totalWorkedHoursSum.toFixed(1)} hrs
              </div>
              <div className="text-[10px] text-slate-500">
                Shift hours + leave credit
              </div>
            </div>
          </div>

          <div className="bg-[#0f1117] border border-[#252d3d] rounded-xl p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xl text-sky-400">
              ⚡
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Total Overtime (+OT)
              </div>
              <div className="text-xl font-extrabold text-sky-400 font-mono mt-0.5">
                +{totalOvertimeHoursSum.toFixed(1)} hrs
              </div>
              <div className="text-[10px] text-slate-500">
                Extra shift hours logged
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by employee name, email, department or designation..."
              className="w-full bg-[#0f1117] border border-[#252d3d] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 shrink-0">Dept:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full sm:w-48 bg-[#0f1117] border border-[#252d3d] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Departments</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorNotice && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {errorNotice}</span>
          <button onClick={() => setErrorNotice("")} className="hover:text-white">✕</button>
        </div>
      )}

      {/* ── DEPARTMENT CAPACITY & HEALTH BENCHMARKS WIDGET ──────────────── */}
      {summaryData.departmentBenchmarks && summaryData.departmentBenchmarks.length > 0 && (
        <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-[#252d3d] pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span>🏢</span> Department Capacity & Health Benchmarks
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              {summaryData.departmentBenchmarks.length} Active Departments
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {summaryData.departmentBenchmarks.map((dept) => {
              const scoreColor =
                dept.averageHealthScore >= 90
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : dept.averageHealthScore >= 75
                  ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  : "text-rose-400 border-rose-500/30 bg-rose-500/10";

              return (
                <div
                  key={dept.department}
                  className="bg-[#0f1117] border border-[#252d3d] rounded-xl p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white truncate">{dept.department}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border font-mono ${scoreColor}`}>
                      {dept.averageHealthScore}/100
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1 border-t border-[#252d3d]/60 font-mono">
                    Worked: <span className="text-emerald-400 font-bold">{dept.totalWorkedHours}h</span> | OT: <span className="text-sky-400 font-bold">+{dept.totalOvertimeHours}h</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── EMPLOYEE MONTHLY SUMMARY TABLE ───────────────────────────────── */}
      <div className="bg-[#1a1e2a] border border-[#252d3d] rounded-2xl overflow-hidden shadow-2xl">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">
              Evaluating real-time working hours, shortfalls & HR remarks...
            </p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <div className="text-3xl">📂</div>
            <p className="text-sm font-semibold text-slate-300">No Employee Records Found</p>
            <p className="text-xs text-slate-500">
              No matching employee monthly summary records for {selectedMonth}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0f1117] border-b border-[#252d3d] text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-4 px-4">Employee</th>
                  <th className="py-4 px-4">Department</th>
                  <th className="py-4 px-4 text-center">Health Score</th>
                  <th className="py-4 px-4 text-center">Working Days</th>
                  <th className="py-4 px-4 text-right">Required Hours</th>
                  <th className="py-4 px-4 text-right">Worked Hours</th>
                  <th className="py-4 px-4 text-right">Overtime (+OT)</th>
                  <th className="py-4 px-4">HR Remarks</th>
                  <th className="py-4 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252d3d]/50">
                {filteredStaff.map((emp) => {
                  const initial = emp.fullName ? emp.fullName.charAt(0).toUpperCase() : "?";
                  const score = emp.healthScore ?? 90;
                  const scoreBadgeClass =
                    score >= 90
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : score >= 75
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/30";

                  return (
                    <tr
                      key={emp.employeeId}
                      className="hover:bg-[#1e2334] transition duration-150 group"
                    >
                      {/* Employee Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center font-bold text-white shadow-md text-sm shrink-0">
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs group-hover:text-indigo-300 transition">
                              {emp.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {emp.email}
                            </div>
                            {emp.designation && (
                              <div className="text-[10px] text-slate-500">
                                {emp.designation}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Department & Role */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {emp.department || "General"}
                        </span>
                        <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                          {emp.role || "Employee"}
                        </div>
                      </td>

                      {/* Health Score (0 - 100 Index) */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black border font-mono shadow-sm ${scoreBadgeClass}`}>
                          <span>{score >= 90 ? "🟢" : score >= 75 ? "🟡" : "🔴"}</span>
                          <span>{score}/100</span>
                        </span>
                      </td>

                      {/* Working Days Breakdown */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono font-bold text-slate-200 text-xs">
                          {emp.totalWorkingDays || emp.attendanceWorkedDays || 0}d
                          <span className="text-slate-500 font-mono text-[10px]">
                            {" "}/ {summaryData.expectedWorkDaysInMonth}d
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {emp.attendanceWorkedDays ?? emp.totalWorkingDays ?? 0}d worked
                          {emp.approvedLeaveDays > 0 ? `, +${emp.approvedLeaveDays}d leave` : ""}
                          {emp.companyHolidaysCount > 0 ? `, +${emp.companyHolidaysCount}d HR holiday` : ""}
                        </div>
                      </td>

                      {/* Required Hours */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-300">
                        {(emp.requiredHours ?? emp.expectedMonthlyHours ?? summaryData.expectedMonthlyHours ?? 0).toFixed(1)} hrs
                      </td>

                      {/* Worked Hours */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-emerald-400 text-xs">
                          {(emp.workedHours ?? emp.totalWorkingHours ?? 0).toFixed(1)} hrs
                        </div>
                        {emp.approvedLeaveHours > 0 && (
                          <div className="text-[10px] text-indigo-400 font-semibold mt-0.5" title="Approved Paid Leave Credit">
                            ✈️ +{emp.approvedLeaveHours.toFixed(1)}h Leave Credit
                          </div>
                        )}
                      </td>

                      {/* Overtime (+OT) & Burnout Risk */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        {emp.overtimeHours > 0 ? (
                          <div className="space-y-1">
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              +{emp.overtimeHours.toFixed(1)} hrs
                            </span>
                            {emp.burnoutRiskLevel === "HIGH" && (
                              <div className="text-[9px] text-amber-400 font-extrabold flex items-center justify-end gap-0.5">
                                <span>🔥</span>
                                <span>Burnout Risk</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">0.0 hrs</span>
                        )}
                      </td>

                      {/* HR Remarks */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              emp.evaluationLevel === "EXCELLENT"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
                                : emp.evaluationLevel === "GOOD"
                                ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                                : emp.evaluationLevel === "CRITICAL"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                : emp.evaluationLevel === "WARNING"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                : "bg-slate-700/50 text-slate-300 border-slate-600"
                            }`}
                          >
                            {emp.evaluationBadge}
                          </span>
                          <p className="text-[11px] text-slate-300 leading-snug line-clamp-2">
                            {emp.hrRemarks || emp.suggestionText}
                          </p>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenBreakdownModal(emp)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <span>🔍</span>
                          <span>Check Daily Records</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── INDIVIDUAL EMPLOYEE DAILY RECORD DRILL-DOWN MODAL ───────────────── */}
      {activeModalEmp && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-[#1a1e2a] border border-[#252d3d] rounded-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#252d3d] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-extrabold text-white text-lg">
                  {activeModalEmp.fullName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {activeModalEmp.fullName} — Daily Shift Records ({selectedMonth})
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeModalEmp.department} • {activeModalEmp.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalEmp(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Daily Records Summary Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 bg-[#0f1117] p-3.5 rounded-xl border border-[#252d3d] text-xs">
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Working Days</div>
                <div className="font-bold text-white text-sm font-mono">
                  {activeModalEmp.totalWorkingDays || activeModalEmp.attendanceWorkedDays || 0}d / {summaryData.expectedWorkDaysInMonth}d
                </div>
                <div className="text-[9px] text-slate-400">
                  {activeModalEmp.attendanceWorkedDays ?? activeModalEmp.totalWorkingDays ?? 0} worked
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Required Target</div>
                <div className="font-bold text-white text-sm font-mono">
                  {activeModalEmp.requiredHours || summaryData.expectedMonthlyHours} hrs
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Total Worked</div>
                <div className="font-bold text-emerald-400 text-sm font-mono">
                  {activeModalEmp.workedHours || activeModalEmp.totalWorkingHours} hrs
                </div>
              </div>
              <div>
                <div className="text-amber-400 text-[10px] uppercase font-bold">Shortfall Deficit</div>
                <div className={`font-bold text-sm font-mono ${(activeModalEmp.shortfallHours || 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {(activeModalEmp.shortfallHours || 0) > 0 ? `-${activeModalEmp.shortfallHours.toFixed(1)} hrs` : "0.0 hrs"}
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Overtime (+OT)</div>
                <div className="font-bold text-emerald-300 text-sm font-mono">
                  +{activeModalEmp.overtimeHours || 0} hrs
                </div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Leave Credit</div>
                <div className="font-bold text-indigo-400 text-sm font-mono">
                  +{activeModalEmp.approvedLeaveHours || 0} hrs ({activeModalEmp.approvedLeaveDays || 0}d)
                </div>
              </div>
            </div>

            {/* Daily Records Table */}
            <div className="flex-1 overflow-y-auto pr-1">
              {modalLoading ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Fetching real-time shift records for {activeModalEmp.fullName}...</p>
                </div>
              ) : empDailyBreakdown.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No individual daily attendance logs found for this month.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0f1117] text-slate-400 text-[10px] uppercase font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Check In — Check Out</th>
                        <th className="py-2.5 px-3 text-right">Required</th>
                        <th className="py-2.5 px-3 text-right">Worked</th>
                        <th className="py-2.5 px-3 text-right">Shortfall</th>
                        <th className="py-2.5 px-3 text-right">Overtime</th>
                        <th className="py-2.5 px-3">HR Remarks / Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#252d3d]">
                      {empDailyBreakdown.map((log) => {
                        const inTime = log.checkIn ? new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—";
                        const outTime = log.checkOut ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : log.status === "CHECKED_IN" ? "On Duty" : "—";

                        return (
                          <tr key={log.id} className="hover:bg-[#1e2334] transition duration-150">
                            <td className="py-2.5 px-3 font-mono text-slate-300 font-bold">
                              {log.workDate || "—"}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {inTime} — {outTime}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 text-right">
                              8.0 hrs
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 text-right">
                              {log.workedHours ? log.workedHours.toFixed(2) : "0.00"} hrs
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {log.shortfallHours > 0 || log.timeGapHours > 0 ? (
                                <span className="text-amber-400 font-bold">
                                  -{(log.shortfallHours || log.timeGapHours || 0).toFixed(1)}h
                                </span>
                              ) : (
                                <span className="text-slate-500">0.0h</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {log.overtimeHours > 0 ? (
                                <span className="text-emerald-400 font-bold">
                                  +{log.overtimeHours.toFixed(1)}h
                                </span>
                              ) : (
                                <span className="text-slate-500">0.0h</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 max-w-xs">
                              <div className="text-[11px] text-slate-300 font-medium leading-snug">
                                {log.hrRemarks || log.status}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#252d3d] pt-3 flex justify-end">
              <button
                onClick={() => setActiveModalEmp(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
