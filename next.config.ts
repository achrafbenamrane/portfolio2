import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Design work migrated from the previous portfolio is hosted on Cloudinary
    // and already delivered with f_auto,q_auto. Allow-listing the host lets
    // next/image handle sizing and lazy loading on top of that.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dwvgbojw0/**",
      },
    ],
  },
};

export default nextConfig;
