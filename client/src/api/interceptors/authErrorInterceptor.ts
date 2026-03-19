import type { Interceptor } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";

const TOKEN_KEY = "access_token";

export const authErrorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "/";
    }
    throw err;
  }
};
