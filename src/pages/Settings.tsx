import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Bell, Scale, Moon, Info, LogOut, ChevronRight, Zap, Globe, Dumbbell, Weight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Layout } from "@/components/Layout";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSettings } from "@/hooks/useUserSettings";
import { toast } from "sonner";

export default function Settings() {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLanguage();
  const { user, signOut } = useAuth();
  const { settings, updateSettings, isUpdating } = useUserSettings();

  const [barbellIncrement, setBarbellIncrement] = useState('5');
  const [dumbbellsIncrement, setDumbbellsIncrement] = useState('2');
  const [machineIncrement, setMachineIncrement] = useState('1');

  // Initialize from settings
  useEffect(() => {
    if (settings) {
      setBarbellIncrement(settings.barbell_increment.toString());
      setDumbbellsIncrement(settings.dumbbells_increment.toString());
      setMachineIncrement(settings.machine_increment.toString());
    }
  }, [settings]);

  const handleSignOut = async () => {
    await signOut();
    toast.success(t('signOut'));
  };

  const handleSaveIncrement = (field: 'barbell_increment' | 'dumbbells_increment' | 'machine_increment', value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) return;
    
    updateSettings({ [field]: numValue }, {
      onSuccess: () => toast.success(t('settingsSaved'))
    });
  };

  return (
    <Layout>
      <div className="px-4 pt-12 safe-top pb-24">
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
              <h3 className="font-semibold text-foreground truncate">{user?.email}</h3>
              <p className="text-sm text-muted-foreground">{t('loggedInAs')}</p>
            </div>
          </div>
        </Card>

        {/* Weight Increments Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('weightIncrements')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Weight className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('barbellIncrement')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={barbellIncrement}
                  onChange={(e) => setBarbellIncrement(e.target.value)}
                  onBlur={() => handleSaveIncrement('barbell_increment', barbellIncrement)}
                  className="w-20 h-9 text-center bg-secondary border-border"
                  step="0.5"
                  min="0.5"
                />
                <span className="text-sm text-muted-foreground">{t('kg')}</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('dumbbellsIncrement')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={dumbbellsIncrement}
                  onChange={(e) => setDumbbellsIncrement(e.target.value)}
                  onBlur={() => handleSaveIncrement('dumbbells_increment', dumbbellsIncrement)}
                  className="w-20 h-9 text-center bg-secondary border-border"
                  step="0.5"
                  min="0.5"
                />
                <span className="text-sm text-muted-foreground">{t('kg')}</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('machineIncrement')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={machineIncrement}
                  onChange={(e) => setMachineIncrement(e.target.value)}
                  onBlur={() => handleSaveIncrement('machine_increment', machineIncrement)}
                  className="w-20 h-9 text-center bg-secondary border-border"
                  step="0.5"
                  min="0.5"
                />
                <span className="text-sm text-muted-foreground">{t('kg')}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Exercises Section */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
            {t('exercisesList')}
          </h3>
          <Card className="bg-card border-border overflow-hidden">
            <button
              onClick={() => navigate('/exercises')}
              className="flex items-center justify-between p-4 w-full"
            >
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{t('manageExercises')}</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

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
          <button 
            onClick={handleSignOut}
            className="flex items-center gap-3 p-4 w-full text-destructive"
          >
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
