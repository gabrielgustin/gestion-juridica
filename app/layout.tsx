import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import "./globals.css"

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" })

export const metadata: Metadata = { title: "Cambel Red Jurídica", description: "Gestión de causas para estudios jurídicos" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${montserrat.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
