import { execSync } from "node:child_process";
import type { Plugin } from "vite";

/**
 * Vite plugin that injects local-Supabase env vars at dev-server boot.
 *
 * Runs `supabase status -o env` and sets VITE_SUPABASE_URL +
 * VITE_SUPABASE_ANON_KEY in process.env so the supabase client (which
 * reads import.meta.env) finds them. Removes the manual `.env.local`
 * copy step for local development.
 *
 * Active only when Vite's command is `serve` (i.e. `vite dev` /
 * `npm run dev`). Production builds are not affected — the host's
 * env vars supply the values there.
 *
 * If `supabase status` fails (Supabase stack isn't running), the
 * plugin silently no-ops; the supabase client's existing
 * "Missing VITE_SUPABASE_..." throw will surface a clear error
 * to the developer.
 */
export function supabaseLocalEnv(): Plugin {
  return {
    name: "supabase-local-env",
    config(_config, env) {
      if (env.command !== "serve") return;

      let raw: string;
      try {
        raw = execSync("npx supabase status -o env", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          // 5s ceiling so a hung Docker can't block dev startup forever.
          timeout: 5000,
        });
      } catch {
        // Supabase isn't running, or the CLI errored / timed out. Let the
        // regular env handling take over so the supabase client's
        // missing-env throw is the message the developer sees.
        return;
      }

      const parsed: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const match = line.match(/^([A-Z_]+)="?(.+?)"?$/);
        if (match) parsed[match[1]] = match[2];
      }

      const url = parsed.API_URL;
      const key = parsed.PUBLISHABLE_KEY ?? parsed.ANON_KEY;

      if (url && !process.env.VITE_SUPABASE_URL) {
        process.env.VITE_SUPABASE_URL = url;
      }
      if (key && !process.env.VITE_SUPABASE_ANON_KEY) {
        process.env.VITE_SUPABASE_ANON_KEY = key;
      }
    },
  };
}
