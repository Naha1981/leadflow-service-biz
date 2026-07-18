import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d1117",
        panel: "#161b22",
        border: "#2a3038",
        gold: "#d4af37",
        indigo: "#4b3f72",
        text: "#e6e6e6",
        muted: "#8b949e",
      },
    },
  },
} satisfies Config;
