import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        palm: {
          black: "#1a1a1b",
          bg: "#1d1d1d",
          "bg-secondary": "#2d2d2d",
          border: "#3d3d3d",
          cream: "#ece6d5",
          text: "#dfd9d9",
          "text-2": "#bcb3b0",
          "text-3": "#7e7e7e",
          cyan: "#2bfae9",
          "cyan-2": "#29665f",
          green: "#32b288",
          "green-2": "#a9cc1f",
          pink: "#f85385",
          "pink-dark": "#2e0026",
          "pink-light": "#47003b",
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"SF Mono"', "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
