import React from "react";
import { create } from "@bufbuild/protobuf";
import { chatClient } from "./api/chatClient";
import {
  ChatMessageSchema,
  SubscribeRequestSchema,
  type ChatMessage,
} from "./gen/proto/chat_pb";

interface MessageItem {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isJoin?: boolean;
  isLeave?: boolean;
}

export const App: React.FC = () => {
  const [username, setUsername] = React.useState("");
  const [room, setRoom] = React.useState("general");
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [inputText, setInputText] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const userIdRef = React.useRef<string>("");

  const addMessage = React.useCallback((msg: ChatMessage) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${msg.userId}-${Number(msg.timestamp)}-${Math.random()}`,
        username: msg.username,
        text: msg.text,
        timestamp: Number(msg.timestamp),
        isJoin: msg.join,
        isLeave: msg.leave,
      },
    ]);
  }, []);

  const connect = React.useCallback(async () => {
    if (!username.trim()) return;
    setError(null);
    const abort = new AbortController();
    abortRef.current = abort;
    userIdRef.current = crypto.randomUUID();

    const req = create(SubscribeRequestSchema, {
      userId: userIdRef.current,
      username: username.trim(),
      room,
    });

    try {
      const stream = chatClient.subscribe(req, { signal: abort.signal });
      setConnected(true);
      for await (const msg of stream) {
        addMessage(msg);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
      }
    } finally {
      setConnected(false);
      abortRef.current = null;
    }
  }, [username, room, addMessage]);

  const disconnect = React.useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const sendMessage = React.useCallback(async () => {
    if (!inputText.trim()) return;
    try {
      await chatClient.sendMessage(
        create(ChatMessageSchema, {
          userId: userIdRef.current,
          username: username.trim(),
          text: inputText.trim(),
          timestamp: BigInt(Date.now()),
          room,
          join: false,
          leave: false,
        })
      );
      setInputText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [username, room, inputText]);

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Чат</h1>
      {!connected ? (
        <div>
          <input
            placeholder="Имя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ display: "block", marginBottom: 8, padding: 8, width: "100%" }}
          />
          <input
            placeholder="Комната"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            style={{ display: "block", marginBottom: 8, padding: 8, width: "100%" }}
          />
          <button onClick={connect} disabled={!username.trim()}>
            Войти
          </button>
        </div>
      ) : (
        <div>
          <button onClick={disconnect} style={{ marginBottom: 16 }}>
            Выйти
          </button>
        </div>
      )}
      {error && <p style={{ color: "#f44" }}>{error}</p>}
      <div
        style={{
          border: "1px solid #444",
          borderRadius: 8,
          minHeight: 200,
          maxHeight: 300,
          overflowY: "auto",
          padding: 12,
          marginBottom: 12,
        }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 8 }}>
            {m.isJoin && (
              <span style={{ color: "#6a6" }}>• {m.username} вошёл</span>
            )}
            {m.isLeave && (
              <span style={{ color: "#a66" }}>• {m.username} вышел</span>
            )}
            {!m.isJoin && !m.isLeave && m.text && (
              <div>
                <strong>{m.username}:</strong> {m.text}
              </div>
            )}
          </div>
        ))}
      </div>
      {connected && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Сообщение..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={sendMessage}>Отправить</button>
        </div>
      )}
    </div>
  );
};
