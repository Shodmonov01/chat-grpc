import React from "react";
import { create } from "@bufbuild/protobuf";
import { chatClient } from "./api/chatClient";
import {
  ChatMessageSchema,
  FileChunkSchema,
  FileInfoSchema,
  SubscribeRequestSchema,
} from "./gen/proto/chat_pb";
import type { ChatMessage } from "./gen/proto/chat_pb";
import type { MessageItem } from "./types/chat";
import { CHUNK_SIZE, MAX_FILE_SIZE, getMimeType } from "./constants/file";
import {
  ChatHeader,
  ChatInput,
  LoginForm,
  MessageList,
} from "./components";
import "./App.css";

export const App: React.FC = () => {
  const [username, setUsername] = React.useState("");
  const [room, setRoom] = React.useState("general");
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [inputText, setInputText] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  const abortRef = React.useRef<AbortController | null>(null);
  const userIdRef = React.useRef<string>("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        file: msg.file,
      },
    ]);
  }, []);

  const connect = React.useCallback(async () => {
    if (!username.trim()) return;
    setError(null);
    const abort = new AbortController();
    abortRef.current = abort;
    userIdRef.current = crypto.randomUUID();

    try {
      const stream = chatClient.subscribe(
        create(SubscribeRequestSchema, {
          userId: userIdRef.current,
          username: username.trim(),
          room,
        }),
        { signal: abort.signal }
      );
      setConnected(true);
      for await (const msg of stream) addMessage(msg);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setConnected(false);
      abortRef.current = null;
    }
  }, [username, room, addMessage]);

  const disconnect = React.useCallback(() => abortRef.current?.abort(), []);

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
        })
      );
      setInputText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [username, room, inputText]);

  const uploadFile = React.useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        setError("Файл слишком большой. Максимум: 50 МБ");
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const uploadId = crypto.randomUUID();
        const totalChunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE) + 1);
        let sent = 0;

        await chatClient.uploadChunk(
          create(FileChunkSchema, {
            uploadId,
            chunkSeq: 0,
            isLast: false,
            data: new Uint8Array(0),
            info: create(FileInfoSchema, {
              fileId: "",
              filename: file.name,
              mimeType: getMimeType(file.name),
              size: 0n,
              room,
              userId: userIdRef.current,
              username: username.trim(),
              timestamp: BigInt(Date.now()),
            }),
          })
        );
        sent++;
        setUploadProgress(Math.round((sent / totalChunks) * 100));

        let seq = 1;
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          const slice = data.slice(offset, offset + CHUNK_SIZE);
          const isLast = offset + CHUNK_SIZE >= data.length;
          await chatClient.uploadChunk(
            create(FileChunkSchema, {
              uploadId,
              chunkSeq: seq++,
              isLast,
              data: slice,
            })
          );
          sent++;
          setUploadProgress(Math.round((sent / totalChunks) * 100));
        }

        if (data.length === 0) {
          await chatClient.uploadChunk(
            create(FileChunkSchema, {
              uploadId,
              chunkSeq: 1,
              isLast: true,
              data: new Uint8Array(0),
            })
          );
        }
      } catch (e) {
        setError(`Ошибка загрузки: ${(e as Error).message}`);
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [username, room]
  );

  return (
    <div className="chat">
      <div className="chat__card">
        <h1 className="chat__title">💬 Чат</h1>

        {!connected ? (
          <LoginForm
            username={username}
            room={room}
            onUsernameChange={setUsername}
            onRoomChange={setRoom}
            onConnect={connect}
          />
        ) : (
          <ChatHeader room={room} onLeave={disconnect} />
        )}

        {error && <p className="chat__error">{error}</p>}

        <MessageList messages={messages} messagesEndRef={messagesEndRef} />

        {connected && (
          <ChatInput
            inputText={inputText}
            onInputChange={setInputText}
            onSend={sendMessage}
            onUpload={uploadFile}
            uploading={uploading}
            uploadProgress={uploadProgress}
          />
        )}
      </div>
    </div>
  );
};
