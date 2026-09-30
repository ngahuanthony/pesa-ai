import { shadcn } from "@clerk/themes";
import { publishableKeyFromHost } from "@clerk/react/internal";

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Use the key issued for this Clerk instance. Deriving one from the hostname
// only works when Clerk has explicitly configured that hostname as its API domain.
// Production uses the verified Clerk Frontend API at clerk.<app-domain>.
// Keep development keys as-is; derive the correct production key for this host.
export const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in development by design; the production environment supplies this.
export const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY for Clerk owner sign-in.");
}

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#0a4a3a",
    colorForeground: "#102a22",
    colorMutedForeground: "#5f716a",
    colorDanger: "#b42318",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#102a22",
    colorNeutral: "#d6e2dc",
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "0.875rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-3xl !w-[440px] max-w-full overflow-hidden border border-[#dcebe3] shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!mt-0 !shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-lg font-extrabold text-[#0a4a3a]",
    headerSubtitle: "text-sm leading-relaxed text-slate-600",
    socialButtonsBlockButtonText: "font-semibold text-slate-800",
    formFieldLabel: "text-sm font-semibold text-slate-800 after:ml-1 after:text-[#168447] after:content-['*']",
    footerActionLink: "font-semibold text-[#168447]",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "font-semibold text-[#168447]",
    formFieldSuccessText: "text-emerald-800",
    alertText: "text-slate-800",
    logoBox: "mb-1",
    logoImage: "max-h-10",
    socialButtonsBlockButton: "rounded-xl border-slate-200",
    formButtonPrimary: "!h-10 rounded-xl font-bold !text-white",
    formFieldInput: "h-10 w-full min-w-0 rounded-xl border border-[#d7e3dc] bg-white px-4 text-sm text-[#102a22] shadow-none placeholder:text-slate-400 focus:border-[#0a4a3a] focus:outline-none focus:ring-2 focus:ring-[#0a4a3a]/10",
    footerAction: "text-slate-600",
    dividerLine: "bg-slate-200",
    alert: "rounded-xl",
    otpCodeFieldInput: "rounded-lg border-slate-200",
    formFieldRow: "gap-1.5",
    main: "gap-3 px-6 pb-4 pt-4 sm:px-8",
  },
};

export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}