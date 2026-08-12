"use client";

import React, { useState } from "react";
import Link from "next/link";
import DepartmentSummary from "./DepartmentSummary";
import HRUsersCard from "./HRUsersCard";
import PayrollStatusCard from "./PayrollStatusCard";
import AttendanceOverviewCard from "./AttendanceOverviewCard";
import AttendanceCard from "./AttendanceCard";
import HRAttendanceTracker from "./HRAttendanceTracker";
import MonthlyWorkingHoursWidget from "./MonthlyWorkingHoursWidget";
import DepartmentManagementModal from "./DepartmentManagementModal";

/**
 * OwnerDashboard Component
 * Dedicated full dashboard tailored specifically for the Company Owner (ADMIN role).
 */
export default function OwnerDashboard({
  company,
  employees = [],
  userSession,
  employeeProfile,
  onOpenInviteModal,
  renderRoleBadge,
  renderStatusBadge,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const totalStaff = employees.length + 1; // 1 Owner + employees

  // HR users count
  const hrCount = employees.filter(
    (e) => e.role === "hr_manager" || e.role === "hr_executive"
  ).length;

  // Filter employees by search term
  const filteredEmployees = employees.filter((emp) => {
    const q = searchTerm.toLowerCase();
    return (
      emp.full_name?.toLowerCase().includes(q) ||
      emp.email?.toLowerCase().includes(q) ||
      emp.department?.toLowerCase().includes(q) ||
      emp.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Organization Staff</span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center text-base">👥</div>
          </div>
          <div className="text-3xl font-extrabold text-white">{totalStaff}</div>
          <span className="text-[11px] text-slate-400">1 Company Owner + {employees.length} Members</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">HR Personnel</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center text-base">👔</div>
          </div>
          <div className="text-3xl font-extrabold text-white">{hrCount}</div>
          <span className="text-[11px] text-purple-400 font-medium">Assigned HR Managers & Executives</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Monthly Payroll</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-base">💳</div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">${(totalStaff * 3200).toLocaleString()}</div>
          <span className="text-[11px] text-slate-400">Disbursal Cycle: Aug 28</span>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Owner Control Tier</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center text-base">👑</div>
          </div>
          <div className="text-lg font-bold text-amber-400">Full Workspace Admin</div>
          <span className="text-[11px] text-slate-400">Realtime Operations Sync</span>
        </div>
      </div>

      {/* 2. HR & Owner Employee Attendance Tracking Inbox */}
      <HRAttendanceTracker />

      {/* 3. Core Owner Executive Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        <AttendanceCard />
        <MonthlyWorkingHoursWidget />
        <AttendanceOverviewCard totalStaffCount={totalStaff} />
        <DepartmentSummary
          employees={employees}
          onManageDepartments={() => setIsDeptModalOpen(true)}
        />
        <HRUsersCard employees={employees} onOpenInviteModal={onOpenInviteModal} />
        <PayrollStatusCard totalStaffCount={totalStaff} />
      </div>

      {/* 3. Company Entity Details & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
        {/* Company Record Card */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white">Company Entity & Legal Profile</h3>
              <p className="text-xs text-slate-400">System verified company information</p>
            </div>

            <Link
              href="/company-wizard"
              className="px-3.5 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold hover:bg-sky-500/20 transition flex items-center space-x-1.5"
            >
              <span>✏️</span>
              <span>Edit Company Wizard</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Company Name</span>
              <p className="text-sm font-semibold text-slate-200">{company?.name || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Legal Entity Name</span>
              <p className="text-sm font-semibold text-slate-200">{company?.legal_name || company?.name || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Official Work Email</span>
              <p className="text-sm font-semibold text-slate-200">{company?.email || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Contact Phone</span>
              <p className="text-sm font-semibold text-slate-200">{company?.phone || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Country & Location</span>
              <p className="text-sm font-semibold text-slate-200">
                {company?.country ? `${company.country}, ${company.state || ""}` : "N/A"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">Industry Sector</span>
              <p className="text-sm font-semibold text-slate-200">{company?.industry || "Software & Tech"}</p>
            </div>
          </div>
        </div>

        {/* Owner Quick Controls Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-4">
              Owner Management Actions
            </h3>

            <div className="space-y-3">
              <button
                onClick={onOpenInviteModal}
                className="w-full text-left p-3.5 rounded-2xl bg-sky-950/40 hover:bg-sky-900/40 border border-sky-800/40 transition flex items-center justify-between text-xs font-semibold text-sky-200 group"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-base">➕</span>
                  <span>Invite Employee / HR Manager</span>
                </div>
                <span className="text-sky-400 group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button
                onClick={() => setIsDeptModalOpen(true)}
                className="w-full text-left p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition flex items-center justify-between text-xs font-semibold text-slate-200 group"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-base">🏢</span>
                  <span>Manage Department Structure</span>
                </div>
                <span className="text-sky-400 group-hover:translate-x-1 transition-transform">→</span>
              </button>

              <button className="w-full text-left p-3.5 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition flex items-center justify-between text-xs font-semibold text-slate-200 group">
                <div className="flex items-center space-x-2.5">
                  <span className="text-base">⚙️</span>
                  <span>System Permissions & Roles</span>
                </div>
                <span className="text-sky-400 group-hover:translate-x-1 transition-transform">→</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <span className="font-bold block">👑 Owner Security Note</span>
            <span className="text-[11px] text-slate-400">You hold root administrative access over all workspace records, team member roles, and setup data.</span>
          </div>
        </div>
      </div>

      {/* 4. Full Company Directory Table with Live Search */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center space-x-2.5">
              <span>Company Master Directory</span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700">
                {employees.length} Registered
              </span>
            </h3>
            <p className="text-xs text-slate-400">View and oversee all staff accounts across all departments</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search staff, role or dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:border-sky-500 outline-none transition"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={onOpenInviteModal}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-lg shadow-sky-600/20 flex items-center justify-center space-x-1.5"
            >
              <span>➕</span>
              <span>Invite New Member</span>
            </button>
          </div>
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl">🔍</div>
            <p className="text-sm font-semibold text-slate-200">
              {employees.length === 0 ? "No employees added yet" : "No matching team members found"}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {employees.length === 0
                ? "Invite your first HR manager or team employee to begin building your team."
                : `No employee matches "${searchTerm}". Try a different keyword.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="pb-3 px-2">Employee Name & Email</th>
                  <th className="pb-3 px-2">Role Assigned</th>
                  <th className="pb-3 px-2">Department</th>
                  <th className="pb-3 px-2">Generated Username</th>
                  <th className="pb-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-4 px-2">
                      <div className="font-bold text-white">{emp.full_name}</div>
                      <div className="text-slate-400 text-[11px] font-mono">{emp.email}</div>
                    </td>
                    <td className="py-4 px-2">
                      {renderRoleBadge(emp.role)}
                    </td>
                    <td className="py-4 px-2">
                      <div className="text-slate-200 font-medium">{emp.department || "General"}</div>
                      <div className="text-slate-500 text-[11px]">{emp.designation || "-"}</div>
                    </td>
                    <td className="py-4 px-2 font-mono text-sky-400 font-semibold">
                      {emp.username || (
                        <span className="text-slate-500 font-sans italic text-[11px]">Pending Acceptance</span>
                      )}
                    </td>
                    <td className="py-4 px-2">
                      {renderStatusBadge(emp.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Department CRUD Management Modal */}
      <DepartmentManagementModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
      />
    </div>
  );
}
