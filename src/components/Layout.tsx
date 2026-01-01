import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { useIntro } from "@/contexts/IntroContext";

interface LayoutProps {
  children: ReactNode;
  hideNav?: boolean;
}

export function Layout({ children, hideNav = false }: LayoutProps) {
  const { isIntroOpen } = useIntro();
  const shouldHideNav = hideNav || isIntroOpen;
  
  return (
    <div className="min-h-screen bg-background">
      <main className={cn("pb-20", !shouldHideNav && "pb-24")}>
        {children}
      </main>
      {!shouldHideNav && <BottomNav />}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
