export const PROVIDERS = [
  { id: 0, name: "Echo", domain: "echo.xyz" },
  { id: 1, name: "Legion", domain: "legion.cc" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
