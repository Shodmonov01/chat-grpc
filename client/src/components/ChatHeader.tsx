import React from "react";

export interface ChatHeaderProps {
  room: string;
  onLeave: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ room, onLeave }) => (
  <div className="chat__header">
    <span className="chat__room-badge">#{room}</span>
    <button type="button" onClick={onLeave} className="chat__leave-btn">
      Выйти
    </button>
  </div>
);
