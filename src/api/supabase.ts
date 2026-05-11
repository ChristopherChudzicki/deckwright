// NOTE: Throws at module-evaluation time when env vars are missing.
// Tests must stub VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see
// src/test/setup.ts) or mock this module entirely with vi.mock.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.local.example to .env.local and fill in values from `npx supabase start`.",
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
