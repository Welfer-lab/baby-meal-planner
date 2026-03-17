export const runtimeConfig = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  sharedStateId: "shared-home",
  sharedLoginEmail: "",
  redirectTo: "",
};

export function isSupabaseEnabled() {
  return Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);
}
