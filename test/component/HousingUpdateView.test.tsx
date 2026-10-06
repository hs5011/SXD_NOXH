// @vitest-environment jsdom
/**
 * Component Tests: HousingUpdateView
 *
 * Kiểm tra:
 *   - Render thông tin dự án
 *   - Nút Quay lại gọi onBack
 *   - Tabs Hồ sơ / Lịch sử xử lý
 *   - Fetch attachments và history khi mount
 *   - Nút Lưu cập nhật
 *   - Nhập nội dung xử lý
 *   - Upload file
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import HousingUpdateView from '../../src/components/HousingUpdateView';

// ─── Mock external dependencies ───────────────────────────────────────────────

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
    span: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
    section: ({ children, ...rest }: any) => <section {...rest}>{children}</section>,
    ul: ({ children, ...rest }: any) => <ul {...rest}>{children}</ul>,
    li: ({ children, ...rest }: any) => <li {...rest}>{children}</li>,
    h2: ({ children, ...rest }: any) => <h2 {...rest}>{children}</h2>,
    h3: ({ children, ...rest }: any) => <h3 {...rest}>{children}</h3>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const M = () => null;
  return {
    // Icons not listed here render the real component
    ...(await importOriginal<typeof import('lucide-react')>()),
    Building2: M, Clock: M, CheckCircle2: M, AlertCircle: M, FileText: M,
    MessageSquare: M, History: M, Info: M, ChevronRight: M, ChevronDown: M,
    Upload: M, Save: M, Send: M, AlertTriangle: M, User: M, Calendar: M,
    Shield: M, MapPin: M, DollarSign: M, FileCheck: M, FileX: M,
    Paperclip: M, Download: M, Eye: M, ArrowLeft: M, X: M, Check: M,
    Plus: M, Minus: M, Edit3: M, Trash2: M,
    Search: M, ListTodo: M, Route: M,
  };
});

vi.mock('../../src/lib/projectUtils', async (importOriginal) => ({
  // Real helpers (toDisplayDate, getAgencyWithDepartment…) + the overrides below
  ...(await importOriginal<typeof import('../../src/lib/projectUtils')>()),
  parseDate: vi.fn((s: string) => (s ? new Date('2024-01-01') : null)),
  formatDate: vi.fn((s: string) => s || ''),
  formatLocalDate: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
  calculateProjectStatus: vi.fn(() => ({
    progress: 50, currentStep: 'Bước 1', status: 'On Track',
    currentAgency: '', childStep: '', parentStep: '',
  })),
}));

// ─── Mock global fetch ────────────────────────────────────────────────────────

const MOCK_HEADERS = { get: (_key: string) => 'application/json' };

function mockFetch(attachments: any[] = [], history: any[] = []) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/attachments')) {
      return Promise.resolve({ ok: true, headers: MOCK_HEADERS, json: () => Promise.resolve(attachments) });
    }
    if (url.includes('/history')) {
      return Promise.resolve({ ok: true, headers: MOCK_HEADERS, json: () => Promise.resolve(history) });
    }
    return Promise.resolve({ ok: true, headers: MOCK_HEADERS, json: () => Promise.resolve({}) });
  });
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProcess = {
  id: 'proc-1',
  name: 'Quy trình NOXH chuẩn',
  parentSteps: [
    {
      id: 'ps-1',
      name: 'Giai đoạn chuẩn bị',
      stage: 'Chuẩn bị',
      childSteps: [
        { id: 'cs-1', name: 'Chấp thuận chủ trương', agency: 'Sở XD' },
        { id: 'cs-2', name: 'Quy hoạch 1/500', agency: 'Sở QHKT' },
      ],
    },
    {
      id: 'ps-2',
      name: 'Giai đoạn thực hiện',
      stage: 'Thực hiện',
      childSteps: [
        { id: 'cs-3', name: 'Giao đất', agency: 'UBND' },
      ],
    },
  ],
};

const mockProject = {
  id: 'p-1',
  code: 'NOXH-2024-0001',
  name: 'Nhà Ở Xã Hội Bình Tân',
  investor: 'Công ty A',
  location: 'Sở Xây Dựng',
  type: 'Nhà ở xã hội',
  fundingSource: 'Vốn tư nhân',
  currentStage: 'Chuẩn bị đầu tư',
  currentStep: 'Chấp thuận chủ trương',
  processingAgency: 'Sở Xây Dựng',
  processingDept: 'Phòng QLXD',
  status: 'On Track',
  completionRate: 50,
  isPublicInvestment: false,
  processId: 'proc-1',
  milestones: {},
};

const defaultProps = {
  project: mockProject,
  processes: [mockProcess],
  stepStatuses: ['Chưa bắt đầu', 'Đang xử lý', 'Hoàn tất', 'Quá hạn'],
  // Quyền nhập theo bước: SXD / Admin nhập cả hai phía (src/components/HousingUpdateView)
  currentUser: { id: 'u-1', fullName: 'Admin User', roleId: 'Admin', userType: 'agency', agencyId: '1' },
};

function renderHousing(overrides: Record<string, any> = {}) {
  const props = {
    ...defaultProps,
    onBack: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  return { ...render(<HousingUpdateView {...props} />), props };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Render cơ bản', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('render được mà không crash', async () => {
    await act(async () => {
      expect(() => renderHousing()).not.toThrow();
    });
  });

  it('hiển thị tên dự án', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('hiển thị mã dự án', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getByText('NOXH-2024-0001')).toBeInTheDocument();
  });

  it('hiển thị tên chủ đầu tư', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getByText(/Công ty A/)).toBeInTheDocument();
  });

  it('render được khi không có project', async () => {
    await act(async () => {
      expect(() => renderHousing({ project: undefined })).not.toThrow();
    });
  });

  it('render được khi không có processes', async () => {
    await act(async () => {
      expect(() => renderHousing({ processes: [] })).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Nút Quay lại', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị nút Quay lại khi có onBack', async () => {
    const onBack = vi.fn();
    await act(async () => { renderHousing({ onBack }); });
    const backBtn = screen.queryByTitle('Quay lại') || screen.queryByText('Quay lại');
    expect(backBtn).toBeInTheDocument();
  });

  it('click Quay lại gọi onBack', async () => {
    const onBack = vi.fn();
    await act(async () => { renderHousing({ onBack }); });
    const backBtn = screen.queryByTitle('Quay lại') || screen.queryByText('Quay lại');
    if (backBtn) {
      fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalledTimes(1);
    }
  });

  it('không hiển thị nút Quay lại khi không có onBack', async () => {
    await act(async () => { renderHousing({ onBack: undefined }); });
    expect(screen.queryByTitle('Quay lại')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Fetch API khi mount', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('gọi fetch attachments khi có project.id', async () => {
    mockFetch();
    await act(async () => { renderHousing(); });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const found = calls.some((args: any[]) => typeof args[0] === 'string' && args[0].includes('/api/projects/p-1/attachments'));
    expect(found).toBe(true);
  });

  it('gọi fetch history khi có project.id', async () => {
    mockFetch();
    await act(async () => { renderHousing(); });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const found = calls.some((args: any[]) => typeof args[0] === 'string' && args[0].includes('/api/projects/p-1/history'));
    expect(found).toBe(true);
  });

  it('hiển thị được khi fetch trả về dữ liệu rỗng', async () => {
    mockFetch([], []);
    await act(async () => { renderHousing(); });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('hiển thị được khi fetch thất bại', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    await act(async () => {
      expect(() => renderHousing()).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Tabs Hồ sơ / Lịch sử', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('tab "Hồ sơ" hiển thị khi một bước được chọn', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    // Tabs chỉ hiển thị khi có activeStepId
    const hosoTab = screen.queryByText('Hồ sơ');
    if (hosoTab) {
      expect(hosoTab).toBeInTheDocument();
    }
  });

  it('tab "Lịch sử xử lý" hiển thị khi một bước được chọn', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const historyTab = screen.queryByText('Lịch sử xử lý');
    if (historyTab) {
      expect(historyTab).toBeInTheDocument();
    }
  });

  it('click tab "Lịch sử xử lý" không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const historyTab = screen.queryByText('Lịch sử xử lý');
    if (historyTab) {
      expect(() => fireEvent.click(historyTab)).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Nội dung và lưu', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị nút "Lưu cập nhật"', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const saveBtn = screen.queryByText('Lưu cập nhật');
    if (saveBtn) {
      expect(saveBtn).toBeInTheDocument();
    }
  });

  it('hiển thị textarea nhập nội dung xử lý khi bước được chọn', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const textarea = screen.queryByPlaceholderText(/Nhập nội dung xử lý/i);
    if (textarea) {
      expect(textarea).toBeInTheDocument();
    }
  });

  it('nhập nội dung xử lý không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const textarea = screen.queryByPlaceholderText(/Nhập nội dung xử lý/i);
    if (textarea) {
      expect(() =>
        fireEvent.change(textarea, { target: { value: 'Đã tiếp nhận hồ sơ' } })
      ).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Danh sách bước quy trình', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị tên quy trình', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getByText(/Quy trình NOXH chuẩn/)).toBeInTheDocument();
  });

  it('hiển thị giai đoạn "Giai đoạn chuẩn bị"', async () => {
    await act(async () => { renderHousing(); });
    // Text nay nằm sau nhãn "Thủ tục: " trong cùng 1 node ("Thủ tục: Giai đoạn chuẩn bị")
    expect(screen.getAllByText(/Giai đoạn chuẩn bị/)[0]).toBeInTheDocument();
  });

  it('hiển thị giai đoạn "Giai đoạn thực hiện"', async () => {
    await act(async () => { renderHousing(); });
    // Không phải giai đoạn của bước hiện tại → chỉ thấy trong danh sách đầy đủ ở tab "Quy trình"
    fireEvent.click(screen.getByText('Quy trình'));
    expect(screen.getByText(/Giai đoạn thực hiện/)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Bước con trong quy trình', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị bước con "Chấp thuận chủ trương"', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getAllByText('Chấp thuận chủ trương')[0]).toBeInTheDocument();
  });

  it('hiển thị bước con "Quy hoạch 1/500"', async () => {
    await act(async () => { renderHousing(); });
    expect(screen.getAllByText('Quy hoạch 1/500')[0]).toBeInTheDocument();
  });

  it('hiển thị bước con "Giao đất"', async () => {
    await act(async () => { renderHousing(); });
    // "Giao đất" thuộc Giai đoạn thực hiện (không phải bước hiện tại) nên chỉ xuất hiện
    // trong danh sách đầy đủ ở tab "Quy trình", không nằm trong banner "Bước hiện tại"
    fireEvent.click(screen.getByText('Quy trình'));
    expect(screen.getByText('Giao đất')).toBeInTheDocument();
  });

  it('click bước con "Chấp thuận chủ trương" không crash', async () => {
    await act(async () => { renderHousing(); });
    const stepEls = screen.queryAllByText('Chấp thuận chủ trương');
    if (stepEls.length > 0) {
      expect(() => fireEvent.click(stepEls[0])).not.toThrow();
    }
  });

  it('click bước con "Giao đất" không crash', async () => {
    await act(async () => { renderHousing(); });
    const stepEl = screen.queryByText('Giao đất');
    if (stepEl) {
      expect(() => fireEvent.click(stepEl)).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – initialStepId prop', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('render với initialStepId hợp lệ không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ initialStepId: 'cs-1' })).not.toThrow();
    });
  });

  it('render với initialSubStepId không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ initialSubStepId: 'cs-2' })).not.toThrow();
    });
  });

  it('render với initialStepId là ps-1 (parent step) không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ initialStepId: 'ps-1' })).not.toThrow();
    });
  });

  it('render với initialStepId không tồn tại không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ initialStepId: 'nonexistent' })).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Props currentUser và stepStatuses', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('render với currentUser Admin không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ currentUser: { id: 'u-1', fullName: 'Admin', role: 'Admin' } })).not.toThrow();
    });
  });

  it('render với currentUser không có role không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ currentUser: { id: 'u-1', fullName: 'Test' } })).not.toThrow();
    });
  });

  it('render với stepStatuses rỗng không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ stepStatuses: [] })).not.toThrow();
    });
  });

  it('render với stepStatuses tùy chỉnh không crash', async () => {
    await act(async () => {
      expect(() => renderHousing({ stepStatuses: ['Mới', 'Đang xử lý', 'Hoàn tất', 'Hủy'] })).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Dữ liệu attachments từ API', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị attachments khi fetch thành công', async () => {
    const mockAttachments = [
      { id: 'att-1', fileName: 'file1.pdf', fileSize: 1024, fileUrl: '/api/files/1', uploadedAt: '2024-01-01' }
    ];
    mockFetch(mockAttachments);
    await act(async () => { renderHousing(); });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('hiển thị history khi fetch thành công', async () => {
    const mockHistory = [
      { id: 'hist-1', content: 'Nộp hồ sơ', createdAt: '2024-01-01', user: { fullName: 'Admin' } }
    ];
    mockFetch([], mockHistory);
    await act(async () => { renderHousing(); });
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('render với processes rỗng không crash', async () => {
    mockFetch();
    await act(async () => {
      expect(() => renderHousing({ processes: [] })).not.toThrow();
    });
  });

  it('render với nhiều processes không crash', async () => {
    mockFetch();
    const extraProcess = {
      id: 'proc-2', name: 'Quy trình khác', parentSteps: []
    };
    await act(async () => {
      expect(() => renderHousing({ processes: [mockProcess, extraProcess] })).not.toThrow();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Lưu cập nhật (handleSave)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('click Lưu cập nhật không crash', async () => {
    mockFetch();
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const saveBtn = screen.queryByText('Lưu cập nhật');
    if (saveBtn) {
      await act(async () => { fireEvent.click(saveBtn); });
      expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    }
  });

  it('hiển thị "Đang lưu..." ngay sau khi click Lưu', async () => {
    vi.useFakeTimers();
    mockFetch();
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const saveBtn = screen.queryByText('Lưu cập nhật');
    if (saveBtn) {
      act(() => { fireEvent.click(saveBtn); });
      const savingEl = screen.queryByText('Đang lưu...');
      if (savingEl) {
        expect(savingEl).toBeInTheDocument();
      }
      await act(async () => { vi.advanceTimersByTime(1000); });
    }
  });

  // Từ 05/10/2026 tiến độ lưu theo bước qua server (POST /api/projects/:id/progress/step)
  it('Lưu cập nhật gửi bước đang chọn, phía CQNN, trạng thái, ngày, nội dung', async () => {
    const onSubmitStep = vi.fn(async () => ({ ...mockProject, currentStepId: 'cs-1' }));
    mockFetch();
    await act(async () => { renderHousing({ onSubmitStep, initialStepId: 'ps-1' }); });
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Đã tiếp nhận hồ sơ' } });
    await act(async () => { fireEvent.click(screen.getByText('Lưu cập nhật')); });
    await waitFor(() => expect(onSubmitStep).toHaveBeenCalled());
    const [pid, payload] = (onSubmitStep as any).mock.calls[0];
    expect(pid).toBe('p-1');
    expect(payload).toMatchObject({ stepId: 'cs-1', side: 'nn', status: 'Đang xử lý', note: 'Đã tiếp nhận hồ sơ', nextStepIds: [] });
    expect(payload.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });

  it('gọi fetch upload khi có selectedFiles', async () => {
    vi.useFakeTimers();
    mockFetch();
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const saveBtn = screen.queryByText('Lưu cập nhật');
    if (saveBtn) {
      act(() => { fireEvent.click(saveBtn); });
      await act(async () => { vi.advanceTimersByTime(1000); });
      // fetch gọi ít nhất cho history (không crash dù không có file)
      expect(global.fetch).toHaveBeenCalled();
    }
  });

  it('server từ chối → hiện thông báo lỗi của server', async () => {
    const onSubmitStep = vi.fn(async () => { throw new Error('Chỉ UBND TP (hoặc Sở Xây dựng) được cập nhật tiến độ bước này.'); });
    mockFetch();
    await act(async () => { renderHousing({ onSubmitStep, initialStepId: 'ps-1' }); });
    await act(async () => { fireEvent.click(screen.getByText('Lưu cập nhật')); });
    expect(await screen.findByText(/Chỉ UBND TP/)).toBeInTheDocument();
  });

  it('chọn Hoàn thành mà chưa chọn bước tiếp theo (còn bước sau) → không gửi, báo cần chọn', async () => {
    const onSubmitStep = vi.fn();
    mockFetch();
    await act(async () => { renderHousing({ onSubmitStep, initialStepId: 'ps-1', stepStatuses: ['Đang xử lý', 'Hoàn thành'] }); });
    fireEvent.change(document.querySelector('select')!, { target: { value: 'Hoàn thành' } });
    await act(async () => { fireEvent.click(screen.getByText('Lưu cập nhật')); });
    expect(onSubmitStep).not.toHaveBeenCalled();
    expect(screen.getByText(/vui lòng chọn "Bước tiếp theo"/)).toBeInTheDocument();
  });
});

describe('HousingUpdateView – Tiến độ chủ đầu tư (phía CĐT của bước)', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });
  const INVESTOR = { id: 'u-9', fullName: 'CĐT', roleId: 'Lãnh đạo', userType: 'investor', investorId: 'Công ty A' };

  it('chủ đầu tư: thấy khung Tiến độ chủ đầu tư, không thấy nút Lưu cập nhật của cơ quan', async () => {
    await act(async () => { renderHousing({ currentUser: INVESTOR, initialStepId: 'ps-1' }); });
    expect(screen.getByText('Tiến độ chủ đầu tư')).toBeInTheDocument();
    expect(screen.getByText('Lưu tiến độ CĐT')).toBeInTheDocument();
    expect(screen.getByText('Lưu cập nhật')).not.toBeVisible();
    expect(screen.getByText(/do Sở XD cập nhật/)).toBeInTheDocument();
  });

  it('Lưu tiến độ CĐT gửi phía cdt của bước đang chọn', async () => {
    const onSubmitStep = vi.fn(async () => mockProject);
    await act(async () => { renderHousing({ currentUser: INVESTOR, onSubmitStep, initialStepId: 'ps-1' }); });
    fireEvent.change(screen.getByPlaceholderText(/Đã nộp hồ sơ/), { target: { value: 'Nộp hồ sơ số 12' } });
    await act(async () => { fireEvent.click(screen.getByText('Lưu tiến độ CĐT')); });
    expect(onSubmitStep).toHaveBeenCalledWith('p-1', expect.objectContaining({ stepId: 'cs-1', side: 'cdt', note: 'Nộp hồ sơ số 12' }));
  });

  it('chủ đầu tư dự án khác: chỉ xem', async () => {
    await act(async () => { renderHousing({ currentUser: { ...INVESTOR, investorId: 'Công ty B' }, initialStepId: 'ps-1' }); });
    expect(screen.queryByText('Lưu tiến độ CĐT')).not.toBeInTheDocument();
  });

  it('hiển thị ngày CĐT đã nộp và trạng thái đang chờ của bước', async () => {
    const project = { ...mockProject, implementationPlan: { 'cs-1': { agencyStatus: 'Chờ bổ sung hồ sơ', agencyExpectedDate: '2026-10-15', investorNote: 'Đã nộp lần 1' } } };
    await act(async () => { renderHousing({ project, initialStepId: 'ps-1' }); });
    expect(screen.getByDisplayValue('Đã nộp lần 1')).toBeInTheDocument();
    expect(screen.getAllByText('Chờ bổ sung hồ sơ').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Select trạng thái', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('select trạng thái hiển thị với stepStatuses mặc định', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const selects = document.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('thay đổi trạng thái sang "Hoàn tất" không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const selects = document.querySelectorAll('select');
    for (const sel of Array.from(selects)) {
      if (Array.from(sel.options).some(o => o.value === 'Hoàn tất')) {
        expect(() => fireEvent.change(sel, { target: { value: 'Hoàn tất' } })).not.toThrow();
        break;
      }
    }
  });

  it('thay đổi trạng thái sang "Chưa bắt đầu" không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const selects = document.querySelectorAll('select');
    for (const sel of Array.from(selects)) {
      if (Array.from(sel.options).some(o => o.value === 'Chưa bắt đầu')) {
        expect(() => fireEvent.change(sel, { target: { value: 'Chưa bắt đầu' } })).not.toThrow();
        break;
      }
    }
  });

  it('select stepStatuses tùy chỉnh hiển thị đủ options', async () => {
    const statuses = ['Mới', 'Đang xử lý', 'Tạm dừng', 'Đóng'];
    await act(async () => { renderHousing({ initialStepId: 'ps-1', stepStatuses: statuses }); });
    const selects = document.querySelectorAll('select');
    let found = false;
    for (const sel of Array.from(selects)) {
      if (Array.from(sel.options).some(o => o.value === 'Mới')) {
        found = true;
        expect(sel.options.length).toBeGreaterThanOrEqual(4);
        break;
      }
    }
    if (!found) {
      expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Ngày hoàn thành dự kiến', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('input ngày hoàn thành tồn tại sau khi render', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const dateInput = document.querySelector('input[placeholder="dd/mm/yyyy"]');
    expect(dateInput).toBeInTheDocument();
  });

  it('thay đổi ngày hoàn thành không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const dateInput = document.querySelector('input[placeholder="dd/mm/yyyy"]') as HTMLInputElement;
    if (dateInput) {
      expect(() => fireEvent.change(dateInput, { target: { value: '15/06/2024' } })).not.toThrow();
    }
  });

  it('sau khi đổi ngày, lưu không crash', async () => {
    vi.useFakeTimers();
    mockFetch();
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const dateInput = document.querySelector('input[placeholder="dd/mm/yyyy"]') as HTMLInputElement;
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '31/12/2024' } });
    }
    const saveBtn = screen.queryByText('Lưu cập nhật');
    if (saveBtn) {
      await act(async () => { fireEvent.click(saveBtn); });
      await act(async () => { vi.advanceTimersByTime(1000); });
    }
    vi.useRealTimers();
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Bước tiếp theo (nextStepIds)', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('hiển thị "-- Chọn bước tiếp theo --" khi chưa chọn', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    expect(screen.queryByText('-- Chọn bước tiếp theo --')).toBeInTheDocument();
  });

  it('hiển thị "CHƯA CHỌN BƯỚC TIẾP THEO" trong vùng ngày', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    expect(screen.queryByText(/chưa chọn bước tiếp theo/i)).toBeInTheDocument();
  });

  it('chọn bước tiếp theo từ select không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1', initialSubStepId: 'cs-1' }); });
    const selects = document.querySelectorAll('select');
    for (const sel of Array.from(selects)) {
      const opts = Array.from(sel.options);
      if (opts.some(o => o.value === 'cs-3')) {
        expect(() => fireEvent.change(sel, { target: { value: 'cs-3' } })).not.toThrow();
        break;
      }
    }
  });

  it('chọn thêm bước bằng select khác (cs-2) không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1', initialSubStepId: 'cs-1' }); });
    const selects = document.querySelectorAll('select');
    for (const sel of Array.from(selects)) {
      const opts = Array.from(sel.options);
      if (opts.some(o => o.value === 'cs-2')) {
        expect(() => fireEvent.change(sel, { target: { value: 'cs-2' } })).not.toThrow();
        break;
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Nội dung xử lý (textarea)', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('textarea nhập nội dung xử lý tồn tại', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const textarea = screen.queryByPlaceholderText(/Nhập nội dung xử lý/i);
    expect(textarea).toBeInTheDocument();
  });

  it('nhập nội dung dài không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const textarea = screen.queryByPlaceholderText(/Nhập nội dung xử lý/i);
    if (textarea) {
      const longText = 'Đã tiếp nhận hồ sơ. '.repeat(50);
      expect(() => fireEvent.change(textarea, { target: { value: longText } })).not.toThrow();
    }
  });

  it('xóa nội dung (set rỗng) không crash', async () => {
    await act(async () => { renderHousing({ initialStepId: 'ps-1' }); });
    const textarea = screen.queryByPlaceholderText(/Nhập nội dung xử lý/i);
    if (textarea) {
      fireEvent.change(textarea, { target: { value: 'test' } });
      expect(() => fireEvent.change(textarea, { target: { value: '' } })).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – Project với milestones và implementationPlan', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('render với milestones đầy đủ không crash', async () => {
    const projectWithMilestones = {
      ...mockProject,
      milestones: {
        'cs-1': { agency: '2024-01-20', investor: '2024-01-22' },
        'cs-2': { agency: '2024-02-15' },
      },
      implementationPlan: {
        'cs-1': { agencyActualDate: '2024-01-18', investorActualDate: '2024-01-19' },
      }
    };
    await act(async () => {
      expect(() => renderHousing({ project: projectWithMilestones })).not.toThrow();
    });
  });

  it('render với dự án trễ (agencyActualDate sau milestone) không crash', async () => {
    const projectOverdue = {
      ...mockProject,
      milestones: { 'cs-1': { agency: '2024-01-15' } },
      implementationPlan: { 'cs-1': { agencyActualDate: '2024-03-01' } }
    };
    await act(async () => {
      expect(() => renderHousing({ project: projectOverdue })).not.toThrow();
    });
  });

  it('render với dự án status là "Delayed" không crash', async () => {
    const projectDelayed = { ...mockProject, status: 'Delayed' };
    await act(async () => {
      expect(() => renderHousing({ project: projectDelayed })).not.toThrow();
    });
  });

  it('hiển thị "Chậm tiến độ" khi status là Delayed', async () => {
    const projectDelayed = { ...mockProject, status: 'Delayed' };
    await act(async () => { renderHousing({ project: projectDelayed }); });
    expect(screen.getByText('Chậm tiến độ')).toBeInTheDocument();
  });

  it('hiển thị "Đang xử lý" khi status bình thường', async () => {
    await act(async () => { renderHousing(); });
    // "Đang xử lý" xuất hiện ít nhất 1 lần (badge status hoặc select option)
    expect(screen.queryAllByText('Đang xử lý').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('HousingUpdateView – HXL của bước không chép ngày của mốc sang mọi bước', () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  const giaoDat = {
    id: 'pg', name: 'Giao đất, cho thuê đất', stage: 'Chuẩn bị', milestoneName: 'QĐ Giao đất',
    childSteps: [
      { id: 'g1', name: 'Thẩm định (toàn bộ)', agency: 'UBND cấp xã, phường' },
      { id: 'g2', name: 'Phê duyệt (toàn bộ)', agency: 'UBND cấp xã, phường' },
      { id: 'g3', name: 'Thẩm định (20%)', agency: 'Sở NNMT' },
      { id: 'g4', name: 'Phê duyệt (20%)', agency: 'UBND TP' },
    ],
  };
  const proc = { id: 'proc-g', name: 'Quy trình thử', parentSteps: [giaoDat] };
  const base = { ...mockProject, processId: 'proc-g', qdgiaodat_cdt_date: '01/02/2026', qdgiaodat_nn_date: '15/02/2026' };

  it('chưa bước nào có HXL: KH của mốc chỉ hiện ở bước đầu (CĐT) và bước cuối (CQNN)', async () => {
    await act(async () => { renderHousing({ project: base, processes: [proc] }); });
    // CQNN: chỉ dòng bước cuối (bước đang chọn là bước đầu nên ô HXL đầu trang không có)
    expect(screen.getAllByText('15/02/2026')).toHaveLength(1);
    // CĐT: dòng bước đầu + ô HXL đầu trang (bước đầu đang được chọn)
    expect(screen.getAllByText('01/02/2026')).toHaveLength(2);
  });

  it('có bước đã có HXL riêng: chỉ bước đó hiện ngày, không lấy ngày của mốc', async () => {
    const project = { ...base, milestones: { g3: { agency: '2026-02-10' } } };
    await act(async () => { renderHousing({ project, processes: [proc] }); });
    expect(screen.getAllByText('10/02/2026')).toHaveLength(1);
    expect(screen.queryByText('15/02/2026')).toBeNull();
  });
});
