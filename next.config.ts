import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Native / worker-thread packages must not be bundled by webpack
  serverExternalPackages: ["tesseract.js", "pdfjs-dist", "sharp", "better-sqlite3"],
  // `output: "standalone"` copies only the files Next can statically trace. These packages load
  // some of their files dynamically (pdf.js's worker + fonts, Tesseract's worker + wasm core), so
  // list them explicitly or PDFs and OCR fail inside the Docker image.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/tesseract.js/src/**",
      "./node_modules/tesseract.js-core/**",
    ],
  },
  // Note: on a local `next build` the tracer also copies ./uploads and ./ocr-data into
  // .next/standalone (it follows path.join(process.cwd(), "uploads")). That cannot leak into a
  // Docker image because .dockerignore keeps both folders out of the build context; the image gets
  // OCR language data from its own download stage instead (see Dockerfile).
  // Default bottom-left position collides with the floating sidebar's
  // footer card — this is a dev-only overlay, never shown in production.
  devIndicators: { position: "bottom-right" },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]}];
  },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};
export default nextConfig;
