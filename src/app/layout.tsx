import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "BookAirfreight Contact Form Sender", description: "Contact form submission workspace for BookAirfreight." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
