export const PROVIDERS = [
  { id: 0, name: "Echo Sonar", key: "echo", domain: "echo.xyz", logo: "/logos/echo-logo.svg" },
  { id: 1, name: "Veriff", key: "legion", domain: "legion.cc", logo: "/logos/veriff-logo.svg" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
