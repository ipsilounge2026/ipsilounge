"use client";

import { useRef, useState } from "react";

interface FileUploaderProps {
  label: string;
  accept?: string;
  onFileSelect: (file: File) => void;
}

export default function FileUploader({ label, accept, onFileSelect }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFileSelect(file);
    }
  };

  return (
    <div className="file-upload-area" onClick={handleClick}>
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} />
      {fileName ? (
        <p style={{ color: "var(--primary)", fontWeight: 600 }}>{fileName}</p>
      ) : (
        <p>{label}</p>
      )}
    </div>
  );
}
