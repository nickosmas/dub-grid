import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xpoylacxkbphnudsupuu.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb3lsYWN4a2JwaG51ZHN1cHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg2NzIsImV4cCI6MjA4ODI2NDY3Mn0.NCGyFV-hNAUecCqIvwsnYv-Hdj6zoVmrfnK6XsGLx4k'
);

async function check() {
    const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'nicokosmas@outlook.com',
        password: 'password123',
    });

    if (loginError) {
        console.error('Login error:', loginError);
        return;
    }

    // Try querying profiles with the authenticated session
    const { data, error } = await supabase.from('profiles').select('*, organizations(slug)').eq('id', auth.session.user.id);

    console.log('Profiles data:', data);
    console.log('Profiles error:', error);
}

check();
