import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporter } from "@/lib/mail/transporter";
import { buildLeaveRequestNoticeHTML } from "@/lib/mail/leaveEmail";

const MONTHLY_ALLOWANCE = 3.0;

/**
 * Helper to determine if a role has HR privileges.
 */
function isHRRole(role) {
  return role === "hr_manager" || role === "hr_executive";
}

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getDayNameFromStr(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return DAYS_OF_WEEK[dt.getDay()];
}

function calculateWorkingDays(startDateStr, endDateStr, workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], companyHolidays = []) {
  const [sy, sm, sd] = startDateStr.split("T")[0].split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("T")[0].split("-").map(Number);
  const current = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (isNaN(current.getTime()) || isNaN(end.getTime()) || end < current) {
    return { workingDays: 0, nonWorkingDays: 0, holidayCount: 0 };
  }

  const holidayDateSet = new Set(
    (companyHolidays || []).map((h) => (h.date ? h.date.split("T")[0] : ""))
  );

  let workingDays = 0;
  let nonWorkingDays = 0;
  let holidayCount = 0;

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    const dStr = `${y}-${m}-${d}`;
    const dayName = DAYS_OF_WEEK[current.getDay()];

    if (holidayDateSet.has(dStr)) {
      holidayCount++;
    } else if (!workDays.includes(dayName)) {
      nonWorkingDays++;
    } else {
      workingDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return { workingDays, nonWorkingDays, holidayCount };
}

/**
 * Calculate business/calendar days between two YYYY-MM-DD date strings inclusive.
 */
function calculateLeaveDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24)) + 1;
  return diffDays;
}

/**
 * GET /api/leaves?month=8&year=2026
 * 
 * Fetches leave requests and monthly leave balance breakdown.
 * - HR/Admins see all company leave requests.
 * - Regular employees see their own leave requests.
 */
export async function GET(req) {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 1. Resolve employee record and company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;
    let companyId = null;
    let userRole = "employee";

    if (empRecord) {
      companyId = empRecord.company_id;
      userRole = empRecord.role || "employee";
    } else {
      // Check if user is Company Owner / Admin
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        companyId = adminCompanies[0].id;
        userRole = "ADMIN";

        // Auto-create or fetch employee record for Admin so leave management applies to all accounts
        const { data: adminEmp } = await adminSupabase
          .from("employees")
          .upsert(
            {
              company_id: companyId,
              full_name: adminCompanies[0].name || "Company Administrator",
              email: userEmail,
              role: "ADMIN",
              status: "active",
              auth_user_id: user.id,
            },
            { onConflict: "company_id,email" }
          )
          .select()
          .maybeSingle();

        empRecord = adminEmp || empRecord;
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { message: "No registered company found for this user." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const targetMonth = parseInt(searchParams.get("month") || (now.getMonth() + 1).toString(), 10);
    const targetYear = parseInt(searchParams.get("year") || now.getFullYear().toString(), 10);

    const isHR = isHRRole(userRole);

    // Format start and end date for filtering the month
    const startOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
    const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
    const endOfMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;

    // 2. Fetch Leave Requests
    let query = adminSupabase
      .from("leave_requests")
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!isHR) {
      if (!empRecord) {
        return NextResponse.json({ leaves: [], balance: { allowance: 3, used: 0, available: 3 } });
      }
      query = query.eq("employee_id", empRecord.id);
    }

    const { data: leaves, error: leavesErr } = await query;

    if (leavesErr) {
      // If table doesn't exist or schema cache is missing total_days column
      if (
        leavesErr.code === "42P01" ||
        leavesErr.code === "PGRST204" ||
        leavesErr.message?.includes("total_days") ||
        leavesErr.message?.includes("schema cache")
      ) {
        return NextResponse.json({
          success: true,
          leaves: [],
          balance: { allowance: MONTHLY_ALLOWANCE, used: 0, available: MONTHLY_ALLOWANCE },
          isHR,
          role: userRole,
          warning: "Supabase schema cache update required: Please run migration 20260807_create_leave_requests_table.sql in Supabase SQL Editor.",
        });
      }
      throw leavesErr;
    }

    // 3. Calculate Monthly Balance for current employee
    let usedDaysThisMonth = 0;
    if (empRecord) {
      const userLeaves = leaves ? leaves.filter(l => l.employee_id === empRecord.id) : [];
      
      userLeaves.forEach(l => {
        // Only count APPROVED or PENDING leaves for the target month
        if (l.status === "APPROVED" || l.status === "PENDING") {
          const leaveStart = new Date(l.start_date);
          if (
            leaveStart.getFullYear() === targetYear &&
            leaveStart.getMonth() + 1 === targetMonth
          ) {
            usedDaysThisMonth += Number(l.total_days || 0);
          }
        }
      });
    }

    const availableDaysThisMonth = Math.max(0, MONTHLY_ALLOWANCE - usedDaysThisMonth);

    // Fetch company holidays for company workspace
    const { data: companyHolidaysData } = await adminSupabase
      .from("company_holidays")
      .select("*")
      .eq("company_id", companyId);

    // Fetch company working days schedule
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData && Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
      workDays = schedData.work_days;
    }

    return NextResponse.json({
      success: true,
      leaves: leaves || [],
      companyHolidays: companyHolidaysData || [],
      workDays,
      isHR,
      role: userRole,
      employeeId: empRecord ? empRecord.id : null,
      balance: {
        allowance: MONTHLY_ALLOWANCE,
        used: usedDaysThisMonth,
        available: availableDaysThisMonth,
        targetMonth,
        targetYear,
      },
    });
  } catch (error) {
    console.error("GET /api/leaves Error:", error);
    return NextResponse.json(
      { message: error.message || "Internal server error." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leaves
 * 
 * Submits a new leave request with strict date & available balance validation.
 */
export async function POST(req) {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error: authErr } = await supabaseServer.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { leave_type = "Casual", start_date, end_date, reason } = body;

    // 1. Inputs validation
    if (!start_date || !end_date) {
      return NextResponse.json({ message: "Start date and end date are required." }, { status: 400 });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (start_date < todayStr) {
      return NextResponse.json(
        { message: "Start date cannot be before today's date. Please select today or a future date." },
        { status: 400 }
      );
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json({ message: "Please provide a reason for the leave request." }, { status: 400 });
    }

    const rawDays = calculateLeaveDays(start_date, end_date);
    if (rawDays <= 0) {
      return NextResponse.json({ message: "End date cannot be earlier than start date." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const userEmail = user.email ? user.email.toLowerCase() : "";

    // 2. Resolve employee and company
    const { data: empRecords } = await adminSupabase
      .from("employees")
      .select("*, companies:company_id(*)")
      .or(`auth_user_id.eq.${user.id},email.eq.${userEmail}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let empRecord = empRecords && empRecords.length > 0 ? empRecords[0] : null;

    if (!empRecord) {
      const { data: adminCompanies } = await adminSupabase
        .from("companies")
        .select("*")
        .or(`admin_id.eq.${user.id},email.eq.${userEmail}`);

      if (adminCompanies && adminCompanies.length > 0) {
        const { data: adminEmp } = await adminSupabase
          .from("employees")
          .upsert(
            {
              company_id: adminCompanies[0].id,
              full_name: adminCompanies[0].name || "Company Administrator",
              email: userEmail,
              role: "ADMIN",
              status: "active",
              auth_user_id: user.id,
            },
            { onConflict: "company_id,email" }
          )
          .select()
          .maybeSingle();

        empRecord = adminEmp;
      }
    }

    if (!empRecord) {
      return NextResponse.json(
        { message: "Employee profile not found. Please contact HR to complete your profile." },
        { status: 404 }
      );
    }

    const companyId = empRecord.company_id;
    const leaveStartDate = new Date(start_date);
    const targetMonth = leaveStartDate.getMonth() + 1;
    const targetYear = leaveStartDate.getFullYear();

    // Fetch company working schedule
    let workDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const { data: schedData } = await adminSupabase
      .from("company_work_schedules")
      .select("work_days")
      .eq("company_id", companyId)
      .maybeSingle();

    if (schedData && Array.isArray(schedData.work_days) && schedData.work_days.length > 0) {
      workDays = schedData.work_days;
    }

    // Validate if start_date or end_date falls on a non-working day (e.g. Sunday)
    const startDayName = getDayNameFromStr(start_date);
    const endDayName = getDayNameFromStr(end_date);

    if (!workDays.includes(startDayName)) {
      return NextResponse.json(
        {
          message: `Leave application disabled: Start date ${start_date} is a non-working day (${startDayName} / Weekly Off). Leave applications cannot start on a non-working day!`,
          isNonWorkingDay: true,
          dayName: startDayName,
        },
        { status: 400 }
      );
    }

    if (!workDays.includes(endDayName)) {
      return NextResponse.json(
        {
          message: `Leave application disabled: End date ${end_date} is a non-working day (${endDayName} / Weekly Off). Leave applications cannot end on a non-working day!`,
          isNonWorkingDay: true,
          dayName: endDayName,
        },
        { status: 400 }
      );
    }

    // Check if any date in requested range is an official Company Holiday
    let holidayMatches = null;
    try {
      const { data: hMatches } = await adminSupabase
        .from("company_holidays")
        .select("*")
        .eq("company_id", companyId)
        .gte("date", start_date)
        .lte("date", end_date);
      holidayMatches = hMatches;
    } catch (hErr) {
      console.warn("Company holiday check notice:", hErr?.message);
    }

    if (holidayMatches && holidayMatches.length > 0) {
      const match = holidayMatches[0];
      const formattedMatchDate = match.date ? match.date.split("T")[0] : match.date;
      return NextResponse.json(
        {
          message: `Leave application disabled: ${formattedMatchDate} is an official company holiday ("${match.title}"). Company holidays are paid non-working days, so leave applications on company holidays are disabled!`,
          isCompanyHoliday: true,
          holidayTitle: match.title,
          holidayDate: formattedMatchDate,
        },
        { status: 400 }
      );
    }

    // Calculate actual working days excluding non-working days & company holidays
    const { workingDays } = calculateWorkingDays(
      start_date,
      end_date,
      workDays,
      holidayMatches || []
    );

    if (workingDays <= 0) {
      return NextResponse.json(
        {
          message: `Leave application disabled: The selected date range contains no working days. Leave applications are not required on non-working days / weekly offs!`,
          isNonWorkingDay: true,
        },
        { status: 400 }
      );
    }

    const totalDays = workingDays;

    // 3. Validate available leave balance for the target month
    const { data: existingLeaves } = await adminSupabase
      .from("leave_requests")
      .select("*")
      .eq("employee_id", empRecord.id)
      .in("status", ["APPROVED", "PENDING"]);

    let usedDaysForMonth = 0;
    if (existingLeaves) {
      existingLeaves.forEach(l => {
        const lDate = new Date(l.start_date);
        if (lDate.getFullYear() === targetYear && lDate.getMonth() + 1 === targetMonth) {
          usedDaysForMonth += Number(l.total_days || 0);
        }
      });
    }

    const availableBalance = Math.max(0, MONTHLY_ALLOWANCE - usedDaysForMonth);

    if (totalDays > availableBalance) {
      return NextResponse.json(
        {
          message: `Insufficient leave balance for ${leaveStartDate.toLocaleString("default", { month: "long" })} ${targetYear}. You requested ${totalDays} working day(s), but only ${availableBalance} day(s) remain out of your 3-day monthly allowance.`,
          totalDays,
          availableBalance,
          usedDaysForMonth,
        },
        { status: 400 }
      );
    }

    // 4. Create the Leave Request
    const { data: newLeave, error: insertErr } = await adminSupabase
      .from("leave_requests")
      .insert({
        company_id: companyId,
        employee_id: empRecord.id,
        employee_name: empRecord.full_name || "Employee",
        employee_email: empRecord.email || userEmail,
        leave_type,
        leave_date: start_date,
        start_date,
        end_date,
        total_days: totalDays,
        reason: reason.trim(),
        status: "PENDING",
      })
      .select(`
        *,
        employees:employee_id (
          id,
          full_name,
          email,
          department,
          designation,
          role
        )
      `)
      .single();

    if (insertErr) {
      if (
        insertErr.code === "PGRST204" ||
        insertErr.message?.includes("total_days") ||
        insertErr.message?.includes("schema cache")
      ) {
        return NextResponse.json(
          {
            message: "Supabase PostgREST schema cache needs reload. Please open Supabase Dashboard -> SQL Editor, run the updated script in 20260807_create_leave_requests_table.sql (which contains 'NOTIFY pgrst, ''reload schema'';'), and click Run.",
            detail: insertErr.message,
          },
          { status: 400 }
        );
      }
      throw insertErr;
    }

    // 6. Send notification email to HR Personnel
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        // Fetch HR staff emails in the company
        const { data: hrMembers } = await adminSupabase
          .from("employees")
          .select("email")
          .eq("company_id", companyId)
          .in("role", ["hr_manager", "hr_executive"]);

        const hrEmails = hrMembers && hrMembers.length > 0
          ? hrMembers.map((h) => h.email).filter(Boolean)
          : [];

        if (hrEmails.length > 0) {
          const companyName = empRecord.companies?.name || "Company";
          const html = buildLeaveRequestNoticeHTML({
            companyName,
            employeeName: empRecord.full_name || "Employee",
            employeeEmail: empRecord.email || userEmail,
            department: empRecord.department || "General",
            leaveType: leave_type,
            leaveDate: `${start_date} to ${end_date} (${totalDays} days)`,
            reason,
          });

          await transporter.sendMail({
            from: `"${companyName} HRMS" <${process.env.EMAIL_USER}>`,
            to: hrEmails.join(", "),
            subject: `✈️ New Leave Request: ${empRecord.full_name} (${start_date} to ${end_date})`,
            html,
          });
        }
      }
    } catch (mailErr) {
      console.warn("HR Notification Email Warning:", mailErr.message);
    }

    return NextResponse.json({
      success: true,
      message: "Leave request submitted successfully for HR approval.",
      leave: newLeave,
      remainingBalance: Math.max(0, availableBalance - totalDays),
    });
  } catch (error) {
    console.error("POST /api/leaves Error:", error);
    return NextResponse.json(
      { message: error.message || "Failed to submit leave request." },
      { status: 500 }
    );
  }
}
