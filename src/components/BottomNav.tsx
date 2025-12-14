import { Home, Dumbbell, History, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/contexts/LanguageContext";

export function BottomNav() {
  const { t } = useLanguage();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-bottom">
      <div className="flex h-16 items-center justify-around px-4">
        <NavLink
          to="/"
          className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Home className="h-6 w-6" />
          <span className="text-xs font-medium">{t('home')}</span>
        </NavLink>
        <NavLink
          to="/workout"
          className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Dumbbell className="h-6 w-6" />
          <span className="text-xs font-medium">{t('workout')}</span>
        </NavLink>
        <NavLink
          to="/exercise-history"
          className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <History className="h-6 w-6" />
          <span className="text-xs font-medium">{t('history')}</span>
        </NavLink>
        <NavLink
          to="/settings"
          className="flex flex-col items-center gap-1 px-4 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Settings className="h-6 w-6" />
          <span className="text-xs font-medium">{t('settings')}</span>
        </NavLink>
      </div>
    </nav>
  );
}
