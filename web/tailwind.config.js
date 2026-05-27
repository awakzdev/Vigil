/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "scan-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translate(-50%, 12px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
      },
      animation: {
        "scan-indeterminate": "scan-indeterminate 1.8s ease-in-out infinite",
        "toast-in": "toast-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};
