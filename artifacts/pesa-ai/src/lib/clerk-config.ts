import { shadcn } from "@clerk/themes";

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Use the key issued for this Clerk instance. Deriving one from the hostname
// only works when Clerk has explicitly configured that hostname as its API domain.
export const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

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
    cardBox: "bg-white rounded-3xl w-[440px] max-w-full overflow-hidden border border-[#dcebe3] shadow-lg",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-extrabold text-[#0a4a3a]",
    headerSubtitle: "text-slate-600",
    socialButtonsBlockButtonText: "font-semibold text-slate-800",
    formFieldLabel: "font-semibold text-slate-800",
    footerActionLink: "font-semibold text-[#168447]",
    footerActionText: "text-slate-600",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "font-semibold text-[#168447]",
    formFieldSuccessText: "text-emerald-800",
    alertText: "text-slate-800",
    logoBox: "mb-2",
    logoImage: "max-h-10",
    socialButtonsBlockButton: "rounded-xl border-slate-200",
    formButtonPrimary: "rounded-xl font-bold",
    formFieldInput: "rounded-xl border-slate-200",
    footerAction: "text-slate-600",
    dividerLine: "bg-slate-200",
    alert: "rounded-xl",
    otpCodeFieldInput: "rounded-lg border-slate-200",
    formFieldRow: "gap-2",
    main: "gap-4",
  },
};

export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}