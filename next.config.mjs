/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  // Redirection fixe : gérée avant le rendu (pas de redirect() dans une page prérendue).
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
