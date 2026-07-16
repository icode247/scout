import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"],
  theme: {
    extend: {
      colors: {
        // Brand blue, anchored at #126ba3 (≈ brand-600).
        brand: {
          50: "#f4ffeb",
          100: "#e7ffd2",
          200: "#cff99d",
          300: "#b4ef6f",
          400: "#9dde47",
          500: "#7fc92b",
          600: "#5fa11d",
          700: "#49791c",
          800: "#33551a",
          900: "#213916",
          950: "#10210d",
        },
        signal: {
          50: "#eefbf4",
          100: "#d7f4e4",
          500: "#1f9d6a",
          700: "#15724e",
        },
        human: {
          50: "#fff7eb",
          100: "#ffe8c4",
          500: "#d88a24",
          700: "#9d5f12",
        },
        ink: {
          DEFAULT: "#14210f",
          soft: "#3d4a35",
          muted: "#69735f",
        },
        surface: {
          DEFAULT: "#f4ffeb",
          soft: "#ecfadf",
          sunken: "#dff1cf",
        },
      },
      fontFamily: {
        sans: [
          "Manrope",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: ["Space Grotesk", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      maxWidth: {
        container: "1160px",
        prose: "68ch",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(13,27,42,0.04), 0 8px 24px -12px rgba(13,27,42,0.12)",
        lift: "0 1px 2px rgba(13,27,42,0.05), 0 24px 48px -20px rgba(18,107,163,0.28)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Emil Kowalski principle: short, ease-out, transform/opacity only.
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [typography],
};
