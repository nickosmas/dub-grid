import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use Anon key to simulate a logged-in user to test RLS
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
    const email = 'nicokosmas@outlook.com';
    const password = 'password123'; // Using a placeholder, we might need real credentials

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        console.error("Auth error:", authError.message);
        return;
    }

    console.log("Logged in successfully as:", authData.user.email);

    const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
    const { data: empData } = await supabase.from('employees').select('id').limit(1).single();

    if (!orgData || !empData) {
        console.error("Missing org or employee data");
        return;
    }

    console.log(`Testing upsert with orgId: ${orgData.id}, empId: ${empData.id}, date: '2026-03-01'`);

    const { data, error } = await supabase.from('schedule_notes').upsert({
        org_id: orgData.id,
        emp_id: empData.id,
        date: '2026-03-01',
        note_type: 'readings',
        updated_at: new Date().toISOString(),
    }, { onConflict: 'emp_id,date,note_type' }).select();

    if (error) {
        console.error("Upsert error:", error);
    } else {
        console.log("Upsert success:", data);
    }
}

main();
