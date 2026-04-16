---
criado: 2026-04-16
atualizado: 2026-04-16
agente: dev-frontend
cargo: Desenvolvedor Frontend Sênior
tipo: implementacao-frontend
status: Aguardando Review UX
---

# Implementação BLOQ-01 — Auth httpOnly Cookie

> **Contexto:** Reunião de planejamento concluída. Executando as correções dos 6 bloqueadores técnicos identificados no review.
> **Branch:** `feature/auth-httpcookie-bloq01`
> **Data:** 16/04/2026

---

## Estrutura de Componentes

```
src/
├── app/
│   └── (auth)/
│       └── login/
│           ├── page.tsx                    ← Server Component (metadata + layout)
│           └── _components/
│               └── LoginForm.tsx           ← Client Component ('use client')
├── api/
│   └── auth/
│       └── service.ts                      ← Axios calls
├── hooks/
│   └── auth/
│       └── useLogin.ts                     ← TanStack Query mutation
├── lib/
│   └── axios-interceptors.ts               ← Refresh + error handling
├── types/
│   └── api-error.types.ts                  ← Type guards
├── middleware.ts                           ← Route protection
└── __tests__/
    ├── get-error-message.spec.ts
    ├── is-api-error-response.spec.ts
    └── axios-interceptors.spec.ts
```

---

## 1. Middleware de Autenticação

**Justificativa Server:** O middleware roda no Edge Runtime — zero JS no cliente, proteção de rota antes do render.

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
// ⚠️ Nome confirmado com DEV Backend na reunião
const AUTH_COOKIE_NAME = 'dattu_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthenticated = Boolean(
    request.cookies.get(AUTH_COOKIE_NAME)?.value
  );

  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
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

---

## 2. Types + Type Guards

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
    typeof (data as Record<string, unknown>).statusCode === 'number' &&
    'message' in data &&
    'error' in data
  );
}

export function normalizeErrorMessage(
  message: string | string[]
): string {
  return Array.isArray(message) ? message[0] : message;
}
```

---

## 3. API Service

```typescript
// src/api/auth/service.ts
import { apiClient } from '@/lib/axios-client';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  // Cookie httpOnly é setado pelo backend — não há token no body
}

export interface LogoutResponse {
  message: string;
}

export const authService = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>(
      '/auth/login',
      credentials,
      { withCredentials: true }
    );
    return data;
  },

  logout: async (): Promise<LogoutResponse> => {
    const { data } = await apiClient.post<LogoutResponse>(
      '/auth/logout',
      {},
      { withCredentials: true }
    );
    return data;
  },

  refresh: async (): Promise<void> => {
    await apiClient.post(
      '/auth/refresh',
      {},
      { withCredentials: true }
    );
  },
} as const;
```

---

## 4. Axios Client + Interceptors

```typescript
// src/lib/axios-client.ts
import axios from 'axios';

// URL interna — nunca exposta ao cliente (sem NEXT_PUBLIC_)
const SERVER_API_URL = process.env.API_URL ?? 'http://api-internal:3001';

// URL pública — usada pelo cliente via Route Handler
const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/proxy';

const isServer = typeof window === 'undefined';

export const apiClient = axios.create({
  baseURL: isServer ? SERVER_API_URL : CLIENT_API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});
```

```typescript
// src/lib/axios-interceptors.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { authService } from '@/api/auth/service';

interface RetryableConfig {
  _retry?: boolean;
}

export function setupAuthInterceptors(
  client: AxiosInstance,
  queryClient: QueryClient
): void {
  let isRefreshing = false;
  let failedQueue: Array<{
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];

  const processQueue = (error: unknown): void => {
    failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(null);
      }
    });
    failedQueue = [];
  };

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError & RetryableConfig) => {
      const originalRequest = error.config as typeof error.config & RetryableConfig;

      if (error.response?.status !== 401 || originalRequest._retry) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => client(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await authService.refresh();
        processQueue(null);
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);

        // Log estruturado — sem engolir a exception
        console.error('[Auth] Falha ao renovar sessão:', {
          url: originalRequest?.url,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : 'unknown',
          timestamp: new Date().toISOString(),
        });

        // Limpa cache React Query
        queryClient.clear();

        // Sinaliza motivo do redirect para o toast na página de login
        sessionStorage.setItem('auth_redirect_reason', 'session_expired');

        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
  );
}
```

---

## 5. Hook `useLogin`

```typescript
// src/hooks/auth/useLogin.ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService, LoginCredentials } from '@/api/auth/service';
import { isApiErrorResponse, normalizeErrorMessage } from '@/types/api-error.types';
import { isAxiosError } from 'axios';

export interface UseLoginReturn {
  login: (credentials: LoginCredentials) => void;
  isLoggingIn: boolean;
  error: string | null;
  reset: () => void;
}

function getErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return 'Erro de conexão. Verifique sua internet.';
  }

  const status = error.response?.status;
  const data = error.response?.data;

  if (status === 401) return 'E-mail ou senha incorretos.';
  if (status === 429) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (status === 422 && isApiErrorResponse(data)) {
    return normalizeErrorMessage(data.message);
  }
  if (status && status >= 500) return 'Serviço indisponível. Tente novamente.';

  return 'Erro inesperado. Tente novamente.';
}

export function useLogin(): UseLoginReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mutation = useMutation({
    mutationFn: authService.login,
    onSuccess: () => {
      const redirect = searchParams.get('redirect') ?? '/dashboard';
      // Valida que o redirect não é externo (open redirect protection)
      const safePath = redirect.startsWith('/') ? redirect : '/dashboard';
      router.replace(safePath);
    },
  });

  return {
    login: mutation.mutate,
    isLoggingIn: mutation.isPending,
    error: mutation.isError ? getErrorMessage(mutation.error) : null,
    reset: mutation.reset,
  };
}

export { getErrorMessage };
```

---

## 6. Page — Server Component

```typescript
// src/app/(auth)/login/page.tsx
import type { Metadata } from 'next';
import { LoginForm } from './_components/LoginForm';

export const metadata: Metadata = {
  title: 'Entrar — Dattu',
  description: 'Acesse sua conta Dattu CRM',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="Dattu CRM"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
            <h1 className="text-2xl font-bold text-base-content">
              Entrar na sua conta
            </h1>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
```

---

## 7. LoginForm — Client Component

```typescript
// src/app/(auth)/login/_components/LoginForm.tsx
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useLogin } from '@/hooks/auth/useLogin';
import { SessionExpiredToast } from './SessionExpiredToast';

interface LoginFormValues {
  email: string;
  password: string;
}

const schema = yup.object({
  email: yup
    .string()
    .email('E-mail inválido')
    .required('E-mail é obrigatório'),
  password: yup
    .string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .required('Senha é obrigatória'),
});

export function LoginForm() {
  const { login, isLoggingIn, error, reset } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: yupResolver(schema),
    mode: 'onBlur',
  });

  const onSubmit = (values: LoginFormValues) => {
    reset(); // limpa erro anterior
    login(values);
  };

  return (
    <>
      <SessionExpiredToast />

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        aria-label="Formulário de login"
        className="flex flex-col gap-4"
      >
        {/* Alerta de erro da API */}
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="alert alert-error"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"          // ← P1 UX: ícone decorativo
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Campo E-mail */}
        <div className="form-control">
          <label htmlFor="email" className="label">
            <span className="label-text font-medium">E-mail</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            disabled={isLoggingIn}           // ← P1 UX: desabilitado durante submit
            placeholder="voce@empresa.com"
            aria-describedby={
              errors.email ? 'email-error' : undefined
            }
            aria-invalid={Boolean(errors.email)}
            className={`input input-bordered w-full ${
              errors.email ? 'input-error' : ''
            }`}
            {...register('email')}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="text-error text-sm mt-1"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Campo Senha */}
        <div className="form-control">
          <label htmlFor="password" className="label">
            <span className="label-text font-medium">Senha</span>
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            disabled={isLoggingIn}           // ← P1 UX: desabilitado durante submit
            placeholder="••••••••"
            aria-describedby={
              errors.password ? 'password-error' : undefined
            }
            aria-invalid={Boolean(errors