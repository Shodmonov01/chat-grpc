import React from "react";
import { create } from "@bufbuild/protobuf";
import { chatClient } from "./api/chatClient";
import {
  ChatMessageSchema,
  FileChunkSchema,
  FileInfoSchema,
  FileRequestSchema,
  SubscribeRequestSchema,
  type ChatMessage,
  type FileInfo,
} from "./gen/proto/chat_pb";

// ─── Types ────────────────────────────────────────────────────────────────

interface MessageItem {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  isJoin?: boolean;
  isLeave?: boolean;
  file?: FileInfo;
}

// ─── Constants ────────────────────────────────────────────────────────────

const CHUNK_SIZE = 64 * 1024; // 64 KB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf", txt: "text/plain", csv: "text/csv", zip: "application/zip",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] ?? "application/octet-stream";
}

const MIME_ICONS: Record<string, string> = {
  "image/jpeg": "🖼️", "image/png": "🖼️", "image/gif": "🖼️", "image/webp": "🖼️",
  "application/pdf": "📄", "text/plain": "📝", "text/csv": "📊", "application/zip": "🗜️",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "📝",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "📊",
};

function getMimeIcon(mimeType: string) {
  return MIME_ICONS[mimeType] ?? "📎";
}

function formatBytes(bytes: bigint | number) {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── FileMessage component ────────────────────────────────────────────────

const FileMessage: React.FC<{ file: FileInfo }> = ({ file }) => {
  const [downloading, setDownloading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const handleDownload = async () => {
    setDownloading(true);
    setProgress(0);
    try {
      const chunks: Uint8Array[] = [];
      const totalSize = Number(file.size);
      let received = 0;

      const stream = chatClient.downloadFile(
        create(FileRequestSchema, { fileId: file.fileId })
      );

      for await (const chunk of stream) {
        if (chunk.data && chunk.data.length > 0) {
          chunks.push(chunk.data);
          received += chunk.data.length;
          if (totalSize > 0) setProgress(Math.round((received / totalSize) * 100));
        }
      }

      const blob = new Blob(chunks, { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div style={styles.fileCard}>
      <div style={styles.fileCardInner}>
        <span style={styles.fileIcon}>{getMimeIcon(file.mimeType)}</span>
        <div style={styles.fileMeta}>
          <span style={styles.fileName}>{file.filename}</span>
          <span style={styles.fileSize}>{formatBytes(file.size)}</span>
        </div>
        <button onClick={handleDownload} disabled={downloading} style={styles.downloadBtn}>
          {downloading ? `${progress}%` : "⬇"}
        </button>
      </div>
      {downloading && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
};

// ─── UploadButton component ───────────────────────────────────────────────

const UploadButton: React.FC<{ onUpload: (file: File) => void; disabled: boolean }> = ({
  onUpload, disabled,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef} type="file" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ""; } }}
      />
      <button onClick={() => inputRef.current?.click()} disabled={disabled} style={styles.attachBtn} title="Прикрепить файл">
        📎
      </button>
    </>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────

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
        username: msg.username, text: msg.text,
        timestamp: Number(msg.timestamp),
        isJoin: msg.join, isLeave: msg.leave, file: msg.file,
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
        create(SubscribeRequestSchema, { userId: userIdRef.current, username: username.trim(), room }),
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
          userId: userIdRef.current, username: username.trim(),
          text: inputText.trim(), timestamp: BigInt(Date.now()), room,
        })
      );
      setInputText("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [username, room, inputText]);

  // ─── Upload via gRPC unary (по чанкам) ───────────────────────────────────
  const uploadFile = React.useCallback(async (file: File) => {
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
      const totalChunks = Math.max(1, Math.ceil(data.length / CHUNK_SIZE) + 1); // +1 для chunk 0
      let sent = 0;

      // Чанк 0 — метаданные
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

      // Чанки с данными
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
  }, [username, room]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <h1 style={styles.title}>💬 Чат</h1>

        {!connected ? (
          <div style={styles.loginForm}>
            <input placeholder="Имя пользователя" value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()} style={styles.input} />
            <input placeholder="Комната" value={room}
              onChange={(e) => setRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connect()} style={styles.input} />
            <button onClick={connect} disabled={!username.trim()} style={styles.primaryBtn}>Войти</button>
          </div>
        ) : (
          <div style={styles.header}>
            <span style={styles.roomBadge}>#{room}</span>
            <button onClick={disconnect} style={styles.leaveBtn}>Выйти</button>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.messages}>
          {messages.length === 0 && <p style={styles.empty}>Сообщений пока нет…</p>}
          {messages.map((m) => (
            <div key={m.id} style={styles.messageRow}>
              {m.isJoin && <span style={styles.systemJoin}>→ {m.username} вошёл</span>}
              {m.isLeave && <span style={styles.systemLeave}>← {m.username} вышел</span>}
              {!m.isJoin && !m.isLeave && (
                <div>
                  <div style={styles.messageMeta}>
                    <strong style={styles.messageAuthor}>{m.username}</strong>
                    <span style={styles.messageTime}>{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {m.text && <div style={styles.messageText}>{m.text}</div>}
                  {m.file && <FileMessage file={m.file} />}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {uploading && (
          <div style={styles.uploadStatus}>
            <span style={{ fontSize: "0.8rem", color: "#7c7caa" }}>⬆️ Загрузка… {uploadProgress}%</span>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {connected && (
          <div style={styles.inputRow}>
            <UploadButton onUpload={uploadFile} disabled={uploading} />
            <input placeholder="Сообщение…" value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              style={{ ...styles.input, flex: 1 }} disabled={uploading} />
            <button onClick={sendMessage} disabled={!inputText.trim() || uploading} style={styles.primaryBtn}>→</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: "#0f0f13", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Geist Mono', 'Fira Code', monospace", padding: "1rem" },
  card: { width: "100%", maxWidth: 460, background: "#18181f", border: "1px solid #2a2a38", borderRadius: 12, padding: "1.5rem", display: "flex", flexDirection: "column", gap: 12 },
  title: { margin: 0, fontSize: "1.2rem", color: "#e8e8f0", fontWeight: 600 },
  loginForm: { display: "flex", flexDirection: "column", gap: 8 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  roomBadge: { fontSize: "0.8rem", color: "#7c7caa", background: "#22222e", padding: "4px 10px", borderRadius: 20, border: "1px solid #2e2e40" },
  input: { background: "#22222e", border: "1px solid #2e2e40", borderRadius: 8, padding: "8px 12px", color: "#e8e8f0", fontSize: "0.9rem", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
  primaryBtn: { background: "#5b5bdb", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem", fontFamily: "inherit", whiteSpace: "nowrap" },
  leaveBtn: { background: "transparent", border: "1px solid #3a1a1a", borderRadius: 8, padding: "6px 14px", color: "#aa5555", cursor: "pointer", fontSize: "0.8rem", fontFamily: "inherit" },
  attachBtn: { background: "#22222e", border: "1px solid #2e2e40", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: "1rem", lineHeight: 1, flexShrink: 0 },
  messages: { background: "#13131a", border: "1px solid #1e1e2a", borderRadius: 8, minHeight: 200, maxHeight: 320, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 8 },
  empty: { color: "#444458", fontSize: "0.8rem", textAlign: "center", margin: "auto" },
  messageRow: { display: "flex", flexDirection: "column" },
  systemJoin: { color: "#4a7a4a", fontSize: "0.78rem" },
  systemLeave: { color: "#7a4a4a", fontSize: "0.78rem" },
  messageMeta: { display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 },
  messageAuthor: { color: "#8888dd", fontSize: "0.82rem" },
  messageTime: { color: "#44445a", fontSize: "0.7rem" },
  messageText: { color: "#d0d0e0", fontSize: "0.88rem", lineHeight: 1.5 },
  inputRow: { display: "flex", gap: 8, alignItems: "center" },
  error: { color: "#cc4444", fontSize: "0.8rem", margin: 0 },
  uploadStatus: { display: "flex", flexDirection: "column", gap: 4 },
  fileCard: { background: "#1e1e2c", border: "1px solid #2a2a3c", borderRadius: 8, padding: "8px 10px", marginTop: 4, maxWidth: 280 },
  fileCardInner: { display: "flex", alignItems: "center", gap: 8 },
  fileIcon: { fontSize: "1.2rem", flexShrink: 0 },
  fileMeta: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  fileName: { color: "#c0c0d8", fontSize: "0.82rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileSize: { color: "#55556a", fontSize: "0.72rem" },
  downloadBtn: { background: "#22223a", border: "1px solid #33335a", borderRadius: 6, color: "#8888dd", cursor: "pointer", padding: "4px 8px", fontSize: "0.8rem", flexShrink: 0, fontFamily: "inherit", minWidth: 32 },
  progressBar: { height: 3, background: "#22222e", borderRadius: 2, overflow: "hidden", marginTop: 6 },
  progressFill: { height: "100%", background: "#5b5bdb", borderRadius: 2, transition: "width 0.2s ease" },
};