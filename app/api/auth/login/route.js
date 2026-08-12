import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();
    const rawInput = (body.email || body.username || "").trim();
    const { password } = body;

    // 1. Validate Input
    if (!rawInput || !password) {
      return NextResponse.json({ message: "Email/Username and password are required." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    let targetEmail = rawInput.toLowerCase();

    // Look up if input matches an employee's username or email
    const { data: matchedEmps } = await adminSupabase
      .from("employees")
      .select("id, email, username, auth_user_id, role, company_id")
      .or(`username.eq.${rawInput},email.eq.${rawInput.toLowerCase()}`)
      .order("created_at", { ascending: false })
      .limit(1);

    const matchedEmp = matchedEmps && matchedEmps.length > 0 ? matchedEmps[0] : null;

    if (matchedEmp?.email) {
      targetEmail = matchedEmp.email.toLowerCase();
    }

    const supabase = await createClient();

    // 2. Authenticate User with resolved targetEmail
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password,
    });

    if (authError) {
      return NextResponse.json({ message: authError.message || "Invalid credentials." }, { status: 401 });
    }

    const user = authData.user;
    const userMeta = user.user_metadata || {};

    // Sync auth_user_id on employee record if needed
    if (matchedEmp && (!matchedEmp.auth_user_id || matchedEmp.auth_user_id !== user.id)) {
      try {
        await adminSupabase
          .from("employees")
          .update({ auth_user_id: user.id })
          .eq("id", matchedEmp.id);
      } catch (syncErr) {
        console.warn("Could not sync auth_user_id:", syncErr);
      }
    }

    // 3. Check if this is an employee login
    const isEmployeeMeta = userMeta.is_employee === true;
    let employeeRecord = matchedEmp;

    if (!employeeRecord) {
      const { data: empByAuth } = await adminSupabase
        .from("employees")
        .select("*, companies:company_id(id, name, email, industry, logo_url)")
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
        .order("created_at", { ascending: false })
        .limit(1);
      employeeRecord = empByAuth && empByAuth.length > 0 ? empByAuth[0] : null;
    } else if (!employeeRecord.companies) {
      const { data: empFull } = await adminSupabase
        .from("employees")
        .select("*, companies:company_id(id, name, email, industry, logo_url)")
        .eq("id", matchedEmp.id)
        .maybeSingle();
      if (empFull) employeeRecord = empFull;
    }

    if (isEmployeeMeta || employeeRecord) {
      let companyObj = employeeRecord?.companies || null;
      if (!companyObj && employeeRecord?.company_id) {
        const { data: cData } = await adminSupabase
          .from("companies")
          .select("id, name, email, industry, logo_url")
          .eq("id", employeeRecord.company_id)
          .maybeSingle();
        companyObj = cData;
      }

      return NextResponse.json({
        success: true,
        message: "Login successful!",
        user,
        session: authData.session,
        company: companyObj,
        isEmployee: true,
        role: employeeRecord?.role || userMeta.role || "employee",
        employee: employeeRecord
          ? {
              id: employeeRecord.id,
              full_name: employeeRecord.full_name,
              email: employeeRecord.email,
              role: employeeRecord.role,
              department: employeeRecord.department,
              designation: employeeRecord.designation,
              username: employeeRecord.username,
              status: employeeRecord.status,
              must_change_password: employeeRecord.must_change_password,
            }
          : null,
        requiresSetup: false,
      });
    }

    // 4. Admin login path — Get User's Company
    let { data: company } = await adminSupabase
      .from("companies")
      .select("*")
      .eq("admin_id", user.id)
      .maybeSingle();

    if (!company) {
      const { data: cByEmail } = await adminSupabase
        .from("companies")
        .select("*")
        .eq("email", targetEmail)
        .maybeSingle();
      company = cByEmail;

      // Link admin_id if missing
      if (company && user.id) {
        try {
          await adminSupabase.from("companies").update({ admin_id: user.id }).eq("id", company.id);
          company.admin_id = user.id;
        } catch (linkErr) {
          console.warn("Could not link admin_id:", linkErr);
        }
      }
    }

    // 5. Check Setup Completion
    const isCompletedInMeta = userMeta.setup_completed === true;
    const isCompletedInDB = company?.is_setup_completed === true;
    const hasProfileFields = !!(company?.legal_name && company?.country);

    const setupIsDone = isCompletedInMeta || isCompletedInDB || hasProfileFields;
    const requiresSetup = company ? !setupIsDone : false;

    // 6. Keep Auth Metadata & DB in sync if setup is done
    if (company && setupIsDone) {
      if (!isCompletedInMeta) {
        try {
          await adminSupabase.auth.admin.updateUserById(user.id, {
            user_metadata: { ...userMeta, setup_completed: true },
          });
        } catch (metaErr) {
          console.warn("Could not sync metadata:", metaErr);
        }
      }
      if (!isCompletedInDB && company.id) {
        try {
          await adminSupabase.from("companies").update({ is_setup_completed: true }).eq("id", company.id);
        } catch (dbErr) {
          console.warn("Could not sync DB is_setup_completed:", dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Login successful!",
      user,
      session: authData.session,
      company: company || null,
      isEmployee: false,
      requiresSetup,
    });

  } catch (error) {
    console.error("Login API Error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}


