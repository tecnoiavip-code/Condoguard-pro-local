import { describe, it, expect } from 'vitest';
import { translateAuthError } from '../src/lib/translate-auth-error';

describe('translateAuthError', () => {
  it('traduz mensagens conhecidas exatamente', () => {
    expect(translateAuthError('Invalid login credentials')).toBe('Email ou senha incorretos');
    expect(translateAuthError('User already registered')).toBe('Este email já está cadastrado');
    expect(translateAuthError('Auth session missing')).toBe('Sessão expirada. Solicite um novo link de recuperação.');
  });

  it('faz match parcial ignorando maiúsculas/minúsculas', () => {
    expect(translateAuthError('new password should be different from the old password')).toBe(
      'A nova senha deve ser diferente da senha atual.'
    );
  });

  it('retorna a mensagem original quando desconhecida', () => {
    const unknown = 'Alguma mensagem totalmente nova';
    expect(translateAuthError(unknown)).toBe(unknown);
  });

  it('mensagens vazias não quebram', () => {
    expect(translateAuthError('')).toBe('');
  });
});
