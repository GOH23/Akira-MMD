import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        BackgroundColor: "var(--bg-color)",
        ForegroundColor: "var(--text-color)",
        ForegroundButton: "var(--fg-button-color)",
        BackgroundButton: "var(--bg-button-color)",
        BackgroundHoverButton: "var(--bg-hover-button-color)",
        MenuItemBg: "var(--menu-layout-bg)"
      },
    },
  },
  plugins: [],
} satisfies Config;
