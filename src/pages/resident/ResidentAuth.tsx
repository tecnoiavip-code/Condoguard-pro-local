import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import appLogo from '@/assets/app-icon-v18-preview.png';

const ResidentAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();
  const auth = supabase.auth as any;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      const { error } = await auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        if (error.message.includes('rate limit')) {
          toast.error('Muitas tentativas. Aguarde alguns minutos antes de solicitar novamente.');
        } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
          toast.info('O email pode ter sido enviado. Verifique sua caixa de entrada e spam. Caso não receba, tente novamente em alguns minutos.');
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada e pasta de spam.');
      setShowForgotPassword(false);
      setResetEmail('');
    } catch {
      toast.error('Erro ao enviar email de recuperação. Tente novamente em alguns minutos.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message.includes('Invalid login') ? 'Email ou senha incorretos' : error.message);
        return;
      }

      const { data: role } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', data.user.id)
        .eq('role', 'resident')
        .maybeSingle();

      if (!role) {
        toast.success('Login realizado! Redirecionando para a portaria.');
        navigate('/');
        return;
      }

      toast.success('Login realizado!');
      navigate('/morador');
    } catch {
      toast.error('Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('As senhas não conferem');
      return;
    }
    if (password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('register-resident', {
        body: { email: email.trim(), password },
      });

      if (fnError) {
        // Try to parse error body for user-friendly message
        try {
          const parsed = JSON.parse(fnError.message);
          toast.error(parsed.error || 'Erro ao criar conta. Tente novamente.');
        } catch {
          toast.error('Erro ao criar conta. Tente novamente.');
        }
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Conta criada com sucesso! Faça login.');
      setMode('login');
    } catch {
      toast.error('Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent/5 via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={appLogo} alt="Portal do Morador" className="w-16 h-16 rounded-2xl shadow-lg" />
          </div>
          <CardTitle className="text-2xl">Portal do Morador</CardTitle>
          <CardDescription>Acesse sua área exclusiva</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email cadastrado</Label>
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoading} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entrar'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <button type="button" onClick={() => { setResetEmail(email); setShowForgotPassword(true); }} className="text-muted-foreground hover:text-accent hover:underline">
                  Esqueci minha senha
                </button>
                {' · '}
                Primeira vez?{' '}
                <button type="button" onClick={() => setMode('register')} className="text-accent hover:underline font-medium">Criar conta</button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email cadastrado na portaria</Label>
                <Input id="reg-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
                <p className="text-xs text-muted-foreground">Use o mesmo email do seu cadastro de morador</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Criar senha</Label>
                <Input id="reg-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} disabled={isLoading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-confirm">Confirmar senha</Label>
                <Input id="reg-confirm" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} disabled={isLoading} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : 'Criar Conta'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{' '}
                <button type="button" onClick={() => setMode('login')} className="text-accent hover:underline font-medium">Fazer login</button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForgotPassword(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Recuperar Senha</CardTitle>
              <CardDescription>Informe seu email para receber o link de recuperação</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    disabled={isSendingReset}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForgotPassword(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isSendingReset}>
                    {isSendingReset ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</> : 'Enviar Link'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ResidentAuth;
