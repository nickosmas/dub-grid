import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://xpoylacxkbphnudsupuu.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwb3lsYWN4a2JwaG51ZHN1cHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2ODg2NzIsImV4cCI6MjA4ODI2NDY3Mn0.NCGyFV-hNAUecCqIvwsnYv-Hdj6zoVmrfnK6XsGLx4k'
);

async function check() {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'nicokosmas@outlook.com',
        password: 'password123',
    });

    if (error) {
        console.error('Login error:', error);
        return;
    }

    const token = data.session.access_token;

    const payloadStr = Buffer.from(token.split('.')[1], 'base64').toString('utf8');
    console.log('JWT Payload:', JSON.parse(payloadStr));
}

check();
