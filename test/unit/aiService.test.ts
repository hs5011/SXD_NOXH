import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted đảm bảo biến được khai báo trước khi vi.mock() được hoist lên đầu
const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return {
      models: {
        generateContent: mockGenerateContent,
      },
    };
  }),
}));

import { generateProjectReport } from '../../src/services/aiService.ts';

// ═════════════════════════════════════════════════════════════════════════════
// generateProjectReport
// ═════════════════════════════════════════════════════════════════════════════
describe('generateProjectReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gọi generateContent với đúng model gemini-2.0-flash', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Báo cáo AI mẫu.' });

    await generateProjectReport({ id: '1', name: 'Dự án test' });

    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.model).toBe('gemini-2.0-flash');
  });

  it('truyền dữ liệu dự án vào prompt', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'OK' });

    const projectData = { id: '42', name: 'Nhà ở xã hội Q1', progress: 50 };
    await generateProjectReport(projectData);

    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain(JSON.stringify(projectData));
  });

  it('trả về text từ response', async () => {
    const expectedText = 'Dự án đang tiến độ tốt, không có rủi ro.';
    mockGenerateContent.mockResolvedValue({ text: expectedText });

    const result = await generateProjectReport({ id: '1' });
    expect(result).toBe(expectedText);
  });

  it('xử lý response text undefined không crash', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined });
    const result = await generateProjectReport({});
    expect(result).toBeUndefined();
  });

  it('ném lỗi khi API thất bại', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));
    await expect(generateProjectReport({})).rejects.toThrow('API quota exceeded');
  });

  it('gửi prompt chứa từ khóa phân tích tiến độ', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'OK' });
    await generateProjectReport({ id: '1' });

    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(callArg.contents).toContain('phân tích tiến độ');
  });
});
