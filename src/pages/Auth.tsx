import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Mail, Lock, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error(t('fillAllFields'));
      return;
    }

    if (password.length < 6) {
      toast.error(t('passwordTooShort'));
      return;
    }

    setIsSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast.error(t('invalidCredentials'));
          } else {
            toast.error(error.message);
          }
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('User already registered')) {
            toast.error(t('userAlreadyExists'));
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success(t('checkEmail'));
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 safe-top safe-bottom">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AIgor Training</h1>
          <p className="text-sm text-muted-foreground">{t('appSubtitle')}</p>
        </div>
      </div>

      {/* Auth Card */}
      <Card className="w-full max-w-sm p-6 bg-card border-border">
        <h2 className="text-xl font-semibold text-foreground mb-6 text-center">
          {isLogin ? t('signIn') : t('signUpTitle')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12 bg-secondary border-border"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12 bg-secondary border-border"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isLogin ? (
              t('signIn')
            ) : (
              t('signUpButton')
            )}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLogin ? t('noAccount') : t('hasAccount')}
            <span className="text-primary font-medium ml-1">
              {isLogin ? t('signUpLink') : t('signInLink')}
            </span>
          </button>
        </div>
      </Card>

      {/* Hint about email confirmation */}
      <p className="text-xs text-muted-foreground mt-6 text-center max-w-xs">
        {t('emailConfirmHint')}
      </p>
    </div>
  );
}
