import React from "react";
import { UploadButton } from "./UploadButton";
import { UploadStatus } from "./UploadStatus";

export interface ChatInputProps {
  inputText: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onUpload: (file: File) => void;
  uploading: boolean;
  uploadProgress: number;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  onInputChange,
  onSend,
  onUpload,
  uploading,
  uploadProgress,
}) => {
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => e.key === "Enter" && onSend(),
    [onSend]
  );

  return (
    <>
      {uploading && <UploadStatus progress={uploadProgress} />}
      <div className="chat__input-row">
        <UploadButton onUpload={onUpload} disabled={uploading} />
        <input
          placeholder="Сообщение…"
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="chat__input"
          disabled={uploading}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!inputText.trim() || uploading}
          className="chat__primary-btn"
        >
          →
        </button>
      </div>
    </>
  );
};
