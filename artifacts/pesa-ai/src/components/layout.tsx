import { Link } from "wouter";
import { SiWhatsapp } from "react-icons/si";

export function Footer() {
  return (
    <footer className="w-full bg-[#0d2b1d] text-white">
      <div className="container mx-auto px-4 md:px-6 py-10">
        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <SiWhatsapp className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">Pesa AI</span>
            </div>
            <p className="text-sm text-white/70">Empowering Kenyan SMEs on WhatsApp.</p>
            <div className="mt-3 inline-flex items-center gap-2 border border-white/20 rounded-lg px-3 py-1.5">
              <span className="text-xs text-white/70">🏢</span>
              <div>
                <p className="text-xs font-semibold text-white">Adplay Media LTD</p>
                <p className="text-[11px] text-white/60">Registered in Kenya · Building the future of African commerce</p>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Platform</p>
            <ul className="space-y-2">
              {[["Features", "#features"], ["Pricing", "#pricing"], ["About Us", "#about"], ["Contact", "#contact"]].map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-sm text-white/70 hover:text-white transition-colors">{label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-3">Contact</p>
            <ul className="space-y-2 text-sm text-white/70">
              <li>📞 +254 741 387 785</li>
              <li>💬 WhatsApp: +254 741 387 785</li>
              <li>✉️ hello@pesaai.africa</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} Adplay Media LTD. All rights reserved.</p>
          <p className="text-xs text-white/50">Built in Kenya 🇰🇪</p>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 md:px-6 flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <SiWhatsapp className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">Pesa AI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="/#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="/#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About Us</a>
            <a href="/#contact" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
              Get Started
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
