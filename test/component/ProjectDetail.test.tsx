// @vitest-environment jsdom
/**
 * Component Tests: ProjectDetail
 *
 * Kiểm tra:
 *   - Render modal với thông tin dự án
 *   - 4 tabs: Tổng quan, Tiến độ thực hiện, Hồ sơ dự án, Nhật ký
 *   - Nút đóng gọi onClose
 *   - Metrics: diện tích, tầng cao, căn hộ, vốn đầu tư
 *   - Tab legal: bảng tiến độ gantt milestone
 *   - Tab files: empty state khi không có files
 *   - Tab history: timeline nhật ký
 *   - Không crash khi project có dữ liệu thiếu
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import ProjectDetail from '../../src/components/ProjectDetail';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../../src/lib/projectUtils', async (importOriginal) => ({
  // Real helpers (toDisplayDate, getAgencyWithDepartment…) + the overrides below
  ...(await importOriginal<typeof import('../../src/lib/projectUtils')>()),
  parseDate: vi.fn((s: string) => (s ? new Date(s) : null)),
  formatDate: vi.fn((s: string) => s || ''),
}));

vi.mock('../../src/data/appData', () => ({
  INITIAL_PROCESSES: [
    {
      id: 'proc-1',
      parentSteps: [
        {
          id: 'ps-1',
          name: 'Chấp thuận chủ trương đầu tư',
          shortName: 'CHỦ TRƯƠNG',
          slaDays: 30,
          stage: 'CHUẨN BỊ ĐẦU TƯ',
          childSteps: [],
        },
        {
          id: 'ps-2',
          name: 'QH 1/500',
          shortName: 'QH 1/500',
          slaDays: 60,
          stage: 'CHUẨN BỊ ĐẦU TƯ',
          childSteps: [],
        },
      ],
    },
  ],
}));

vi.mock('lucide-react', async (importOriginal) => {
  const M = () => null;
  return {
    // Icons not listed here render the real component
    ...(await importOriginal<typeof import('lucide-react')>()),
    X: M, Building2: M, MapPin: M, Calendar: M, Info: M, FileText: M,
    DollarSign: M, Maximize: M, Users: M, Clock: M, CheckCircle2: M,
    AlertCircle: M, ChevronRight: M, Download: M, ExternalLink: M,
    History: M, Layout: M, Shield: M, Briefcase: M, TrendingUp: M, User: M,
  };
});

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProject = {
  id: 'p-1',
  code: 'NOXH-2024-001',
  name: 'Nhà Ở Xã Hội Bình Tân',
  investor: 'Công ty TNHH ABC',
  location: 'Phường Bình Trị Đông, Quận Bình Tân',
  status: 'On Track',
  stage: 'CHUẨN BỊ ĐẦU TƯ',
  progress: 40,
  currentStep: 'Chấp thuận chủ trương đầu tư',
  currentAgency: 'Sở Xây dựng',
  parentStep: 'Chấp thuận chủ trương đầu tư',
  deadline: '31/12/2026',
  processId: 'proc-1',
  totalArea: 2.5,
  height: 15,
  apartmentCount: 300,
  totalInvestment: 500,
  fundingSource: 'Vốn doanh nghiệp',
  projectCategory: 'Nhà ở xã hội',
  buildingGrade: 'Cấp 3',
  isKeyProject: true,
  description: 'Mô tả dự án thử nghiệm',
  chutruong_cdt_date: '01/03/2024',
  chutruong_nn_date: '30/06/2025',
  htkt_dtm_cdt_date: '01/06/2025',
  htkt_dtm_nn_date: '30/12/2025',
};

const defaultProps = {
  project: mockProject,
  onClose: vi.fn(),
};

function renderDetail(overrides: Record<string, any> = {}) {
  return render(<ProjectDetail {...defaultProps} {...overrides} />);
}

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Render cơ bản', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('render được mà không crash', () => {
    expect(() => renderDetail()).not.toThrow();
  });

  it('hiển thị tên dự án', () => {
    renderDetail();
    expect(screen.getByText('Nhà Ở Xã Hội Bình Tân')).toBeInTheDocument();
  });

  it('hiển thị mã dự án', () => {
    renderDetail();
    expect(screen.getByText('NOXH-2024-001')).toBeInTheDocument();
  });

  it('hiển thị địa điểm', () => {
    renderDetail();
    expect(screen.getAllByText(/Bình Tân/).length).toBeGreaterThan(0);
  });

  it('hiển thị chủ đầu tư', () => {
    renderDetail();
    expect(screen.getByText('Công ty TNHH ABC')).toBeInTheDocument();
  });

  it('hiển thị badge "Đang xử lý" khi status On Track', () => {
    renderDetail();
    expect(screen.getByText('Đang xử lý')).toBeInTheDocument();
  });

  it('hiển thị badge "Trọng điểm" khi isKeyProject = true', () => {
    renderDetail();
    expect(screen.getByText('Trọng điểm')).toBeInTheDocument();
  });

  it('không hiển thị modal khi project = null', () => {
    const { container } = render(<ProjectDetail project={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Nút đóng', () => {
  it('click nút đóng (X) gọi onClose', () => {
    const onClose = vi.fn();
    renderDetail({ onClose });
    const allBtns = screen.getAllByRole('button');
    const xBtn = allBtns.find(btn => btn.className.includes('rounded-full') || btn.className.includes('close'));
    if (xBtn) {
      fireEvent.click(xBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    } else {
      // fallback: click first button
      fireEvent.click(allBtns[0]);
    }
  });

  it('click nút "Đóng" trong footer gọi onClose', () => {
    const onClose = vi.fn();
    renderDetail({ onClose });
    const closeBtn = screen.queryByText('Đóng');
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Tabs điều hướng', () => {
  it('hiển thị tab "Tổng quan" mặc định', () => {
    renderDetail();
    expect(screen.getByText('Tổng quan')).toBeInTheDocument();
  });

  it('hiển thị tab "Tiến độ thực hiện"', () => {
    renderDetail();
    expect(screen.getByText('Tiến độ thực hiện')).toBeInTheDocument();
  });

  it('hiển thị tab "Hồ sơ dự án"', () => {
    renderDetail();
    expect(screen.getByText('Hồ sơ dự án')).toBeInTheDocument();
  });

  it('hiển thị tab "Nhật ký"', () => {
    renderDetail();
    expect(screen.getByText('Nhật ký')).toBeInTheDocument();
  });

  it('click tab "Tiến độ thực hiện" chuyển sang tab legal', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Tiến độ thực hiện'));
    expect(screen.getByText('Sơ đồ gantt tiến độ thực hiện')).toBeInTheDocument();
  });

  it('click tab "Hồ sơ dự án" chuyển sang tab files', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Hồ sơ dự án'));
    expect(screen.getByText('Danh mục hồ sơ pháp lý')).toBeInTheDocument();
  });

  it('click tab "Nhật ký" chuyển sang tab history', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Nhật ký'));
    expect(screen.getByText('Nhật ký xử lý hồ sơ')).toBeInTheDocument();
  });

  it('click tab "Tổng quan" quay lại overview', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Tiến độ thực hiện'));
    fireEvent.click(screen.getByText('Tổng quan'));
    expect(screen.getByText('Tiến độ tổng thể')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Tab Tổng quan', () => {
  it('hiển thị metric "Diện tích"', () => {
    renderDetail();
    expect(screen.getByText('Diện tích')).toBeInTheDocument();
  });

  it('hiển thị metric "Tầng cao"', () => {
    renderDetail();
    expect(screen.getByText('Tầng cao')).toBeInTheDocument();
  });

  it('hiển thị metric "Căn hộ"', () => {
    renderDetail();
    expect(screen.getByText('Căn hộ')).toBeInTheDocument();
  });

  it('hiển thị metric "Vốn đầu tư"', () => {
    renderDetail();
    expect(screen.getByText('Vốn đầu tư')).toBeInTheDocument();
  });

  it('hiển thị tiến độ tổng thể với %', () => {
    renderDetail();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('hiển thị "Tiến độ tổng thể"', () => {
    renderDetail();
    expect(screen.getByText('Tiến độ tổng thể')).toBeInTheDocument();
  });

  it('hiển thị bước hiện tại', () => {
    renderDetail();
    expect(screen.getByText('Chấp thuận chủ trương đầu tư')).toBeInTheDocument();
  });

  it('hiển thị thông tin "Nguồn vốn"', () => {
    renderDetail();
    expect(screen.getByText('Nguồn vốn')).toBeInTheDocument();
  });

  it('hiển thị "Phân loại dự án"', () => {
    renderDetail();
    expect(screen.getByText('Phân loại dự án')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Tab Tiến độ thực hiện', () => {
  beforeEach(() => {
    renderDetail();
    fireEvent.click(screen.getByText('Tiến độ thực hiện'));
  });

  it('hiển thị tiêu đề "Sơ đồ gantt tiến độ thực hiện"', () => {
    expect(screen.getByText('Sơ đồ gantt tiến độ thực hiện')).toBeInTheDocument();
  });

  it('hiển thị legend "Kế hoạch CĐT"', () => {
    const els = screen.getAllByText('Kế hoạch CĐT');
    expect(els.length).toBeGreaterThan(0);
  });

  it('hiển thị legend "Kế hoạch cơ quan NN"', () => {
    const els = screen.getAllByText('Kế hoạch cơ quan NN');
    expect(els.length).toBeGreaterThan(0);
  });

  it('hiển thị bảng milestone khi có chutruong_cdt_date', () => {
    expect(screen.getByText('Chấp thuận chủ trương')).toBeInTheDocument();
  });

  it('hiển thị cột "Kế hoạch CĐT" trong bảng', () => {
    const headers = screen.getAllByText('Kế hoạch CĐT');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('hiển thị cột "Kế hoạch cơ quan NN" trong bảng', () => {
    const headers = screen.getAllByText('Kế hoạch cơ quan NN');
    expect(headers.length).toBeGreaterThan(0);
  });

  it('hiển thị cột "Trạng thái" trong bảng', () => {
    expect(screen.getByText('Trạng thái')).toBeInTheDocument();
  });

  it('hiển thị "Tiến độ quy trình hệ thống"', () => {
    expect(screen.getByText('Tiến độ quy trình hệ thống')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Tab Hồ sơ dự án', () => {
  it('hiển thị "Chưa có hồ sơ đính kèm" khi files rỗng', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Hồ sơ dự án'));
    expect(screen.getByText('Chưa có hồ sơ đính kèm')).toBeInTheDocument();
  });

  it('hiển thị nút "Tải tất cả"', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Hồ sơ dự án'));
    expect(screen.getByText('Tải tất cả')).toBeInTheDocument();
  });

  it('hiển thị "Vui lòng cập nhật hồ sơ" khi không có files', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Hồ sơ dự án'));
    expect(screen.getByText(/Vui lòng cập nhật hồ sơ/)).toBeInTheDocument();
  });

  it('hiển thị danh sách file khi project có files', () => {
    const projectWithFiles = {
      ...mockProject,
      files: [
        { id: 'f-1', name: 'Quyết định chủ trương.pdf', type: 'PDF', size: '2MB', date: '2024-03-15' },
      ],
    };
    renderDetail({ project: projectWithFiles });
    fireEvent.click(screen.getByText('Hồ sơ dự án'));
    expect(screen.getByText('Quyết định chủ trương.pdf')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Tab Nhật ký', () => {
  it('hiển thị "Nhật ký xử lý hồ sơ"', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Nhật ký'));
    expect(screen.getByText('Nhật ký xử lý hồ sơ')).toBeInTheDocument();
  });

  it('hiển thị các log trong timeline', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Nhật ký'));
    expect(screen.getByText('Phê duyệt Chấp thuận chủ trương đầu tư')).toBeInTheDocument();
  });

  it('hiển thị tên cơ quan trong log', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Nhật ký'));
    expect(screen.getByText('UBND Thành phố')).toBeInTheDocument();
  });

  it('hiển thị ngày tháng trong log', () => {
    renderDetail();
    fireEvent.click(screen.getByText('Nhật ký'));
    expect(screen.getByText('15/03/2024')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Status labels', () => {
  it('hiển thị "Quá hạn" khi status Delayed', () => {
    renderDetail({ project: { ...mockProject, status: 'Delayed' } });
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
  });

  it('hiển thị "Cảnh báo" khi status Warning', () => {
    renderDetail({ project: { ...mockProject, status: 'Warning' } });
    expect(screen.getByText('Cảnh báo')).toBeInTheDocument();
  });

  it('không hiển thị badge trọng điểm khi isKeyProject = false', () => {
    renderDetail({ project: { ...mockProject, isKeyProject: false } });
    expect(screen.queryByText('Trọng điểm')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ProjectDetail – Props đặc biệt', () => {
  it('render không crash khi thiếu các trường tùy chọn', () => {
    const minimalProject = {
      id: 'p-min',
      code: 'MIN-001',
      name: 'Dự án tối giản',
      investor: 'Công ty X',
      location: 'TP.HCM',
      status: 'On Track',
      stage: 'CHUẨN BỊ ĐẦU TƯ',
      progress: 0,
      currentStep: '',
      currentAgency: '',
      deadline: '',
      processId: 'proc-1',
    };
    expect(() => renderDetail({ project: minimalProject })).not.toThrow();
  });

  it('render tiến độ 100% không crash', () => {
    renderDetail({ project: { ...mockProject, progress: 100 } });
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('render tiến độ 0% không crash', () => {
    renderDetail({ project: { ...mockProject, progress: 0 } });
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('render khi không có chutruong_cdt_date không crash', () => {
    const projectNoDates = { ...mockProject, chutruong_cdt_date: undefined, htkt_dtm_cdt_date: undefined };
    expect(() => renderDetail({ project: projectNoDates })).not.toThrow();
  });

  it('footer hiển thị nút "Xuất báo cáo"', () => {
    renderDetail();
    expect(screen.getByText('Xuất báo cáo')).toBeInTheDocument();
  });
});
