import React from "react";

export interface UploadButtonProps {
  onUpload: (file: File) => void;
  disabled: boolean;
}

export const UploadButton: React.FC<UploadButtonProps> = ({ onUpload, disabled }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) {
        onUpload(f);
        e.target.value = "";
      }
    },
    [onUpload]
  );

  const handleClick = React.useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="chat__file-input-hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="chat__attach-btn"
        title="Прикрепить файл"
      >
        📎
      </button>
    </>
  );
};
