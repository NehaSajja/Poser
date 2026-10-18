import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Poser 2.0 — a place to work out a pose", description: "A local playground for turning a gesture sketch into a drawing reference." };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
