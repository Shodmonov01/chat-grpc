import React from "react";
import { create } from "@bufbuild/protobuf";
import { chatClient } from "../api/chatClient";
import { FileRequestSchema } from "../gen/proto/chat_pb";
import type { FileInfo } from "../gen/proto/chat_pb";
import { getMimeIcon, formatBytes } from "../constants/file";

export interface FileMessageProps {
  file: FileInfo;
}

export const FileMessage: React.FC<FileMessageProps> = ({ file }) => {
  const [downloading, setDownloading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const handleDownload = React.useCallback(async () => {
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
  }, [file.fileId, file.filename, file.mimeType, file.size]);

  return (
    <div className="chat__file-card">
      <div className="chat__file-card-inner">
        <span className="chat__file-icon">{getMimeIcon(file.mimeType)}</span>
        <div className="chat__file-meta">
          <span className="chat__file-name">{file.filename}</span>
          <span className="chat__file-size">{formatBytes(file.size)}</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="chat__download-btn"
        >
          {downloading ? `${progress}%` : "⬇"}
        </button>
      </div>
      {downloading && (
        <div className="chat__progress-bar">
          <div className="chat__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
};
