export function isAnonUsersEnabled(): boolean {
  return import.meta.env.VITE_ANON_USERS_ENABLED === "true";
}
