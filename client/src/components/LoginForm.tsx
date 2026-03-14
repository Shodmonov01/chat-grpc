import React from "react";

export interface LoginFormProps {
  username: string;
  room: string;
  onUsernameChange: (value: string) => void;
  onRoomChange: (value: string) => void;
  onConnect: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  username,
  room,
  onUsernameChange,
  onRoomChange,
  onConnect,
}) => {
  const handleUsernameKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => e.key === "Enter" && onConnect(),
    [onConnect]
  );
  const handleRoomKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => e.key === "Enter" && onConnect(),
    [onConnect]
  );

  return (
    <div className="chat__login-form">
      <input
        placeholder="Имя пользователя"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        onKeyDown={handleUsernameKeyDown}
        className="chat__input"
      />
      <input
        placeholder="Комната"
        value={room}
        onChange={(e) => onRoomChange(e.target.value)}
        onKeyDown={handleRoomKeyDown}
        className="chat__input"
      />
      <button
        onClick={onConnect}
        disabled={!username.trim()}
        className="chat__primary-btn"
      >
        Войти
      </button>
    </div>
  );
};
