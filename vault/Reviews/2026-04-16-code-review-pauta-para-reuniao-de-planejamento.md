---
criado: 2026-04-16
atualizado: 2026-04-16
agente: tech-lead
cargo: Tech Lead
tipo: code-review
status: Revisado
---

# Code Review — BLOQ-01: Auth httpOnly Cookie

**Revisor:** Tech Lead — Dattu
**Data:** 16/04/2026
**Branch:** `feature/auth-httpcookie-bloq01`
**Status de entrada:** UX rejeitou → itens P1 pendentes

---

## ⚠️ Situação do Review

O output que chegou até mim está **incompleto** — `LoginForm.tsx` cortado, `SessionExpiredToast.tsx` não entregue. Vou fazer o que posso com o código disponível **e documentar o que precisa ser entregue para review completo**. Nenhuma aprovação será emitida até que o código completo chegue.

O que faço agora: revisar o que foi entregue + emitir **um checklist vinculante** para o PR final.

---

## 1. Análise do Código Disponível

### 1.1 Schema Yup — `loginSchema` (frontend)

```
❌ BLOQUEADOR — P1.3 do UX ainda não confirmado como corrigido
```

O UX já apontou. Reforço com a justificativa técnica:

```typescript
// ❌ ERRADO — não entregar isso em produção
password: yup.string().required('Senha obrigatória').min(8, '...')

// ✅ CORRETO — login valida credenciais, não força de senha
password: yup.string().required('Senha obrigatória')
```

**Razão arquitetural:** validação de complexidade de senha pertence ao fluxo de **cadastro/alteração**, não de autenticação. No login, o único contrato é `string não-vazia → POST /auth/login → backend decide`. Um `min(8)` aqui bloqueia usuários legítimos com senhas de 6 ou 7 caracteres criadas antes de eventual política de segurança.

---

### 1.2 `useLogin` Hook — Proteção de Open Redirect

```typescript
// O que foi entregue (inferido do output UX)
const safePath = redirectTo.startsWith('/') ? redirectTo : '/dashboard';
router.push(safePath);
```

```
✅ APROVADO com ressalva
```

A lógica está correta para o caso básico, mas **insuficiente**. Um path como `//evil.com` ou `/\evil.com` passa nessa validação e pode ser interpretado como URL absoluta em alguns navegadores.

```typescript
// ✅ Versão robusta obrigatória no PR
function getSafeRedirectPath(redirectTo: string | null): string {
  const DEFAULT = '/dashboard';
  if (!redirectTo) return DEFAULT;

  try {
    // Força parse como URL relativa ao origin atual
    const url = new URL(redirectTo, window.location.origin);
    // Só permite se o origin for o mesmo (bloqueia //evil.com)
    if (url.origin !== window.location.origin) return DEFAULT;
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT;
  }
}
```

**Arquivo:** `hooks/useLogin.ts`
**Severidade:** 🔴 Segurança (OWASP A01 — Open Redirect)

---

### 1.3 Mensagens de Erro por Status HTTP

```typescript
// Inferido do output UX — review do padrão
switch (error.status) {
  case 401: return 'Credenciais inválidas'
  case 429: return 'Muitas tentativas...'
  case 500: return 'Erro interno...'
}
```

```
⚠️ ATENÇÃO — não é bloqueador, mas precisa chegar no PR
```

**Dois problemas:**

**a) Enumeração de usuário** — se o backend retorna 404 para "usuário não existe" e 401 para "senha errada", e o frontend expõe mensagens diferentes, estamos vazando informação. O backend **deve** retornar sempre 401 para ambos os casos. Preciso ver a implementação NestJS para confirmar isso.

**b) Mensagem do 429 deve incluir tempo de espera:**

```typescript
case 429: {
  const retryAfter = error.headers?.get('Retry-After');
  const seconds = retryAfter ? parseInt(retryAfter) : null;
  return seconds
    ? `Muitas tentativas. Aguarde ${seconds} segundos.`
    : 'Muitas tentativas. Tente novamente em breve.';
}
```

---

### 1.4 Middleware — Proteção de Rotas

O UX mencionou que `/forgot-password` existe no middleware. Preciso ver o arquivo completo, mas levanto os pontos críticos que **obrigatoriamente** devem estar presentes:

```typescript
// Checklist obrigatório para o middleware.ts

// ✅ 1. Matcher não deve incluir assets estáticos
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
};

// ✅ 2. Rotas públicas devem ser allowlist explícita (não denylist)
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
// ❌ NUNCA: bloquear tudo exceto lista negra

// ✅ 3. Verificação do cookie httpOnly no servidor
// O cookie não é acessível via JS — a verificação DEVE ser server-side
// usando cookies() do next/headers ou via middleware com request.cookies

// ⚠️ 4. Se usar JWT no cookie: verificar expiração no middleware
// Não apenas presença do cookie — um token expirado deve redirecionar
```

Sem o arquivo, não consigo dar status definitivo. **Bloqueia o PR.**

---

### 1.5 Componentes Next.js 15 — Server vs Client

```
⚠️ PONTO CRÍTICO — precisa ser verificado no PR
```

Em Next.js 15, a regra é clara:

| Componente | Diretiva | Motivo |
|---|---|---|
| `LoginForm.tsx` | `'use client'` obrigatório | Usa `useState`, `useForm`, `useRouter` |
| `SessionExpiredToast.tsx` | `'use client'` obrigatório | Usa `useState`, `useEffect`, `sessionStorage` |
| `LoginPage` (page.tsx) | Server Component | Apenas composição; sem hooks |

**O que verificar no PR:**

```typescript
// ✅ page.tsx — Server Component (sem diretiva)
// app/login/page.tsx
import { LoginForm } from '@/components/auth/LoginForm';
import { SessionExpiredToast } from '@/components/auth/SessionExpiredToast';

export default function LoginPage() {
  return (
    <main>
      <SessionExpiredToast />
      <LoginForm />
    </main>
  );
}

// ✅ LoginForm.tsx — Client Component
'use client';
// ... resto do componente
```

**Risco:** `sessionStorage` sendo acessado em Server Component causa crash em runtime. Se `SessionExpiredToast` não tiver `'use client'`, vai quebrar.

---

## 2. Checklist de Code Review Completo

### 2.1 Frontend (`dattu-front-end`)

```
[ ] SEGURANÇA
    [?] Open redirect corrigido com URL parser (seção 1.2)
    [?] Nenhuma variável de ambiente sensível exposta no client bundle
        → verificar: NEXT_PUBLIC_ prefix apenas em vars não-sensíveis
    [?] sessionStorage não armazena tokens — apenas flags de UX
    [?] Sem console.log de dados de autenticação

[ ] TYPESCRIPT
    [?] Sem uso de `any` no hook useLogin e LoginForm
    [?] Tipo do erro da API definido explicitamente
        → NÃO: catch (e: any)
        → SIM: catch (e: unknown) + type guard

[ ] NEXT.JS 15
    [?] 'use client' em TODOS os componentes com hooks (seção 1.5)
    [?] LoginPage é Server Component (sem hooks diretos)
    [?] Sem uso de useRouter do 'next/router' — deve ser 'next/navigation'

[ ] VALIDAÇÃO
    [?] min(8) REMOVIDO do schema de login (seção 1.1)
    [?] Email com validação yup.string().email() — aceitável no login
    [?] Schema separado: loginSchema ≠ registerSchema

[ ] UX/ACESSIBILIDADE (delegado ao UX, mas valido tecnicamente)
    [?] aria-busy no botão durante loading
    [?] Toggle de senha com type alternando corretamente
    [?] SessionExpiredToast com role="status" (não "alert")

[ ] TESTES
    [?] Teste unitário do getSafeRedirectPath() — cobre casos:
        → null, '', '/dashboard', 'http://evil.com', '//evil.com', '/path?q=1'
    [?] Teste do loginSchema — cobre senha vazia, email inválido
    [?] Mock do cookie no middleware test
```

### 2.2 Backend (`dattu-back-end`) — NestJS

```
[ ] AUTENTICAÇÃO
    [?] Endpoint POST /auth/login retorna 401 para
        AMBOS os casos: usuário não existe E senha errada
        → sem enumeração de usuário (seção 1.3a)
    [?] Cookie configurado com:
        httpOnly: true
        secure: true (produção)
        sameSite: 'strict' ou 'lax'
        maxAge definido (não session cookie)
    [?] Refresh token implementado OU expiração do cookie documentada

[ ] RATE LIMITING
    [?] @Throttle no endpoint de login (não global)
    [?] Header Retry-After retornado no 429
    [?] Rate limit por IP E por email (evitar targeted attack)

[ ] VALIDAÇÃO (class-validator)
    [?] LoginDto com @IsEmail() e @IsNotEmpty()
    [?] @IsString() com @MaxLength() para evitar DoS por payload gigante
    [?] ValidationPipe com whitelist: true, forbidNonWhitelisted: true

[ ] SEGURANÇA
    [?] Bcrypt com salt rounds >= 12
    [?] Sem log da senha em nenhum nível
    [?] Helmet configurado (X-Frame-Options, CSP, etc.)

[ ] TESTES
    [?] Teste e2e do fluxo de login completo
    [?] Teste unitário do AuthService.validateUser()
    [?] Teste do rate limit (verifica 429 após N tentativas)
```

---

## 3. Decisão

```
┌──────────────────────────────────────────────────────────────────┐
│  STATUS: 🔴 BLOQUEADO — NÃO APROVADO                             │
│  Motivo: Código incompleto + 3 bloqueadores técnicos identificados│
└──────────────────────────────────────────────────────────────────┘
```

### Bloqueadores técnicos para aprovação do PR

| ID | Arquivo | Problema | Ação |
|----|---------|----------|------|
| **CR-01** | `loginSchema.ts` | `min(8)` no campo senha do login | Remover — manter apenas `required()` |
| **CR-02** | `hooks/useLogin.ts` | Open redirect insuficiente | Substituir por `URL parser` (seção 1.2) |
| **CR-03** | `middleware.ts` | Não entregue para review | Entregar arquivo completo |
| **CR-04** | `SessionExpiredToast.tsx` | Não entregue para review | Entregar arquivo completo |
| **CR-05** | `LoginForm.tsx` | Output cortado — botão submit não revisado | Entregar componente completo |
| **CR-06** | `auth.controller.ts` | Não confirmado: 401 uniforme para user-not-found E wrong-password | Confirmar ou corrigir no NestJS |

### O que está bem encaminhado (não bloqueia, mas registra)

- ✅ Uso de `httpOnly cookie` é a abordagem correta — elimina XSS token theft
- ✅ `aria-live="assertive"` e `aria-describedby` estão corretos
- ✅ Separação de `useLogin` hook do componente — boa separação de responsabilidades
- ✅ `noValidate` + RHF é o padrão correto para forms controlados

---

## 4. ADR — Decisão de Arquitetura Registrada

### ADR-004: Validação de schema no frontend — login vs registro

**Data:** 16/04/2026
**Status:** Aceito

**Contexto:** Schema Yup unificado sendo usado para login e registro.

**Decisão:** Schemas **separados e explícitos**:
- `loginSchema` — valida apenas formato (email válido, senha não-vazia)
- `registerSchema` — valida regras de negócio (senha forte, confirmação, etc.)

**Consequência:** Nenhuma regra de negócio de senha vaza para o fluxo de autenticação. Usuários com senhas legadas nunca são bloqueados no frontend.

---

## 5. Próximos Passos

```
Dev → corrige CR-01 a CR-06
    → entrega PR completo (sem output cortado)
    → passa pelo UX Designer para validação P1 restantes
    → retorna aqui para Code Review final
```

---

**Dependência de outro agente:** ✅ Sim
O PR deve retornar ao **UX Designer** para validação dos itens P1 corrigidos (toggle de senha, estado de loading do botão) antes de retornar ao Tech Lead para aprovação final. Após aprovação técnica, segue para o **DevOps** para publicação.