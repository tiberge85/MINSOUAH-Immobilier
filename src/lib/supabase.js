// ─────────────────────────────────────────────────────────────────────────────
//  Connexion Supabase
//  1. Crée un projet sur https://supabase.com (gratuit)
//  2. Va dans Settings > API
//  3. Copie ton "Project URL" et ta "anon public key" ci-dessous
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://TON-PROJET.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'ta-cle-anon-publique';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
