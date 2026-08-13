import { Link } from "wouter";
import { SiWhatsapp } from "react-icons/si";

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-white py-8">
      <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SiWhatsapp className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">Pesa AI</span>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Empowering Kenyan SMEs on WhatsApp.</p>
          <p className="mt-1">Built by Adplay Media Ltd &nbsp;&middot;&nbsp; 📞 +254 741 387 785</p>
        </div>
        <div className="w-[100px] hidden md:block">
          {/* Empty right side to balance flex-between */}
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
          <nav className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90">
              Get Started
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <Footer />
    </div>
  );
}
