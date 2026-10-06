/**
 * watch-tests.ts — Tự động tạo skeleton test khi source thay đổi
 *
 * Cách chạy:
 *   npx tsx scripts/watch-tests.ts
 *   # hoặc thêm vào package.json: "test:watch-gen": "tsx scripts/watch-tests.ts"
 *
 * Chức năng:
 *   - Theo dõi thư mục src/components/ và src/lib/ realtime
 *   - Khi file .tsx/.ts mới xuất hiện → tạo skeleton test tương ứng
 *   - Khi file hiện có thay đổi → in thông báo gợi ý chạy /sync-tests
 *   - Không ghi đè file test đã có nội dung
 */

import fs from 'fs';
import path from 'path';

// ─── Cấu hình mapping: source → test ──────────────────────────────────────

const ROOT = process.cwd();

const WATCH_RULES: Array<{
  srcDir: string;
  testDir: string;
  testType: 'component' | 'unit' | 'integration';
  ext: string;
}> = [
  {
    srcDir: path.join(ROOT, 'src', 'components'),
    testDir: path.join(ROOT, 'test', 'component'),
    testType: 'component',
    ext: '.tsx',
  },
  {
    srcDir: path.join(ROOT, 'src', 'lib'),
    testDir: path.join(ROOT, 'test', 'unit'),
    testType: 'unit',
    ext: '.ts',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function getTestPath(srcFile: string, rule: (typeof WATCH_RULES)[number]): string {
  const base = path.basename(srcFile, rule.ext);
  const testExt = rule.testType === 'component' ? '.test.tsx' : '.test.ts';
  return path.join(rule.testDir, `${base}${testExt}`);
}

function isSkeletonOrEmpty(content: string): boolean {
  // File được coi là skeleton nếu < 30 dòng và chứa dấu hiệu auto-gen
  const lines = content.split('\n').filter(l => l.trim()).length;
  return lines < 30 || content.includes('// AUTO-GENERATED SKELETON');
}

function log(emoji: string, msg: string) {
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${time}] ${emoji}  ${msg}`);
}

// ─── Sinh skeleton test ───────────────────────────────────────────────────

function generateSkeleton(srcFile: string, testType: 'component' | 'unit' | 'integration'): string {
  const base = path.basename(srcFile, path.extname(srcFile));
  const relSrc = path.relative(path.join(ROOT, 'test', testType === 'unit' ? 'unit' : 'component'), srcFile)
    .replace(/\\/g, '/');

  if (testType === 'component') {
    return `// AUTO-GENERATED SKELETON — chạy /sync-tests để AI điền chi tiết
// @vitest-environment jsdom
/**
 * Tests: ${base}
 * Source: ${relSrc}
 *
 * TODO: Chạy lệnh sau để AI sinh test đầy đủ:
 *   /sync-tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Lưu ý: KHÔNG mock lucide-react bằng new Proxy(...) — gây deadlock trên Windows
// vi.mock('lucide-react', ...) ← KHÔNG làm thế này

import ${base} from '../../src/components/${base}';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const defaultProps = {
  // TODO: Điền props mặc định cho ${base}
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('${base} – Render cơ bản', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1.1 – render không crash', () => {
    // TODO: Truyền props thực tế
    expect(true).toBe(true); // placeholder
  });

  it('1.2 – hiển thị nội dung chính', () => {
    // render(<${base} {...defaultProps} />);
    // expect(screen.getByText(/.../)). toBeInTheDocument();
    expect(true).toBe(true); // placeholder
  });
});

describe('${base} – Tương tác người dùng', () => {
  it('2.1 – TODO: Thêm test tương tác', () => {
    expect(true).toBe(true); // placeholder
  });
});
`;
  }

  // Unit test skeleton
  return `// AUTO-GENERATED SKELETON — chạy /sync-tests để AI điền chi tiết
/**
 * Tests: ${base}
 * Source: ${relSrc}
 *
 * TODO: Chạy lệnh sau để AI sinh test đầy đủ:
 *   /sync-tests
 */

import { describe, it, expect, vi } from 'vitest';

// Import các hàm cần test
// import { ... } from '../../src/lib/${base}';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('${base} – Logic cơ bản', () => {
  it('1.1 – TODO: Thêm test', () => {
    expect(true).toBe(true); // placeholder
  });
});
`;
}

// ─── Tạo file test mới ────────────────────────────────────────────────────

function createTestIfMissing(srcFile: string, rule: (typeof WATCH_RULES)[number]) {
  const testFile = getTestPath(srcFile, rule);

  // Không ghi đè nếu file test đã tồn tại và không phải skeleton
  if (fs.existsSync(testFile)) {
    const existing = fs.readFileSync(testFile, 'utf-8');
    if (!isSkeletonOrEmpty(existing)) {
      log('⏭️', `Đã có test (${path.basename(testFile)}) — bỏ qua`);
      return;
    }
    log('🔄', `Cập nhật skeleton: ${path.basename(testFile)}`);
  } else {
    log('✨', `Tạo skeleton mới: ${path.basename(testFile)}`);
  }

  const content = generateSkeleton(srcFile, rule.testType);
  fs.writeFileSync(testFile, content, 'utf-8');
  log('✅', `Đã tạo: test/${rule.testType === 'unit' ? 'unit' : 'component'}/${path.basename(testFile)}`);
  log('💡', `Chạy /sync-tests trong Claude Code để AI điền test đầy đủ`);
}

// ─── Xử lý sự kiện thay đổi file ─────────────────────────────────────────

function handleChange(
  eventType: string,
  filename: string | null,
  rule: (typeof WATCH_RULES)[number],
) {
  if (!filename) return;
  if (!filename.endsWith(rule.ext)) return;
  // Bỏ qua file .d.ts
  if (filename.endsWith('.d.ts')) return;

  const srcFile = path.join(rule.srcDir, filename);

  // File bị xóa
  if (!fs.existsSync(srcFile)) {
    log('🗑️ ', `File bị xóa: src/${rule.testType === 'unit' ? 'lib' : 'components'}/${filename}`);
    const testFile = getTestPath(srcFile, rule);
    if (fs.existsSync(testFile)) {
      log('⚠️ ', `File test tương ứng vẫn còn: ${path.basename(testFile)} — kiểm tra thủ công`);
    }
    return;
  }

  if (eventType === 'rename') {
    // File mới được thêm vào
    log('🆕', `File mới: src/${rule.testType === 'unit' ? 'lib' : 'components'}/${filename}`);
    createTestIfMissing(srcFile, rule);
  } else if (eventType === 'change') {
    // File hiện có bị thay đổi
    const testFile = getTestPath(srcFile, rule);
    const testExists = fs.existsSync(testFile);
    const testContent = testExists ? fs.readFileSync(testFile, 'utf-8') : '';

    log('📝', `Thay đổi: src/${rule.testType === 'unit' ? 'lib' : 'components'}/${filename}`);

    if (!testExists) {
      log('🚨', `CHƯA CÓ FILE TEST cho ${filename}!`);
      createTestIfMissing(srcFile, rule);
    } else if (isSkeletonOrEmpty(testContent)) {
      log('⚠️ ', `File test vẫn là skeleton → chạy /sync-tests để AI hoàn thiện`);
    } else {
      log('💡', `→ Chạy /sync-tests để AI cập nhật test theo thay đổi mới`);
    }
  }
}

// ─── Khởi động watcher ────────────────────────────────────────────────────

function startWatcher() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     NOXH — Auto Test Watcher đang chạy...         ║');
  console.log('╠════════════════════════════════════════════════════╣');
  console.log('║  Theo dõi: src/components/ → test/component/      ║');
  console.log('║  Theo dõi: src/lib/        → test/unit/           ║');
  console.log('║  Dừng: Ctrl+C                                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');

  // Kiểm tra các thư mục src có tồn tại không
  for (const rule of WATCH_RULES) {
    if (!fs.existsSync(rule.srcDir)) {
      log('⚠️ ', `Thư mục không tồn tại, bỏ qua: ${rule.srcDir}`);
      continue;
    }
    if (!fs.existsSync(rule.testDir)) {
      fs.mkdirSync(rule.testDir, { recursive: true });
      log('📁', `Tạo thư mục: ${rule.testDir}`);
    }

    log('👁️ ', `Đang theo dõi: ${rule.srcDir}`);

    // Dùng debounce để tránh xử lý nhiều event cùng lúc
    const debounceMap = new Map<string, NodeJS.Timeout>();

    fs.watch(rule.srcDir, { persistent: true }, (eventType, filename) => {
      if (!filename) return;

      const key = `${eventType}:${filename}`;
      if (debounceMap.has(key)) clearTimeout(debounceMap.get(key)!);

      debounceMap.set(
        key,
        setTimeout(() => {
          debounceMap.delete(key);
          handleChange(eventType, filename, rule);
        }, 300),
      );
    });
  }

  // Scan ban đầu: tìm file src chưa có test
  console.log('');
  log('🔍', 'Quét ban đầu — tìm file chưa có test...');
  let missing = 0;

  for (const rule of WATCH_RULES) {
    if (!fs.existsSync(rule.srcDir)) continue;

    const files = fs.readdirSync(rule.srcDir).filter(f => f.endsWith(rule.ext) && !f.endsWith('.d.ts'));

    for (const file of files) {
      const srcFile = path.join(rule.srcDir, file);
      const testFile = getTestPath(srcFile, rule);
      if (!fs.existsSync(testFile)) {
        log('❌', `Chưa có test: ${file} → ${path.basename(testFile)}`);
        missing++;
      }
    }
  }

  if (missing === 0) {
    log('🎉', 'Tất cả file source đều đã có test!');
  } else {
    log('💡', `Có ${missing} file chưa có test. Chạy /sync-tests để AI tạo tự động.`);
  }

  console.log('');
  log('⏳', 'Đang chờ thay đổi...');
}

startWatcher();
