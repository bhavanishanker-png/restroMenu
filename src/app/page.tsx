import Link from "next/link";

export default function HomePage() {
  return (
    <div className="bg-surface text-on-surface font-body-md antialiased">
      {/* ── Top Nav ── */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-margin-mobile md:px-margin-desktop h-20">
          <div className="flex items-center gap-md">
            <span className="font-headline-sm text-headline-sm font-bold text-primary cursor-default">QBite</span>
            <div className="hidden md:flex gap-gutter ml-md">
              <a href="#features" className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors">Features</a>
              <a href="#pricing" className="font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors">Pricing</a>
            </div>
          </div>
          <div className="flex items-center gap-base">
            <Link
              href="/login"
              className="hidden md:block font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors px-4 py-2"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="bg-primary text-on-primary font-label-bold text-label-bold px-6 py-3 rounded-lg shadow-level-1 hover:bg-primary-container active:translate-y-[2px] transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="max-w-7xl mx-auto pt-20">

        {/* ── Hero ── */}
        <section className="px-margin-mobile md:px-margin-desktop py-xl md:py-[120px] flex flex-col md:flex-row items-center gap-xl">

          {/* Left: copy */}
          <div className="md:w-1/2 space-y-md">
            <div className="inline-flex items-center gap-xs px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label-bold text-label-bold">
              <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>restaurant</span>
              <span>New Generation OS</span>
            </div>

            <h1 className="font-display text-display text-on-surface">
              The AI-Native OS for{" "}
              <span className="text-primary">Modern&nbsp;Restaurants</span>
            </h1>

            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[480px]">
              Transform your dining experience with QR-based ordering, smart kitchen displays, and real-time analytics. Built for scale, loved by diners.
            </p>

            <div className="flex flex-col sm:flex-row gap-gutter pt-base">
              <Link
                href="/login"
                className="bg-primary text-on-primary font-label-bold text-label-bold px-8 py-4 rounded-lg shadow-level-2 hover:bg-primary-container active:translate-y-[2px] transition-all flex items-center justify-center gap-2"
              >
                Start Your Free Trial
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              </Link>
              <button className="border-2 border-outline-variant text-on-surface font-label-bold text-label-bold px-8 py-4 rounded-lg hover:border-primary hover:text-primary active:translate-y-[2px] transition-all flex items-center justify-center gap-2">
                Book a Demo
              </button>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center gap-sm pt-base text-on-surface-variant font-body-sm text-body-sm">
              <div className="flex -space-x-2 shrink-0">
                {[
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuCgxSWiysl5xVg0SzCtN_SZmeUPqMdAtQUm3Q79e0zVyi3hTRj4rfRgQperOBZ-1BVJ_jkYbpmiTfhqfbhqdSu2OqKAd6e6lFzq6VIiKVU9_3d0k3DjXgM4WXR20r-8EpaGKH_TLbPS24MPqLl4DfKPyzCUJdWxis6AtSb1CsvACiS4XokaUTL6KbjyZqOl0z2vHhUeAq8zMyjQZ_rJihMDMnN82sgMSOc_xz66Xl3QRFH1kBhGqof0",
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuCQthob-8n5OR_bfn8s5XDG1u2r3jVWYB2d-VfKH5Hvy4VtIpAT15CbbhWo0e29n231RNZClJe7y4vFnMydOxBTBu281dGP8wRk_ytk_m_UCtxP3VmAnTOtt46nNrTcW8FfD0utplASj98dc0EhneKTyx6_EFk8UOmazytIgxIMP3sTJopcYfCQkJLpk2Oky5rq923gZLNND6lZ2Ox9gLjSxU6laZwTvVzpWGTD5vI9COXx12gdJfT6",
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuAjduesYRBJuo6HE3qzaL3kE_VukboO7LUlz5lTTJY2-UoPKr5VxTVapJ6nqdFQK_HXKJ1tS_b3feRFM-ESyzibejuQOyZ56V3g5xzsbFAI0OtLiSXGVJ4XUv31SH1ktOoHkd3uKrtUX51xqYUT1rlycFSvF3pxZjx--yiww5JmnFMkNI6A3aUrerX0ZB34dEfJEGStH3k2WCNby-4gY3jOv05GXETXqmr_7Bnqr28Ee5Fnt5LgiGUq",
                ].map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" width={32} height={32}
                    className="w-8 h-8 rounded-full border-2 border-surface object-cover" loading="lazy" />
                ))}
              </div>
              <span>Trusted by 500+ restaurants worldwide</span>
            </div>
          </div>

          {/* Right: product mockup */}
          <div className="md:w-1/2 relative w-full h-[420px] md:h-[560px] flex justify-center items-center overflow-hidden">
            {/* Decorative blobs */}
            <div className="absolute inset-0 bg-surface-container rounded-[40px] rotate-3 scale-105 opacity-70" />
            <div className="absolute inset-0 bg-surface-variant rounded-[40px] -rotate-2 opacity-80" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCv61JLckxEraC9aXKIf5NNhjN3Q-_2-pGdq1VrpZBWMggbKyWf04UHvGfmTDArvG7lMZTFX1jywTkyCxZH6Kvvr_h4HE8mdYkdwdPeA2LP3Vsbb4jm3a1Q9xdyQJ_19hz9EoPpXshnQYneDzB3dapVvU4c6GF5REh1ujjS2A7XRBu5PXIiUyuksapEzA4d9259T_AaKYBcw5Wa37O7x_QtN9DptaDgDhv6Dd2RNRXvN0lMivdIUSCx"
              alt="QBite dashboard and mobile menu"
              className="relative z-10 w-[105%] h-auto object-contain drop-shadow-2xl"
              loading="lazy"
            />
          </div>
        </section>

        {/* ── Features Section ── */}
        <section id="features" className="px-margin-mobile md:px-margin-desktop py-xl bg-surface-container-low rounded-[40px] mx-margin-mobile md:mx-0 my-xl scroll-mt-20">
          <div className="text-center mb-xl max-w-2xl mx-auto space-y-sm">
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              Everything you need to run a flawless service.
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              We&apos;ve reimagined every touchpoint of the dining experience, from the moment a guest sits down to the back-of-house operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">

            {/* Card 1 — QR Ordering */}
            <div className="bg-surface-container-lowest p-md rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow flex flex-col items-start gap-sm overflow-hidden group">
              <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform overflow-hidden shrink-0">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_scanner</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Smart QR Ordering</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Eliminate wait times and increase table turnover with seamless digital menus that guests love.
              </p>
              <div className="mt-auto pt-md w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDoCpZgPih4OVvVK_2sNRZjGlJWqrfZ7DWEvY65wk0K-IG4hKd6NEHAjQfS4jNd1xhX3_m-6uNcDKos3z0qVMXO6sjguz6-XXbRtkO6u_VKw62KCx3fN7BnoP8MENBUOmStqa4PELpI7VBH15PJOLfZBbHbHJ2srkVNIm8rJIKFlfKRl30BKW4RCzn0vCCT9wXADdqgoGxcXXCRobA1fCTWekzOE64ONteZgBzTVJ8Ir3ODO7Mqk5d-"
                  alt="QR ordering"
                  className="w-full h-36 object-cover rounded-lg border border-outline-variant/30"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Card 2 — KDS (2 cols) */}
            <div className="bg-surface-container-lowest p-md rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow flex flex-col gap-sm overflow-hidden group md:col-span-2">
              <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform overflow-hidden shrink-0">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>display_settings</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Intelligent KDS</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[420px]">
                Streamline kitchen operations with real-time order routing, predictive prep times, and visual status tracking across stations.
              </p>
              <div className="mt-auto relative h-52 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuDUvwIqCABxoOlZD_6aTHTKJSz-tyv7lWj_JMQTsCvR_ylimq1NvdRVDUqvL_oPt5vPNNiGfsA7yIl4H45yV0bO2wcBWitcZvAITkW6RegMyu2zuirDQBDL3adSTB7UxkGjfgZPr4W0wzCFKYuAoo3l-CeF2r9UspZJY8vR7CV4X3PhfcWtEmh4De0YqDtuMCEU8g1-0O8Mqo_qUv_62bclfVMiu0VkMCa5kIqWv8a5-0s0FGX8MAZI"
                  alt="Kitchen Display System"
                  className="absolute inset-0 w-full h-full object-cover opacity-90 mix-blend-multiply"
                  loading="lazy"
                />
                <div className="absolute bottom-3 right-3 bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-bold text-label-bold flex items-center gap-1 shadow-level-1">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                  Real-time Sync
                </div>
              </div>
            </div>

            {/* Card 3 — Analytics (3 cols) */}
            <div className="bg-surface-container-lowest p-md rounded-xl shadow-level-1 hover:shadow-level-2 transition-shadow overflow-hidden group md:col-span-3">
              <div className="flex flex-col md:flex-row gap-lg items-start md:items-center">
                <div className="md:w-1/3 space-y-sm">
                  <div className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform overflow-hidden shrink-0">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>monitoring</span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">Deep Analytics</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Make data-driven decisions with detailed reports on revenue, popular items, peak hours, and staff performance metrics.
                  </p>
                </div>

                {/* CSS bar chart */}
                <div className="md:w-2/3 w-full h-56 rounded-xl bg-surface border border-outline-variant/30 overflow-hidden p-4">
                  <div className="flex items-end justify-between gap-2 h-full">
                    {[
                      { h: 30, peak: false },
                      { h: 50, peak: false },
                      { h: 80, peak: true },
                      { h: 40, peak: false },
                      { h: 70, peak: false },
                      { h: 55, peak: false },
                      { h: 90, peak: false },
                      { h: 45, peak: false },
                    ].map(({ h, peak }, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end h-full">
                        <div
                          className={`w-full rounded-t-sm transition-colors cursor-pointer hover:opacity-80 ${
                            peak ? "bg-primary" : h >= 70 ? "bg-primary/60" : "bg-primary/25"
                          }`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Pricing CTA ── */}
        <section id="pricing" className="px-margin-mobile md:px-margin-desktop py-xl mb-xl scroll-mt-20">
          <div className="max-w-4xl mx-auto bg-primary text-on-primary rounded-2xl p-lg md:p-xl flex flex-col md:flex-row items-center justify-between gap-lg relative overflow-hidden shadow-[0_20px_60px_rgba(167,52,0,0.3)]">
            {/* Decorative blurs */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-container rounded-full mix-blend-screen opacity-40 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-surface-tint rounded-full mix-blend-multiply opacity-40 blur-3xl pointer-events-none" />

            <div className="z-10 max-w-md space-y-sm">
              <h2 className="font-headline-lg text-headline-lg text-on-primary">
                Simple, transparent pricing.
              </h2>
              <p className="font-body-md text-body-md" style={{ color: "rgba(255,219,207,0.9)" }}>
                No hidden fees, no complex tiers. Just a straightforward pay-as-you-go model that scales with your business success.
              </p>
            </div>

            {/* Pricing card */}
            <div className="z-10 bg-surface-container-lowest text-on-surface p-md rounded-xl shadow-level-2 w-full md:w-auto min-w-[300px] shrink-0">
              <div className="text-center mb-sm">
                <span className="font-label-bold text-label-bold text-primary uppercase tracking-wider">Pay-as-you-go</span>
                <div className="mt-2 flex items-baseline justify-center gap-1">
                  <span className="font-display text-display text-on-surface">1.5</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface-variant">%</span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">per successful order</span>
              </div>

              <ul className="space-y-2 mb-md">
                {["Unlimited tables", "Full KDS access", "Basic analytics"].map((item) => (
                  <li key={item} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>

              <Link
                href="/login"
                className="block w-full bg-primary text-on-primary font-label-bold text-label-bold px-4 py-3 rounded-lg text-center hover:bg-primary-container active:translate-y-[2px] transition-all"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant">
        <div className="max-w-7xl mx-auto py-xl px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-md">
          <span className="font-headline-sm text-headline-sm font-bold text-primary">QBite</span>
          <div className="flex flex-wrap justify-center gap-md">
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors">Terms of Service</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors">Contact Support</a>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant">© 2025 QBite. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
