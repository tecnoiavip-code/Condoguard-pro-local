# 🤖 Regras de Desenvolvimento - PortalGuard Pro

Este documento serve como guia para a IA e desenvolvedores manterem a consistência técnica do projeto.

## 🛠️ Tech Stack

- **Frontend**: React 18 com Vite e TypeScript.
- **Estilização**: Tailwind CSS para layouts responsivos e utilitários.
- **Componentes de UI**: shadcn/ui (baseado em Radix UI) para componentes acessíveis e consistentes.
- **Backend & Auth**: Supabase (PostgreSQL, GoTrue Auth, Storage e Edge Functions).
- **Gerenciamento de Estado**: React Hooks nativos e TanStack Query (React Query) para cache de dados.
- **Formulários**: React Hook Form integrado com Zod para validação de esquemas.
- **Roteamento**: React Router DOM v6.
- **Ícones**: Lucide React.
- **PWA**: Vite PWA Plugin para suporte offline e instalação mobile.

## 📏 Regras de Uso de Bibliotecas

### 1. Interface e Componentes
- **shadcn/ui**: Sempre utilize os componentes da pasta `@/components/ui`. Não crie componentes básicos (botões, inputs, cards) do zero se eles já existirem no shadcn.
- **Tailwind CSS**: Use classes utilitárias para todo o espaçamento, cores e responsividade. Evite CSS puro ou Styled Components.
- **Lucide React**: Biblioteca padrão para ícones. Mantenha o padrão de `size={20}` ou `h-5 w-5` na maioria dos casos.

### 2. Comunicação com Backend
- **Supabase Client**: Utilize o cliente centralizado em `@/integrations/supabase/client`.
- **Hooks de Dados**: Prefira utilizar ou criar hooks customizados em `src/hooks/` (ex: `useResidents`, `useMails`) para isolar a lógica de busca de dados dos componentes de visualização.
- **Edge Functions**: Lógicas complexas, envios de e-mail (Resend) ou integrações de hardware (Control iD) devem ser processadas via Supabase Edge Functions.

### 3. Validação e Tipagem
- **TypeScript**: Tipagem estrita é obrigatória. Defina interfaces em `src/types/index.ts` para entidades globais.
- **Zod**: Utilize esquemas Zod para validar entradas de formulários e payloads de API.

### 4. Feedback e Notificações
- **Sonner**: Use `toast.success()`, `toast.error()` ou `toast.info()` para feedbacks imediatos de ações do usuário.
- **Notificações Push**: Utilize as funções em `@/lib/push-subscription` para enviar alertas reais para os dispositivos dos moradores.

### 5. Manipulação de Datas
- **date-fns**: Utilize sempre `date-fns` com o locale `ptBR` para formatação e cálculos de datas, garantindo consistência no padrão brasileiro (dd/MM/yyyy).

### 6. Utilitários
- **cn()**: Sempre utilize a função utilitária `@/lib/utils` para mesclar classes do Tailwind condicionalmente.

---
*Nota: Este projeto prioriza a simplicidade e a performance offline (PWA). Mantenha o código limpo e modular.*