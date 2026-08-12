"use client";

import React, { useState } from "react";

/**
 * PayrollStatusCard Component
 * Displays Executive Payroll Status, upcoming disbursal date, estimated total payroll cost,
 * and approval control for the Owner.
 */
export default function PayrollStatusCard({ totalStaffCount = 1 }) {
  const [payrollStatus, setPayrollStatus] = useState("Ready for Review");
  const [isApproved, setIsApproved] = useState(false);

  // Dynamic estimate based on headcount
  const estimatedPayroll = (totalStaffCount * 3200).toLocaleString();

  const handleApprovePayroll = () => {
    if (!isApproved) {
      setIsApproved(true);
      setPayrollStatus("Approved & Processing");
    } else {
      setIsApproved(false);
      setPayrollStatus("Ready for Review");
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-5 hover:border-slate-700/80 transition duration-300 shadow-xl flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
              💳
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Payroll Status</h3>
              <p className="text-xs text-slate-400">Monthly company payout cycle</p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              isApproved
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border-amber-500/30"
            }`}
          >
            {payrollStatus}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Est. Monthly Cost</span>
            <div className="text-lg font-extrabold text-white font-mono">${estimatedPayroll}</div>
            <span className="text-[10px] text-slate-500">{totalStaffCount} Paid Roles</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Next Disbursal</span>
            <div className="text-lg font-bold text-sky-400">Aug 28, 2026</div>
            <span className="text-[10px] text-emerald-400 font-medium">Direct Deposit Active</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/60 text-xs space-y-2">
          <div className="flex justify-between items-center text-slate-300">
            <span>Tax Compliance & Deductions</span>
            <span className="text-emerald-400 font-semibold">100% Calculated</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-full w-full"></div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={handleApprovePayroll}
          className={`w-full py-2.5 rounded-xl text-xs font-bold transition shadow-lg flex items-center justify-center space-x-2 border ${
            isApproved
              ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
              : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-600/20"
          }`}
        >
          <span>{isApproved ? "🔄 Revert to Review" : "⚡ Authorize & Approve Payroll"}</span>
        </button>
      </div>
    </div>
  );
}
