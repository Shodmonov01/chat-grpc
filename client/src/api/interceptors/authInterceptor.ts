import type { Interceptor } from "@connectrpc/connect";

const TOKEN_KEY = "access_token";

export const authInterceptor: Interceptor = (next) => async (req) => {
  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    req.header.set("Authorization", `Bearer ${token}`);
  }

  return await next(req);
};
