import type { Interceptor } from "@connectrpc/connect";

export const loggingInterceptor: Interceptor = (next) => async (req) => {
  const start = performance.now();
  const method = req.method.name;

  console.log(`[gRPC] → ${method}`, req.url);

  try {
    const response = await next(req);
    const ms = Math.round(performance.now() - start);
    if (!response.stream) {
      console.log(`[gRPC] ✅ ${method} (${ms}ms)`, response.message);
    } else {
      console.log(`[gRPC] ✅ ${method} stream started (${ms}ms)`);
    }
    return response;
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    console.error(`[gRPC] ❌ ${method} (${ms}ms)`, err);
    throw err;
  }
};
