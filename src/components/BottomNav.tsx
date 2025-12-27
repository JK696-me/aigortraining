import { Home, Dumbbell, History, Settings, Heart } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLanguage } from "@/contexts/LanguageContext";

export function BottomNav() {
  const { t, locale } = useLanguage();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg safe-bottom">
      <div className="flex h-16 items-center justify-around px-2">
        <NavLink
          to="/"
          className="flex flex-col items-center gap-1 px-2 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('home')}</span>
        </NavLink>
        <NavLink
          to="/workout"
          className="flex flex-col items-center gap-1 px-2 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Dumbbell className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('workout')}</span>
        </NavLink>
        <NavLink
          to="/health"
          className="flex flex-col items-center gap-1 px-2 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Heart className="h-5 w-5" />
          <span className="text-[10px] font-medium">{locale === 'ru' ? 'Здоровье' : 'Health'}</span>
        </NavLink>
        <NavLink
          to="/exercise-history"
          className="flex flex-col items-center gap-1 px-2 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <History className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('history')}</span>
        </NavLink>
        <NavLink
          to="/settings"
          className="flex flex-col items-center gap-1 px-2 py-2 text-muted-foreground transition-colors"
          activeClassName="text-primary"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] font-medium">{t('settings')}</span>
        </NavLink>
      </div>
    </nav>
  );
}
