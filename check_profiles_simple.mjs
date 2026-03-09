import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xpoylacxkbphnudsupuu.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb3lsYWN4a2JwaG51ZHN1cHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg2NzIsImV4cCI6MjA4ODI2NDY3Mn0.NCGyFV-hNAUecCqIvwsnYv-Hdj6zoVmrfnK6XsGLx4k'
);

async function check() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*');

    if (error) {
        console.error('Fetch error:', error);
        return;
    }
    console.log('Profiles data:', data);
}

check();
