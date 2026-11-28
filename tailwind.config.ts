import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["selector", "[data-theme='dark']"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { navy: "#14233b", ink: "#172033" } } },
  plugins: [],
};
export default config;
