import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { ChatService } from "../gen/proto/chat_pb";

const transport = createGrpcWebTransport({
  baseUrl: "http://localhost:9000",
});

export const chatClient = createClient(ChatService, transport);
