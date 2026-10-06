import { describe, it, expect } from 'vitest';
import { hashPassword, generatePolicyCompliantPassword } from '../../src/lib/crypto.ts';

// ═══════════════════════════════════════════════════════════════════════════════
// hashPassword
// ═══════════════════════════════════════════════════════════════════════════════

describe('hashPassword', () => {
  it('trả về chuỗi rỗng khi input rỗng', () => {
    expect(hashPassword('')).toBe('');
  });

  it('trả về chuỗi rỗng khi input là falsy', () => {
    expect(hashPassword(null as any)).toBe('');
  });

  it('trả về chuỗi hex 64 ký tự (SHA-256)', () => {
    const result = hashPassword('password123');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it('kết quả giống nhau với cùng input (deterministic)', () => {
    const h1 = hashPassword('abc123');
    const h2 = hashPassword('abc123');
    expect(h1).toBe(h2);
  });

  it('kết quả khác nhau với input khác nhau', () => {
    expect(hashPassword('password1')).not.toBe(hashPassword('password2'));
  });

  it('SHA-256 đúng cho chuỗi "123456"', () => {
    // SHA-256("123456") = 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
    expect(hashPassword('123456')).toBe('8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
  });

  it('phân biệt chữ hoa chữ thường', () => {
    expect(hashPassword('Password')).not.toBe(hashPassword('password'));
  });

  it('xử lý ký tự đặc biệt', () => {
    const result = hashPassword('!@#$%^&*()');
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it('xử lý chuỗi dài', () => {
    const result = hashPassword('a'.repeat(1000));
    expect(result).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(result)).toBe(true);
  });

  it('xử lý khoảng trắng', () => {
    expect(hashPassword('pass word')).not.toBe(hashPassword('password'));
    expect(hashPassword('pass word')).toHaveLength(64);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// generatePolicyCompliantPassword
// ═══════════════════════════════════════════════════════════════════════════════

describe('generatePolicyCompliantPassword', () => {
  it('kết quả có độ dài >= minLength (8)', () => {
    const result = generatePolicyCompliantPassword({ minLength: 8 });
    expect(result.length).toBeGreaterThanOrEqual(8);
  });

  it('kết quả có độ dài >= minLength (20)', () => {
    const result = generatePolicyCompliantPassword({ minLength: 20 });
    expect(result.length).toBeGreaterThanOrEqual(20);
  });

  it('khi không truyền minLength → dùng mặc định 6', () => {
    const result = generatePolicyCompliantPassword({});
    expect(result.length).toBeGreaterThanOrEqual(6);
    expect(result).toBeTruthy();
  });

  it('kết quả là chuỗi không null', () => {
    const result = generatePolicyCompliantPassword({ minLength: 8 });
    expect(typeof result).toBe('string');
    expect(result).not.toBeNull();
  });

  it('requireUppercase=true → chứa ít nhất 1 chữ hoa', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePolicyCompliantPassword({ minLength: 8, requireUppercase: true });
      expect(/[A-Z]/.test(result)).toBe(true);
    }
  });

  it('requireLowercase=true → chứa ít nhất 1 chữ thường', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePolicyCompliantPassword({ minLength: 8, requireLowercase: true });
      expect(/[a-z]/.test(result)).toBe(true);
    }
  });

  it('requireNumbers=true → chứa ít nhất 1 chữ số', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePolicyCompliantPassword({ minLength: 8, requireNumbers: true });
      expect(/[0-9]/.test(result)).toBe(true);
    }
  });

  it('requireSpecialChars=true → chứa ít nhất 1 ký tự đặc biệt (!@#$%&*)', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePolicyCompliantPassword({ minLength: 8, requireSpecialChars: true });
      expect(/[!@#$%&*]/.test(result)).toBe(true);
    }
  });

  it('tất cả yêu cầu bật → đủ cả 4 loại ký tự', () => {
    for (let i = 0; i < 20; i++) {
      const result = generatePolicyCompliantPassword({
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      });
      expect(result.length).toBeGreaterThanOrEqual(12);
      expect(/[A-Z]/.test(result)).toBe(true);
      expect(/[a-z]/.test(result)).toBe(true);
      expect(/[0-9]/.test(result)).toBe(true);
      expect(/[!@#$%&*]/.test(result)).toBe(true);
    }
  });

  it('minLength lớn hơn số ký tự bắt buộc → vẫn đủ độ dài', () => {
    const result = generatePolicyCompliantPassword({
      minLength: 20,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    });
    expect(result.length).toBeGreaterThanOrEqual(20);
  });

  it('chỉ chứa ký tự từ allowed pool [A-Za-z0-9!@#$%&*]', () => {
    for (let i = 0; i < 10; i++) {
      const result = generatePolicyCompliantPassword({
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
      });
      expect(/^[A-Za-z0-9!@#$%&*]+$/.test(result)).toBe(true);
    }
  });

  it('không có yêu cầu nào → vẫn sinh được mật khẩu có uppercase + lowercase + number', () => {
    let hasUpper = false, hasLower = false, hasNum = false;
    // Gọi nhiều lần để xác suất cao
    for (let i = 0; i < 50; i++) {
      const r = generatePolicyCompliantPassword({ minLength: 6 });
      if (/[A-Z]/.test(r)) hasUpper = true;
      if (/[a-z]/.test(r)) hasLower = true;
      if (/[0-9]/.test(r)) hasNum = true;
    }
    expect(hasUpper).toBe(true);
    expect(hasLower).toBe(true);
    expect(hasNum).toBe(true);
  });

  it('kết quả không đoán trước được (ngẫu nhiên)', () => {
    const results = new Set(
      Array.from({ length: 10 }, () => generatePolicyCompliantPassword({ minLength: 12 }))
    );
    // Xác suất 10 lần trùng nhau gần như 0
    expect(results.size).toBeGreaterThan(1);
  });
});
