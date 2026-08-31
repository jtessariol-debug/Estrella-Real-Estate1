import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (value: unknown) => void;
};

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

export function allowMethods(request: IncomingMessage, response: ServerResponse, methods: string[]): boolean {
  response.setHeader('Allow', methods.join(', '));
  if (request.method && methods.includes(request.method)) return true;
  sendJson(response, 405, { error: 'Método no permitido.' });
  return false;
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable server-only ${name}.`);
  return value;
}

export async function readRawBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJsonBody<T>(request: ApiRequest): Promise<T> {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body as T;
  const raw = typeof request.body === 'string' ? request.body : await readRawBody(request);
  if (!raw) throw new Error('El cuerpo de la solicitud está vacío.');
  return JSON.parse(raw) as T;
}

export function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

export function queryValue(request: ApiRequest, key: string): string | undefined {
  const value = request.query?.[key];
  if (Array.isArray(value)) return value[0];
  if (value) return value;
  const url = new URL(request.url ?? '/', 'http://localhost');
  return url.searchParams.get(key) ?? undefined;
}

export function safeErrorMessage(reason: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== 'production' && reason instanceof Error) return reason.message;
  return fallback;
}
