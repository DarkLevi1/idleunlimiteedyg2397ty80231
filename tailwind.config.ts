import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        mta: {
          black: "#0c0c0c",
          blue: "#2850ad",
          orange: "#ff6319",
          green: "#00933c",
          red: "#ee352e",
          purple: "#b933ad",
          lime: "#6cbe45",
          brown: "#996633",
          gray: "#808183",
          yellow: "#fccc0a",
          silver: "#a7a9ac",
        },
      },
      boxShadow: {
        tile: "0 10px 30px rgba(0,0,0,.24)",
      },
    },
  },
  plugins: [],
};

export default config;
