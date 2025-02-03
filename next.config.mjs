/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [
            {
              source: "/:path*", // Apply to all routes
              headers: [
                // Required headers for WebAssembly
                {
                  key: "Cross-Origin-Embedder-Policy",
                  value: "require-corp",
                },
                {
                  key: "Cross-Origin-Opener-Policy",
                  value: "same-origin",
                },
                // Optional: For serving .wasm files correctly
                {
                  key: "Cross-Origin-Resource-Policy",
                  value: "cross-origin",
                },
              ],
            },
          ];
    }
};

export default nextConfig;
