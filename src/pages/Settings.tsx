import { User, Bell, Scale, Moon, Info, LogOut, ChevronRight, Zap, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Settings() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">{t('appSettings')}</h1>
          </div>
          <p className="text-muted-foreground">{t('customizeExperience')}</p>
        </div>

        {/* User Card */}
        <Card className="p-4 bg-card border-border mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">{t('guestUser')}</h3>
              <p className="text-sm text-muted-foreground">{t('tapToSignIn')}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        {/* Language Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('language')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('language')}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setLocale('ru')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    locale === 'ru'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  RU
                </button>
                <button
                  onClick={() => setLocale('en')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    locale === 'en'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Profile Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('profile')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('account')}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('weightUnit')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('kg')}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </Card>
        </div>

        {/* Preferences Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('preferences')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('notifications')}</span>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('darkMode')}</span>
              </div>
              <Switch defaultChecked />
            </div>
          </Card>
        </div>

        {/* About Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('about')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('aboutApp')}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </Card>
        </div>

        {/* Logout */}
        <Card className="bg-card border-border overflow-hidden">
          <button className="flex items-center gap-3 p-4 w-full text-destructive">
            <LogOut className="h-5 w-5" />
            <span className="font-medium">{t('signOut')}</span>
          </button>
        </Card>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          AIgor Training v1.0.0
        </p>
      </div>
    </Layout>
  );
}
