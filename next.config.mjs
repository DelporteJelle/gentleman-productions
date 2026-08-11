/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "export", // <=== enables static exports
  reactStrictMode: true,
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
