import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { ChatService } from "../gen/proto/chat_pb";
import { authErrorInterceptor } from "./interceptors/authErrorInterceptor";
import { authInterceptor } from "./interceptors/authInterceptor";
import { loggingInterceptor } from "./interceptors/loggingInterceptor";

const transport = createGrpcWebTransport({
  baseUrl: "http://localhost:1000",
  interceptors: [loggingInterceptor, authInterceptor, authErrorInterceptor],
});

export const chatClient = createClient(ChatService, transport);
