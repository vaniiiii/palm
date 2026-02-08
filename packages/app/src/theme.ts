export const PROVIDERS = [
  { id: 0, name: "Echo Sonar", key: "echo", domain: "echo.xyz", logo: "/logos/echo-logo.svg", comingSoon: false },
  { id: 1, name: "Veriff", key: "legion", domain: "legion.cc", logo: "/logos/veriff-logo.svg", comingSoon: false },
  { id: 2, name: "Sumsub", key: "sumsub", domain: "sumsub.com", logo: "/logos/sumsub-logo.svg", comingSoon: true },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
