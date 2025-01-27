/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      // https://vercel.com/guides/fix-shared-array-buffer-not-defined-nextjs-react
      {
        // source: "/",
        source: "/:path*",

        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
