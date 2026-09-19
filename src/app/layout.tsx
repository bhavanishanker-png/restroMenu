import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

/** Body. Variable weight, so one file covers 400–700. */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Display. Carries the headings and the wordmark — tight, technical, distinct
 *  enough from Inter that the pairing reads as a decision rather than a default. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

/** Figures that must not jitter as digits change: order numbers, join codes. */
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "QBite — Restaurant Ordering",
    template: "%s · QBite",
  },
  description:
    "QR ordering, a live kitchen display and real-time analytics in one system. Guests scan, order and pay from the table.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "QBite" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Matches --background in each theme so the browser chrome and the
  // over-scroll area never flash the wrong colour.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes: its inline script
    // sets the class on <html> before React hydrates, so the attribute
    // legitimately differs between server and client markup.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        {/* Dev-only service-worker teardown.
            A worker installed by an earlier session caches /_next/static/
            cache-first, which in dev pins a stale `webpack.js` and crashes the
            app with "Cannot read properties of undefined (reading 'call')".
            This has to run as a plain inline script rather than in an effect:
            when the stale chunk wins, React never finishes rendering, so no
            effect ever fires and the app cannot un-break itself. Running here,
            at parse time, means one reload always recovers. */}
        {process.env.NODE_ENV !== "production" && (
          /* eslint-disable-next-line react/no-danger */
          <script
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})})}if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}}catch(e){}})()",
            }}
          />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The icon font is genuinely global — this is the App Router root
            layout, so it loads once for every route. The rule is written for
            the pages/ directory, where that was not guaranteed. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        {/* Scroll reveals render at opacity 0 and are brought in by an
            IntersectionObserver. With JavaScript unavailable that observer
            never runs, which would leave most of the marketing page blank —
            so without JS the animation is simply cancelled and the content
            shows immediately. */}
        <noscript>
          {/* eslint-disable-next-line react/no-danger */}
          <style
            dangerouslySetInnerHTML={{
              __html: "[data-reveal]{opacity:1!important;transform:none!important}",
            }}
          />
        </noscript>
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
