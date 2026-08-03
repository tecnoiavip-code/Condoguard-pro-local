const errorMap: Record<string, string> = {
  'Invalid login credentials': 'Email ou senha incorretos',
  'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada.',
  'User already registered': 'Este email já está cadastrado',
  'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
  'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  'For security purposes, you can only request this after': 'Por segurança, aguarde alguns segundos antes de tentar novamente.',
  'Unable to validate email address: invalid format': 'Formato de email inválido.',
  'New password should be different from the old password': 'A nova senha deve ser diferente da senha atual.',
  'Auth session missing': 'Sessão expirada. Solicite um novo link de recuperação.',
  'Token has expired or is invalid': 'Link expirado ou inválido. Solicite um novo link.',
  'User not found': 'Usuário não encontrado.',
  'Signup is disabled': 'O cadastro está desativado no momento.',
};

export function translateAuthError(message: string): string {
  // Direct match
  if (errorMap[message]) return errorMap[message];

  // Partial match
  for (const [key, value] of Object.entries(errorMap)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }

  return message;
}
