import { PublicLayout } from "@/components/layout";
import { useState } from "react";
import { Link } from "wouter";
import { Mail, ArrowLeft, MessageCircle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <PublicLayout>
      <div className="flex-1 flex items-center justify-center py-12 px-4 bg-[#f7f7f5]">
        <div className="w-full max-w-md">

          {/* Back link */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>

          <div className="bg-white rounded-2xl border border-border p-8 shadow-sm space-y-6">

            {!submitted ? (
              <>
                {/* Header */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-6 w-6" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-foreground">Forgot your password?</h1>
                  <p className="text-sm text-muted-foreground">
                    Enter your email and our support team will get you back in within minutes.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      Email Address
                    </label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-primary text-white font-semibold text-sm shadow transition-all hover:bg-primary/90"
                  >
                    Request Password Reset
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* Success state */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h1 className="text-2xl font-extrabold text-foreground">Request received!</h1>
                  <p className="text-sm text-muted-foreground">
                    We got your request for <strong className="text-foreground">{email}</strong>.
                    Our support team will reset your password shortly.
                  </p>
                </div>
              </>
            )}

            {/* WhatsApp support CTA — always visible */}
            <div className="rounded-xl bg-[#f0faf4] border border-primary/20 p-4 flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Need it faster?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  WhatsApp our support team directly and we'll reset your password on the spot.
                </p>
                <a
                  href={`https://wa.me/254741387785?text=${encodeURIComponent(`Hi, I need help resetting my Pesa AI password. My email is ${email || 'my email'}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat on WhatsApp → +254 741 387 785
                </a>
              </div>
            </div>

            {!submitted && (
              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Log in
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
