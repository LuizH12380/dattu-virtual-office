---
criado: 2026-04-16
atualizado: 2026-04-16
agente: dev-backend
cargo: Desenvolvedor Backend Sênior
tipo: implementacao-backend
status: Aguardando Frontend
---

# Pauta — Reunião de Planejamento: BLOQ-01 Auth httpOnly Cookie

> **Contexto:** Feature bloqueada por rejeição do Tech Lead. Antes de qualquer merge, precisamos resolver 3 ações obrigatórias e 6 bloqueadores técnicos identificados no review.
> **Data sugerida:** 16/04/2026
> **Participantes:** DEV Backend, DEV Frontend, Tech Lead, QA

---

## 1. Status Atual — Resumo Executivo

| Item | Status |
|---|---|
| Branch `feature/auth-httpcookie-bloq01` | 🔴 Bloqueado — aguardando diff real |
| Itens P1 de UX | 🟡 Aplicados (sem evidência documentada) |
| Bloqueadores técnicos identificados | 6 abertos |
| Seção §5 do review (testes) | 🔴 Truncada — incompleta |

**Objetivo da reunião:** Distribuir responsabilidades, definir prazo de resubmissão e garantir que o diff real entre na fila com todos os pré-requisitos atendidos.

---

## 2. Pré-condições Obrigatórias (antes do próximo review)

### 2.1 — Diff real do branch (DEV Frontend)

- **Ação:** Submeter diff completo e atualizado do branch `feature/auth-httpcookie-bloq01`
- **Responsável:** DEV Frontend
- **Prazo:** Antes do fim da reunião (ou no máximo 2h após)
- **Critério de aceite:** PR aberto no repositório `dattu-front-end` com todos os commits da feature

### 2.2 — Evidência dos itens P1 de UX (DEV Frontend)

Cada item abaixo precisa de **screenshot ou trecho de código** documentado no PR:

| Item | O que evidenciar |
|---|---|
| `aria-hidden="true"` no SVG de erro | Trecho do JSX do componente de alerta |
| `aria-live="assertive"` no wrapper do alert | Trecho do JSX + teste de leitor de tela (NVDA/VoiceOver) |
| Toast de sessão expirada | Screenshot do toast renderizado |
| Campos desabilitados durante `isLoggingIn` | Screenshot ou teste de interação |

- **Responsável:** DEV Frontend
- **Prazo:** Antes de entrar na fila de code review (pré-condição de entrada)

### 2.3 — Seção §5 do review concluída (Tech Lead)

- **Ação:** Completar a seção de testes unitários obrigatórios antes de circular o documento
- **Responsável:** Tech Lead
- **Prazo:** Na reunião ou imediatamente após

---

## 3. Bloqueadores Técnicos — Distribuição de Responsabilidades

### 🔴 CRÍTICO 1 — Middleware de autenticação ausente

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Frontend |
| **Arquivo** | `dattu-front-end/middleware.ts` (criar) |
| **Ação** | Implementar middleware com matcher correto, redirect para login preservando `?redirect=`, proteção contra acesso autenticado ao `/login` |
| **Validação** | Tech Lead confirma presença do arquivo no diff |

**Entregável mínimo:**

```typescript
// dattu-front-end/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
const AUTH_COOKIE_NAME = 'dattu_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
  const isAuthenticated = Boolean(
    request.cookies.get(AUTH_COOKIE_NAME)?.value
  );

  if (!isPublicRoute && !isAuthenticated) {
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};
```

> ⚠️ **Ponto de alinhamento obrigatório na reunião:** confirmar com DEV Backend o nome exato do cookie (`dattu_session` ou outro) para garantir que o middleware leia o cookie correto.

---

### 🔴 CRÍTICO 2 — `NEXT_PUBLIC_API_URL` expondo URL interna

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Frontend |
| **Arquivo** | `.env`, `axios.config.ts`, Route Handlers |
| **Ação** | Separar URL interna (server-only) de URL pública (client); mover chamadas de refresh para Route Handler |

**Decisão a tomar na reunião:**

> A URL da API que o cliente chama é a mesma da interna, ou existe um gateway/proxy público?

- **Se existir URL pública diferente:** Usar `NEXT_PUBLIC_API_URL=https://api.dattu.com.br` (URL pública) + `API_URL=https://api-internal.dattu.com.br` (server-only)
- **Se for a mesma URL:** Todas as chamadas de API passam por Route Handlers do Next.js — o cliente nunca chama o backend diretamente

---

### 🔴 CRÍTICO 3 — ThrottlerGuard não confirmado no backend

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Backend |
| **Arquivo** | `dattu-back-end/src/auth/auth.controller.ts` |
| **Ação** | Confirmar (ou implementar) `ThrottlerGuard` no endpoint `POST /auth/login` |

**Verificação imediata (DEV Backend responde na reunião):**

```typescript
// Deve existir no AuthController
@Post('login')
@Throttle({ default: { limit: 5, ttl: 60000 } })
@UseGuards(ThrottlerGuard)
async login(@Body() dto: LoginDto) { ... }
```

Se não existir: **bloqueador de merge até implementação**. Estimar esforço na reunião.

---

### ⚠️ ALTO 1 — Cast inseguro de `ApiError` (DEV Frontend)

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Frontend |
| **Arquivo** | `types/api-error.types.ts` (criar) + `LoginForm.tsx` |
| **Ação** | Implementar type guard `isApiErrorResponse` e substituir cast `as { message?: string }` |

**Entregável:**

```typescript
// src/types/api-error.types.ts
export interface ApiErrorResponse {
  message: string | string[];
  error: string;
  statusCode: number;
}

export function isApiErrorResponse(data: unknown): data is ApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'statusCode' in data &&
    'message' in data
  );
}
```

---

### ⚠️ ALTO 2 — Separação incorreta Server/Client Component (DEV Frontend)

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Frontend |
| **Arquivo** | `app/(auth)/login/page.tsx` + `_components/LoginForm.tsx` |
| **Ação** | `page.tsx` deve ser Server Component puro; formulário em componente separado com `'use client'` |

**Estrutura esperada no diff:**

```
app/(auth)/login/
  page.tsx              ← sem 'use client', exporta metadata
  _components/
    LoginForm.tsx       ← 'use client'
```

---

### ⚠️ ALTO 3 — Swallowed exception no interceptor de refresh (DEV Frontend)

| Campo | Detalhe |
|---|---|
| **Responsável** | DEV Frontend |
| **Arquivo** | `lib/axios-interceptors.ts` |
| **Ação** | Adicionar log estruturado, limpar estado (`queryClient.clear()`), rejeitar a promise após falha no refresh |

**Entregável mínimo:**

```typescript
catch (refreshError) {
  console.error('[Auth] Falha ao renovar sessão:', {
    url: originalRequest.url,
    error: refreshError instanceof Error ? refreshError.message : 'unknown',
  });
  queryClient.clear();
  sessionStorage.setItem('auth_redirect_reason', 'session_expired');
  window.location.href = '/login';
  return Promise.reject(refreshError); // não engolir
}
```

---

## 4. Itens de Média Severidade — Decisões Necessárias

| Item | Decisão na reunião |
|---|---|
| **`SameSite` do cookie** | DEV Backend confirma `SameSite=Strict` configurado no `main.ts`. Se não, implementar antes do merge. |
| **CSP no `next.config.ts`** | DEV Frontend implementa headers mínimos. Definir se `unsafe-inline` é temporário aceitável para este sprint. |
| **FOUC de auth via `useEffect`** | Decidir: aceitar temporariamente (controlado pelo middleware) ou refatorar para `useQuery` neste sprint? |

---

## 5. Testes Unitários — Escopo Mínimo Obrigatório

> Esta seção completa o §5 truncado do review original.

Os seguintes testes são **obrigatórios antes do merge** (severidade Alta):

### 5.1 — `getErrorMessage` (DEV Frontend)

```typescript
// __tests__/get-error-message.spec.ts
describe('getErrorMessage', () => {
  it('retorna mensagem para status 401', () => {
    const error = mockAxiosError(401, { message: 'Credenciais inválidas', statusCode: 401, error: 'Unauthorized' });
    expect(getErrorMessage(error)).toBe('E-mail ou senha incorretos.');
  });

  it('retorna mensagem para status 429', () => {
    const error = mockAxiosError(429, { message: 'Too many requests', statusCode: 429, error: 'Too Many Requests' });
    expect(getErrorMessage(error)).toBe('Muitas tentativas. Aguarde alguns minutos.');
  });

  it('retorna fallback para erro sem response', () => {
    const error = new Error('Network Error');
    expect(getErrorMessage(error)).toBe('Erro de conexão. Verifique sua internet.');
  });

  it('retorna fallback genérico para status desconhecido', () => {
    const error = mockAxiosError(500, { message: 'Internal Server Error', statusCode: 500, error: 'Internal Server Error' });
    expect(getErrorMessage(error)).toBe('Erro inesperado. Tente novamente.');
  });
});
```

### 5.2 — `isApiErrorResponse` (type guard)

```typescript
describe('isApiErrorResponse', () => {
  it('retorna true para shape válido', () => {
    expect(isApiErrorResponse({ message: 'err', error: 'Bad Request', statusCode: 400 })).toBe(true);
  });

  it('retorna false para null', () => {
    expect(isApiErrorResponse(null)).toBe(false);
  });

  it('retorna false para shape parcial', () => {
    expect(isApiErrorResponse({ message: 'err' })).toBe(false);
  });
});
```

### 5.3 — Interceptor de refresh (DEV Frontend)

- Cenário: refresh bem-sucedido → request original é retentado
- Cenário: refresh falha → `queryClient.clear()` é chamado + redirect para `/login`
- Cenário: response sem status 401 → interceptor não interfere

### 5.4 — `ThrottlerGuard` no backend (DEV Backend)

```typescript
// src/auth/auth.controller.spec.ts
it('deve retornar 429 após 5 tentativas em 60s', async () => {
  for (let i = 0; i < 5; i++) {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'test@dattu.com', password: 'wrong' });
  }
  const response = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ email: 'test@dattu.com', password: 'wrong' });

  expect(response.status).toBe(429);
});
```

---

## 6. Cronograma Proposto

| Prazo | Entregável | Responsável |
|---|---|---|
| **Hoje — fim do dia** | Diff real do PR aberto + evidências UX P1 documentadas | DEV Frontend |
| **Hoje — fim do dia** | Confirmação (ou implementação) do `ThrottlerGuard` | DEV Backend |
| **Amanhã — manhã** | Todos os 6 bloqueadores corrigidos no branch | DEV Frontend + DEV Backend |
| **Amanhã — tarde** | §5 do review concluído + novo review iniciado | Tech Lead |
| **Máximo D+3** | Merge autorizado (se review passar) | Tech Lead |

---

## 7. Ordem do Dia (Sugestão de Agenda — 45min)

| Tempo | Tópico | Condutor |
|---|---|---|
| 5min | Status atual e objetivo da reunião | Tech Lead |
| 5min | Confirmação: nome do cookie de sessão no backend | DEV Backend |
| 5min | Confirmação: `ThrottlerGuard` existe ou precisa ser implementado? | DEV Backend |
| 5min | Decisão: URL pública vs. URL interna — arquitetura de proxy | DEV Frontend + DEV Backend |
| 5min | Decisão: FOUC de auth — aceitar temporariamente ou refatorar agora? | Tech Lead |
| 5min | Decisão: `unsafe-inline` no CSP — temporário aceitável? | Tech Lead |
| 10min | Distribuição final das tarefas + confirmação de prazos | Todos |
| 5min | Critério de aceite do próximo review — o que muda? | Tech Lead |

---

## 8. Critério de Aceite para o Próximo Review

O PR só entra na fila de review quando **todos** os itens abaixo estiverem marcados:

- [ ] Diff real submetido no PR
- [ ] Evidências dos 4 itens P1 de UX documentadas no PR
- [ ] `middleware.ts` presente no diff
- [ ] `NEXT_PUBLIC_API_URL` não expõe URL interna
- [ ] `ThrottlerGuard` confirmado e testado no backend
- [ ] `isApiErrorResponse` type guard implementado (sem `as any`)
- [ ] `page.tsx` é Server Component — `LoginForm.tsx` é Client Component
- [ ] Interceptor de refresh não engole exception
- [ ] Testes de §5 passando no CI
- [ ] §5 do review preenchido e publicado

---

> **Dependência de outro agente:** Nenhuma. Esta pauta é autocontida e pode ser distribuída imediatamente para o time. Após a reunião, o DEV Frontend retoma com as correções e o