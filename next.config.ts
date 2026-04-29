import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/stock-portfolio-tracker",
  images: { unoptimized: true },
};

export default nextConfig;
