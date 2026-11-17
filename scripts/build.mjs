// Copies public/ to dist/ and writes dist/config.js from Vercel environment variables.
import { cpSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
if (!url || !key) console.warn('WARNING: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. The app will show a setup message.');
if (/service_role|sb_secret_/i.test(key)) { console.error('Refusing to build: that is the SECRET key. Use the public anon/publishable key.'); process.exit(1); }

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
writeFileSync('dist/config.js', 'window.BANDSTAND_CONFIG=' + JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }) + ';\n');
console.log('Built dist/ for', url || '(no Supabase URL)');
