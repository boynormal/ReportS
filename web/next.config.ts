import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(__dirname, "../.env") });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: resolve(__dirname, ".."),
  allowedDevOrigins: ["scrapee.scharoenchai.cloud"],
};

export default nextConfig;
