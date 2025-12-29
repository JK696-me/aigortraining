import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { GlobalSyncIndicator } from "./GlobalSyncIndicator";

interface LayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function Layout({ children, hideNav = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Global sync status */}
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50">
        <GlobalSyncIndicator />
      </div>
      <main className={cn("pb-20", !hideNav && "pb-24")}>
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
