/** @type {import('next').NextConfig} */
const nextConfig = {
  // Paquetes con binarios o WASM: se cargan desde node_modules, sin empaquetar.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Adjuntos para Mike en local (en producción van por Blob y el pedido solo lleva sus rutas).
  experimental: { serverActions: { bodySizeLimit: "45mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ]
  },
}

export default nextConfig
