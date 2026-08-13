import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export function useAuthRedirect() {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  return { me, isLoading };
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && me) {
      if (!me.authenticated) {
        setLocation("/login");
      } else if (me.isAdmin) {
        setLocation("/admin");
      }
    }
  }, [me, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return me?.authenticated && !me?.isAdmin ? <>{children}</> : null;
}
