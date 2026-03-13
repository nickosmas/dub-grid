import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xpoylacxkbphnudsupuu.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb3lsYWN4a2JwaG51ZHN1cHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg2NzIsImV4cCI6MjA4ODI2NDY3Mn0.NCGyFV-hNAUecCqIvwsnYv-Hdj6zoVmrfnK6XsGLx4k'
);

async function check() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, org_id, platform_role, org_role')
        .eq('id', '51aa3347-950e-4e91-a75b-10d41782515d') // ID from check_token.mjs output
        .single();

    if (error) {
        console.error('Profile fetch error:', error);
        return;
    }
    console.log('User Profile:', data);
}

check();
