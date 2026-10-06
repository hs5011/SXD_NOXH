/**
 * Ràng buộc tải tệp lấy từ "Cấu hình tải tệp" (upload_config) — dùng chung cho mọi màn hình có ô đính kèm
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UPLOAD_CONFIG,
  parseAllowedExtensions,
  normalizeUploadConfig,
  uploadExtensionsLabel,
  uploadAcceptAttr,
  uploadRejectReason,
  checkUploadFiles
} from '../../src/lib/uploadRules';

const fileOf = (name: string, mb: number) => {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: Math.round(mb * 1024 * 1024) });
  return f;
};

const cfg = { allowedExtensions: 'PDF, .docx,xlsx,ZIP', maxSizeMb: 20 };

describe('uploadRules', () => {
  it('chuẩn hóa danh sách định dạng (bỏ dấu chấm, khoảng trắng, viết hoa)', () => {
    expect(parseAllowedExtensions(cfg.allowedExtensions)).toEqual(['PDF', 'DOCX', 'XLSX', 'ZIP']);
    expect(parseAllowedExtensions('')).toEqual([]);
  });

  it('nhãn và accept hiển thị theo cấu hình', () => {
    expect(uploadExtensionsLabel(cfg)).toBe('PDF, DOCX, XLSX, ZIP');
    expect(uploadAcceptAttr(cfg)).toBe('.pdf,.docx,.xlsx,.zip');
    expect(uploadAcceptAttr({ allowedExtensions: '', maxSizeMb: 20 })).toBeUndefined();
  });

  it('cấu hình thiếu/lỗi dùng mặc định giống server (20 MB)', () => {
    expect(normalizeUploadConfig(null)).toEqual(DEFAULT_UPLOAD_CONFIG);
    expect(normalizeUploadConfig({ maxSizeMb: '35' }).maxSizeMb).toBe(35);
    expect(DEFAULT_UPLOAD_CONFIG.maxSizeMb).toBe(20);
  });

  it('tệp 12 MB được nhận khi cấu hình 20 MB; 21 MB bị từ chối', () => {
    expect(uploadRejectReason(fileOf('HoSo.pdf', 12), cfg)).toBeNull();
    expect(uploadRejectReason(fileOf('HoSo.pdf', 21), cfg)).toMatch(/vượt quá giới hạn cấu hình 20 MB/);
  });

  it('định dạng không có trong cấu hình bị từ chối, không phân biệt hoa thường', () => {
    expect(uploadRejectReason(fileOf('BanVe.DWG', 1), cfg)).toMatch(/\.DWG không được cấu hình/);
    expect(uploadRejectReason(fileOf('bang.XLSX', 1), cfg)).toBeNull();
    expect(uploadRejectReason(fileOf('khongduoi', 1), cfg)).toMatch(/không có đuôi/);
  });

  it('checkUploadFiles tách tệp hợp lệ và liệt kê tệp bị từ chối', () => {
    const r = checkUploadFiles([fileOf('a.pdf', 1), fileOf('b.exe', 1), fileOf('c.zip', 30)], cfg);
    expect(r.accepted.map(f => f.name)).toEqual(['a.pdf']);
    expect(r.message).toMatch(/^Từ chối tải lên 2 tệp:/);
    expect(r.message).toContain('• b.exe');
    expect(r.message).toContain('• c.zip');
    expect(checkUploadFiles([fileOf('a.pdf', 1)], cfg).message).toBeNull();
  });
});
