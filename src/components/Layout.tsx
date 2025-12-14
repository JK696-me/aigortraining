import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface LayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function Layout({ children, hideNav = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
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
