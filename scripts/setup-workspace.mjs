import { createClient } from '@supabase/supabase-js';

// Instructions:
// 1. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// 2. (Optional) Add SUPABASE_SERVICE_ROLE_KEY to .env.local to automate everything
// 3. Run: node scripts/setup-workspace.mjs

const URL = 'https://xpoylacxkbphnudsupuu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb3lsYWN4a2JwaG51ZHN1cHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg2NzIsImV4cCI6MjA4ODI2NDY3Mn0.NCGyFV-hNAUecCqIvwsnYv-Hdj6zoVmrfnK6XsGLx4k';

// If you have a service role key, use it here to bypass RLS.
// Otherwise, follow the SQL instructions below.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_KEY;

const supabase = createClient(URL, SERVICE_KEY);

async function setup() {
    console.log('--- DubGrid Workspace Setup ---');

    const email = 'nicokosmas@outlook.com';

    console.log(`Target User: ${email}`);

    // Step 1: Promote user to Gridmaster (requires SQL Editor or Service Key)
    try {
        console.log('Attempting to promote user to Gridmaster...');
        const { error: gmError } = await supabase.rpc('assign_gridmaster_by_email', {
            p_email: email
        });

        if (gmError) {
            console.warn('Note: Could not promote user via RPC (this is normal if RLS is active).');
            console.log('Please run the following SQL in your Supabase SQL Editor:');
            console.log(`SELECT public.assign_gridmaster_by_email('${email}');`);
        } else {
            console.log('✅ User promoted to Gridmaster.');
        }
    } catch (e) {
        console.error('Error during promotion:', e.message);
    }

    // Step 2: Create Organization
    try {
        console.log('Checking for organizations...');
        const { data: orgs, error: fetchError } = await supabase.from('organizations').select('id').limit(1);

        if (fetchError) {
            console.error('Error fetching orgs:', fetchError.message);
        } else if (orgs && orgs.length > 0) {
            console.log('✅ At least one organization already exists.');
        } else {
            console.log('Creating default organization...');
            const { data: newOrg, error: insertError } = await supabase.from('organizations').insert({
                name: 'Main Facility',
                slug: 'main-facility',
                address: '123 Care St',
                phone: '555-0123'
            }).select().single();

            if (insertError) {
                console.warn('Could not create organization via API.');
                console.log('Please run the following SQL in your Supabase SQL Editor:');
                console.log(`INSERT INTO public.organizations (name, slug, address, phone) VALUES ('Main Facility', 'main-facility', '123 Care St', '555-0123') RETURNING id;`);
            } else {
                console.log(`✅ Organization created: ${newOrg.name} (${newOrg.id})`);

                // Step 3: Link user to Organization as Admin
                console.log('Linking user to organization...');
                const { error: linkError } = await supabase.rpc('assign_org_role_by_email', {
                    p_email: email,
                    p_org_id: newOrg.id,
                    p_org_role: 'admin'
                });

                if (linkError) {
                    console.warn('Could not link user via RPC.');
                    console.log('Please run the following SQL:');
                    console.log(`SELECT public.assign_org_role_by_email('${email}', '${newOrg.id}', 'admin');`);
                } else {
                    console.log('✅ User linked as Admin.');
                }
            }
        }
    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

setup();
