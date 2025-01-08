import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  i18n: {
    locales: ["en","ru"],
    defaultLocale: 'ru',
    localeDetection: false,
  },
  trailingSlash: true
};

export default nextConfig;
