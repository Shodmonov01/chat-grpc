import React from "react";

export interface UploadStatusProps {
  progress: number;
}

export const UploadStatus: React.FC<UploadStatusProps> = ({ progress }) => (
  <div className="chat__upload-status">
    <span className="chat__upload-status-text">⬆️ Загрузка… {progress}%</span>
    <div className="chat__progress-bar">
      <div className="chat__progress-fill" style={{ width: `${progress}%` }} />
    </div>
  </div>
);
