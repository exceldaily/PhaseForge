import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  // pdf.js loads its worker via a runtime path the bundler can't see; without
  // this Vercel omits pdf.worker.mjs from the function bundle and quote PDF
  // intake fails with "Setting up fake worker failed".
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
};

export default nextConfig;
