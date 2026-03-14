import React from "react";
import type { MessageItem } from "../types/chat";
import { FileMessage } from "./FileMessage";

export interface MessageListProps {
  messages: MessageItem[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, messagesEndRef }) => (
  <div className="chat__messages">
    {messages.length === 0 && <p className="chat__empty">Сообщений пока нет…</p>}
    {messages.map((m) => (
      <div key={m.id} className="chat__message-row">
        {m.isJoin && <span className="chat__system-join">→ {m.username} вошёл</span>}
        {m.isLeave && <span className="chat__system-leave">← {m.username} вышел</span>}
        {!m.isJoin && !m.isLeave && (
          <div>
            <div className="chat__message-meta">
              <strong className="chat__message-author">{m.username}</strong>
              <span className="chat__message-time">
                {new Date(m.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {m.text && <div className="chat__message-text">{m.text}</div>}
            {m.file && <FileMessage file={m.file} />}
          </div>
        )}
      </div>
    ))}
    <div ref={messagesEndRef} />
  </div>
);
