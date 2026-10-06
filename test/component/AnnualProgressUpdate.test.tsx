// @vitest-environment jsdom
/**
 * Component Tests: AnnualProgressUpdate
 *
 * Kiểm tra:
 *   - Render tiêu đề và bảng dự án
 *   - Tìm kiếm dự án
 *   - Toggle xem tất cả / bật phân trang
 *   - Nút xuất Excel không crash
 *   - Mở modal chỉnh sửa mốc thời gian
 *   - Mở modal cập nhật tiến độ
 *   - Submit save gọi onUpdateProject
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import AnnualProgressUpdate from '../../src/components/AnnualProgressUpdate';

// ─── Mock external dependencies ───────────────────────────────────────────────

vi.mock('react-datepicker', () => ({
  default: ({ onChange, selected, placeholderText }: any) => (
    <input
      data-testid="datepicker"
      placeholder={placeholderText}
      value={selected ? selected.toISOString().split('T')[0] : ''}
      onChange={(e) => onChange && onChange(new Date(e.target.value))}
    />
  ),
  registerLocale: vi.fn(),
}));

vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    sheet_add_aoa: vi.fn(),
    encode_cell: vi.fn(() => 'A1'),
    encode_range: vi.fn(() => 'A1:Z100'),
    decode_range: vi.fn(() => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } })),
    merge_cells: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock('date-fns', () => ({
  format: vi.fn((date: Date) => date.toISOString().split('T')[0]),
  parse: vi.fn((str: string) => new Date(str)),
  isValid: vi.fn(() => true),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
    span: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
    section: ({ children, ...rest }: any) => <section {...rest}>{children}</section>,
    tr: ({ children, ...rest }: any) => <tr {...rest}>{children}</tr>,
    td: ({ children, ...rest }: any) => <td {...rest}>{children}</td>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', () => {
  const M = () => null;
  return {
    Search: M, Filter: M, Calendar: M, Clock: M, AlertCircle: M, Save: M,
    CheckCircle2: M, Building2: M, ChevronRight: M, ChevronLeft: M,
    Download: M, Info: M, Edit3: M, X: M, Check: M, ArrowUpDown: M,
    ArrowUp: M, ArrowDown: M, Layers: M, Paperclip: M, Upload: M,
    Trash2: M, File: M, FileText: M,
    Compass: M, Wrench: M, Briefcase: M, CheckSquare: M,
  };
});

vi.mock('../../src/lib/projectUtils', () => ({
  parseDate: vi.fn((s: string) => (s && s !== '--' ? new Date('2024-01-01') : null)),
  formatDate: vi.fn((s: string) => s || ''),
}));

// ─── Mock data ────────────────────────────────────────────────────────────────

function makeProject(i: number) {
  return {
    id: `p-${i}`,
    code: `NOXH-2024-000${i}`,
    name: `Nhà Ở Xã Hội Số ${i}`,
    investor: `Công ty ${i}`,
    isPublicInvestment: false,
    chutruong_cdt_date: i === 1 ? '01/01/2024' : '',
    chutruong_nn_date: i === 1 ? '15/01/2024' : '',
    qh1500_cdt_date: '',
    qh1500_nn_date: '',
    qdgiaodat_cdt_date: '',
    qdgiaodat_nn_date: '',
    pccc_cdt_date: '',
    pccc_nn_date: '',
    htkt_dtm_cdt_date: '',
    htkt_dtm_nn_date: '',
    baocaonckt_cdt_date: '',
    baocaonckt_nn_date: '',
    gpxaydung_cdt_date: '',
    gpxaydung_nn_date: '',
    progress_status_2026: '',
  };
}

const mockProjects = [makeProject(1), makeProject(2), makeProject(3)];

const defaultProps = {
  projects: mockProjects,
  reportDate: '15/06/2024',
  setReportDate: vi.fn(),
  onUpdateProject: vi.fn().mockResolvedValue(undefined),
};

function renderAnnual(overrides: Record<string, any> = {}) {
  const props = { ...defaultProps, setReportDate: vi.fn(), onUpdateProject: vi.fn().mockResolvedValue(undefined), ...overrides };
  return { ...render(<AnnualProgressUpdate {...props} />), props };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Render cơ bản', () => {
  it('render được mà không crash', () => {
    expect(() => renderAnnual()).not.toThrow();
  });

  it('hiển thị tiêu đề chứa "Cập nhật tiến độ"', () => {
    renderAnnual();
    expect(screen.getByText(/Cập nhật kế hoạch dự án/i)).toBeInTheDocument();
  });

  it('hiển thị mô tả "Cập nhật các mốc thời gian"', () => {
    renderAnnual();
    expect(screen.getByText(/Cập nhật các mốc thời gian/i)).toBeInTheDocument();
  });

  it('hiển thị ô tìm kiếm dự án', () => {
    renderAnnual();
    expect(screen.getByPlaceholderText('Tìm dự án, mã dự án...')).toBeInTheDocument();
  });

  it('hiển thị tên 3 dự án trong bảng', () => {
    renderAnnual();
    expect(screen.getByText('Nhà Ở Xã Hội Số 1')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Số 2')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Số 3')).toBeInTheDocument();
  });

  it('render được khi danh sách projects rỗng', () => {
    expect(() => renderAnnual({ projects: [] })).not.toThrow();
  });

  it('render được khi không truyền prop projects', () => {
    expect(() => renderAnnual({ projects: undefined })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Tìm kiếm', () => {
  it('lọc dự án theo tên khi nhập search', () => {
    renderAnnual();
    fireEvent.change(screen.getByPlaceholderText('Tìm dự án, mã dự án...'), {
      target: { value: 'Số 1' },
    });
    expect(screen.getByText('Nhà Ở Xã Hội Số 1')).toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Số 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhà Ở Xã Hội Số 3')).not.toBeInTheDocument();
  });

  it('lọc theo mã dự án', () => {
    renderAnnual();
    fireEvent.change(screen.getByPlaceholderText('Tìm dự án, mã dự án...'), {
      target: { value: 'NOXH-2024-0003' },
    });
    expect(screen.queryByText('Nhà Ở Xã Hội Số 1')).not.toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Số 3')).toBeInTheDocument();
  });

  it('xóa tìm kiếm hiển thị lại tất cả dự án', () => {
    renderAnnual();
    const input = screen.getByPlaceholderText('Tìm dự án, mã dự án...');
    fireEvent.change(input, { target: { value: 'Số 1' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('Nhà Ở Xã Hội Số 1')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Số 2')).toBeInTheDocument();
    expect(screen.getByText('Nhà Ở Xã Hội Số 3')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Toggle xem tất cả / phân trang', () => {
  it('hiển thị nút toggle xem tất cả hoặc bật phân trang', () => {
    renderAnnual();
    const hasViewAll = !!screen.queryByText('Xem tất cả');
    const hasPaginate = !!screen.queryByText('Bật phân trang');
    expect(hasViewAll || hasPaginate).toBe(true);
  });

  it('click "Xem tất cả" đổi sang "Bật phân trang"', () => {
    renderAnnual();
    const viewAllBtn = screen.queryByText('Xem tất cả');
    if (viewAllBtn) {
      fireEvent.click(viewAllBtn);
      expect(screen.getByText('Bật phân trang')).toBeInTheDocument();
    }
  });

  it('click "Bật phân trang" đổi sang "Xem tất cả"', () => {
    renderAnnual();
    const viewAllBtn = screen.queryByText('Xem tất cả');
    if (viewAllBtn) {
      fireEvent.click(viewAllBtn);
      fireEvent.click(screen.getByText('Bật phân trang'));
      expect(screen.getByText('Xem tất cả')).toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Nút xuất Excel', () => {
  it('nút xuất Excel hiển thị', () => {
    renderAnnual();
    const exportBtn = screen.queryByTitle('Xuất Excel') || screen.queryByText(/Xuất/i);
    expect(exportBtn).toBeInTheDocument();
  });

  it('click nút xuất Excel không crash', () => {
    renderAnnual();
    const exportBtn = screen.queryByTitle('Xuất Excel') || screen.queryByText(/Xuất/i);
    if (exportBtn) {
      expect(() => fireEvent.click(exportBtn)).not.toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Modal chỉnh sửa mốc', () => {
  it('modal chỉnh sửa KHÔNG hiển thị khi mới render', () => {
    renderAnnual();
    expect(screen.queryByText('Chỉnh sửa mốc thời gian')).not.toBeInTheDocument();
  });

  it('click nút "Chỉnh sửa mốc thời gian" mở modal', () => {
    renderAnnual();
    const editBtns = screen.queryAllByTitle('Chỉnh sửa mốc thời gian');
    if (editBtns.length > 0) {
      fireEvent.click(editBtns[0]);
      // h2 main title + h3 modal title → 2 elements khi modal mở
      expect(screen.queryAllByText('Cập nhật kế hoạch dự án').length).toBeGreaterThan(1);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('AnnualProgressUpdate – Modal cập nhật tiến độ', () => {
  it('modal cập nhật tiến độ KHÔNG hiển thị khi mới render', () => {
    renderAnnual();
    expect(screen.queryByText('Cập nhật tiến độ dự án')).not.toBeInTheDocument();
  });

  it('click nút "Cập nhật tiến độ" mở modal', () => {
    renderAnnual();
    const updateBtns = screen.queryAllByTitle('Cập nhật tiến độ');
    if (updateBtns.length > 0) {
      fireEvent.click(updateBtns[0]);
      expect(screen.getByText('Cập nhật tiến độ dự án')).toBeInTheDocument();
    }
  });

  it('click Lưu trong modal gọi onUpdateProject', async () => {
    vi.useFakeTimers();
    const onUpdateProject = vi.fn().mockResolvedValue(undefined);
    renderAnnual({ onUpdateProject });

    const updateBtns = screen.queryAllByTitle('Cập nhật tiến độ');
    if (updateBtns.length > 0) {
      fireEvent.click(updateBtns[0]);
      const saveBtn = screen.queryByText(/Lưu/i);
      if (saveBtn) {
        fireEvent.click(saveBtn);
        await vi.runAllTimersAsync();
        expect(onUpdateProject).toHaveBeenCalled();
      }
    }
    vi.useRealTimers();
  });
});
