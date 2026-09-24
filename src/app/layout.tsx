import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "BookAirfreight Outbound OS", description: "Freight outbound intelligence, cold-email results and contact-form operations." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
