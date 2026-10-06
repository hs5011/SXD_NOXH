import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

// Allowed file types and size come from the Admin "Cấu hình tải tệp" settings (table upload_config).
// The server checks the same values on upload; these helpers let every screen show and pre-check them.
export interface UploadConfig {
  allowedExtensions: string;
  maxSizeMb: number;
}

// Same defaults as the server (server/db.ts) while the settings are loading or unreachable
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  allowedExtensions: 'JPG,JPEG,PNG,GIF,PDF,DOC,DOCX,XLS,XLSX,ZIP,RAR',
  maxSizeMb: 20
};

export function parseAllowedExtensions(value: string | undefined | null): string[] {
  return String(value || '')
    .split(',')
    .map(s => s.trim().replace(/^\./, '').toUpperCase())
    .filter(Boolean);
}

export function normalizeUploadConfig(raw: any): UploadConfig {
  return {
    allowedExtensions: raw?.allowedExtensions || DEFAULT_UPLOAD_CONFIG.allowedExtensions,
    maxSizeMb: Number(raw?.maxSizeMb) || DEFAULT_UPLOAD_CONFIG.maxSizeMb
  };
}

// "JPG, PNG, PDF … • Tối đa 20 MB/tệp" parts for the upload hints
export function uploadExtensionsLabel(config: UploadConfig): string {
  return parseAllowedExtensions(config.allowedExtensions).join(', ');
}

// File input `accept` value (".pdf,.docx,…") so the picker offers only allowed types
export function uploadAcceptAttr(config: UploadConfig): string | undefined {
  const exts = parseAllowedExtensions(config.allowedExtensions);
  return exts.length > 0 ? exts.map(e => `.${e.toLowerCase()}`).join(',') : undefined;
}

export function uploadRejectReason(file: File, config: UploadConfig): string | null {
  const exts = parseAllowedExtensions(config.allowedExtensions);
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : '';
  if (exts.length > 0 && !exts.includes(ext)) {
    return `Định dạng tệp ${ext ? '.' + ext : '(không có đuôi)'} không được cấu hình cho phép tải lên (cho phép: ${exts.join(', ')}).`;
  }
  if (file.size > config.maxSizeMb * 1024 * 1024) {
    return `Dung lượng tệp (${(file.size / (1024 * 1024)).toFixed(1)} MB) vượt quá giới hạn cấu hình ${config.maxSizeMb} MB.`;
  }
  return null;
}

// Splits picked files into accepted ones and a message listing the rejected ones (null when none)
export function checkUploadFiles(files: File[], config: UploadConfig): { accepted: File[]; message: string | null } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const reason = uploadRejectReason(file, config);
    if (reason) rejected.push(`• ${file.name}: ${reason}`);
    else accepted.push(file);
  }
  return {
    accepted,
    message: rejected.length > 0 ? `Từ chối tải lên ${rejected.length} tệp:\n${rejected.join('\n')}` : null
  };
}

export function useUploadConfig(): UploadConfig {
  const [config, setConfig] = useState<UploadConfig>(DEFAULT_UPLOAD_CONFIG);
  useEffect(() => {
    let active = true;
    apiFetch('/api/upload-config')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (active && data && typeof data === 'object') setConfig(normalizeUploadConfig(data)); })
      .catch(() => { /* keep defaults */ });
    return () => { active = false; };
  }, []);
  return config;
}
