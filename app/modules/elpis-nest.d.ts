declare module 'express' {
  export interface Request {
    headers: Record<string, string | string[] | undefined>;
    path: string;
    originalUrl?: string;
    url: string;
    projKey?: string;
    userId?: string;
  }

  export interface Response {
    cookie(name: string, val: string, options?: Record<string, unknown>): this;
    redirect(status: number, url: string): this;
    redirect(url: string): this;
  }
}

declare module 'jsonwebtoken' {
  export function sign(
    payload: object,
    secret: string,
    options?: { expiresIn?: number },
  ): string;

  export function verify(token: string, secret: string): object;
}
