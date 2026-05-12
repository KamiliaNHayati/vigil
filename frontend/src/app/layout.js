import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "Vigil",
  description:
    "Real-time evaluation feed for the Vigil Security Harness. Monitors AI agent payments, risk assessments, and block events on the Kite network.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#10131b" />
        <link rel="icon" href="/vigil.svg" />
        <link href="https://fonts.googleapis.com" rel="preconnect"/>
        <link crossOrigin="anonymous" href="https://fonts.gstatic.com" rel="preconnect"/>
        <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&family=Inter:wght@400&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
      </head>
      <body className="bg-background text-on-surface min-h-screen flex flex-col font-body-base antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
