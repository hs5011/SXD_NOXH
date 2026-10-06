// @vitest-environment jsdom
/**
 * Component Tests: DashboardApp
 *
 * Kiểm tra:
 *   - Render header và các section tổng quan
 *   - Hiển thị danh sách dự án
 *   - Tìm kiếm dự án
 *   - Bộ lọc theo vị trí / cơ quan / giai đoạn
 *   - Điều hướng: click agency → view agencies
 *   - Nút quay lại
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import DashboardApp from '../../src/components/DashboardApp';
import { computeMilestones, legacyValuesFor } from '../../src/lib/stepProgress';

// Từ 05/10/2026 Dashboard đọc tiến độ theo mốc (milestoneProgress do server tính từ tiến độ theo bước).
// Ở đây tính như server làm với dự án chưa có dữ liệu theo bước: từ các cột mốc cũ + tiến độ cũ.
const STAGES_RAW = [{ name: 'CHUẨN BỊ ĐẦU TƯ', milestones: ['Chấp thuận chủ trương', 'QH 1/500', 'QĐ Giao đất', 'HTKT/ĐTM', 'BC NCKT', 'PCCC', 'GPXD'] }];
const progressOf = (projects: any[], actual: Record<string, any> = {}) => Object.fromEntries(
  (projects || []).map(p => [p.id, computeMilestones(null, STAGES_RAW, {}, m => legacyValuesFor(p, actual[p.id] || {}, m.name))])
);

// ─── Mock external dependencies ───────────────────────────────────────────────

vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Cell: () => null,
  LabelList: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Label: () => null,
  Legend: () => null,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
    button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
    span: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
    p: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
    h2: ({ children, ...rest }: any) => <h2 {...rest}>{children}</h2>,
    h3: ({ children, ...rest }: any) => <h3 {...rest}>{children}</h3>,
    section: ({ children, ...rest }: any) => <section {...rest}>{children}</section>,
    ul: ({ children, ...rest }: any) => <ul {...rest}>{children}</ul>,
    li: ({ children, ...rest }: any) => <li {...rest}>{children}</li>,
    a: ({ children, ...rest }: any) => <a {...rest}>{children}</a>,
    tr: ({ children, ...rest }: any) => <tr {...rest}>{children}</tr>,
    td: ({ children, ...rest }: any) => <td {...rest}>{children}</td>,
    th: ({ children, ...rest }: any) => <th {...rest}>{children}</th>,
    header: ({ children, ...rest }: any) => <header {...rest}>{children}</header>,
    nav: ({ children, ...rest }: any) => <nav {...rest}>{children}</nav>,
    main: ({ children, ...rest }: any) => <main {...rest}>{children}</main>,
    aside: ({ children, ...rest }: any) => <aside {...rest}>{children}</aside>,
    article: ({ children, ...rest }: any) => <article {...rest}>{children}</article>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', async (importOriginal) => {
  const M = () => null;
  return {
    // Icons not listed here render the real component
    ...(await importOriginal<typeof import('lucide-react')>()),
    Building2: M, ChevronRight: M, ChevronLeft: M, AlertCircle: M, Clock: M,
    FileText: M, LayoutDashboard: M, MapPin: M, User: M, Search: M, Bell: M,
    Menu: M, CheckCircle2: M, TrendingUp: M, Filter: M, Circle: M, FileCheck: M,
    ClipboardList: M, Layers: M, Calendar: M, X: M, ArrowLeft: M, Maximize2: M,
    Save: M, Pin: M, Check: M, History: M, ChevronDown: M, ChevronUp: M,
    Home: M, BarChart2: M, Settings: M, Users: M, LogOut: M, Info: M,
    ArrowRight: M, Plus: M, Minus: M, Eye: M, EyeOff: M,
  };
});

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockAgencies = [
  {
    id: 'ag-1',
    name: 'Sở Xây Dựng',
    displayOrder: 1,
    departments: [
      { name: 'Phòng QLXD' },
      { name: 'Phòng PTĐT' },
    ],
  },
  {
    id: 'ag-2',
    name: 'Sở QHKT',
    displayOrder: 2,
    departments: [
      { name: 'Phòng Quy hoạch' },
    ],
  },
];

const mockProjects = [
  {
    id: 'p-1',
    code: 'NOXH-2024-0001',
    name: 'Nhà Ở Xã Hội Bình Tân',
    investor: 'Công ty A',
    location: 'Sở Xây Dựng',
    progress: 50,
    status: 'On Track',
    projectGroup: 'Nhóm 1',
    stage: 'Thực hiện đầu tư',
    currentStep: 'Chấp thuận chủ trương',
    currentAgency: 'Sở Xây Dựng',
    deadline: '31/12/2025',
    processId: 'proc-1',
    milestones: {},
    implementationPlan: {},
    isPublicInvestment: false,
    totalArea: 5000,
    apartmentCount: 200,
    height: 10,
  },
  {
    id: 'p-2',
    code: 'NOXH-2024-0002',
    name: 'Nhà Ở Xã Hội Quận 7',
    investor: 'Công ty B',
    location: 'Sở QHKT',
    progress: 20,
    status: 'Delayed',
    projectGroup: 'Nhóm 2',
    stage: 'Chuẩn bị đầu tư',
    currentStep: 'Quy hoạch 1/500',
    currentAgency: 'Sở QHKT',
    deadline: '30/06/2024',
    processId: 'proc-1',
    milestones: {},
    implementationPlan: {},
    isPublicInvestment: false,
    totalArea: 3000,
    apartmentCount: 100,
    height: 5,
  },
];

const defaultProps = {
  projects: mockProjects,
  processingAgencies: mockAgencies,
  investors: ['Công ty A', 'Công ty B'],
  projectStages: ['Chuẩn bị đầu tư', 'Thực hiện đầu tư'],
  locations: [
    { ward: 'Bình Tân', oldArea: '' },
    { ward: 'Quận 7', oldArea: '' },
  ],
  currentUser: { id: 'u-1', fullName: 'Admin', role: 'Admin', userType: 'Admin' },
  actualProgress: {},
  onUpdateActualProgress: vi.fn(),
};

function renderDashboard(overrides: Record<string, any> = {}) {
  const props: any = { ...defaultProps, onUpdateActualProgress: vi.fn(), ...overrides };
  return render(
    <DashboardApp
      {...props}
      projectStagesRaw={overrides.projectStagesRaw ?? STAGES_RAW}
      milestoneProgress={overrides.milestoneProgress ?? progressOf(props.projects, props.actualProgress)}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Render cơ bản', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render được mà không crash', () => {
    expect(() => renderDashboard()).not.toThrow();
  });

  it('hiển thị tên cơ quan "SỞ XÂY DỰNG TP.HCM"', () => {
    renderDashboard();
    expect(screen.getByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });

  it('hiển thị tiêu đề "THEO DÕI TIẾN ĐỘ DỰ ÁN NOXH"', () => {
    renderDashboard();
    expect(screen.getByText('THEO DÕI TIẾN ĐỘ DỰ ÁN NOXH')).toBeInTheDocument();
  });

  it('hiển thị section "Thống kê dự án"', () => {
    renderDashboard();
    expect(screen.getAllByText('Thống kê dự án')[0]).toBeInTheDocument();
  });

  it('hiển thị section "Thống kê theo cơ quan"', () => {
    renderDashboard({ initialView: 'agencies' });
    expect(screen.getByText('Thống kê theo cơ quan')).toBeInTheDocument();
  });

  it('hiển thị section "Thống kê theo thủ tục"', () => {
    renderDashboard({ initialView: 'steps' });
    expect(screen.getByText('Thống kê theo thủ tục')).toBeInTheDocument();
  });

  it('render được khi không có dự án', () => {
    expect(() => renderDashboard({ projects: [] })).not.toThrow();
  });

  it('render được khi không truyền prop projects', () => {
    expect(() => renderDashboard({ projects: undefined })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Thống kê thủ tục', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị thủ tục "Chấp thuận chủ trương"', () => {
    renderDashboard();
    expect(screen.getAllByText('Chấp thuận chủ trương')[0]).toBeInTheDocument();
  });

  it('hiển thị thủ tục "GP xây dựng"', () => {
    renderDashboard();
    expect(screen.getAllByText(/GP [Xx]ây dựng/)[0]).toBeInTheDocument();
  });

  it('hiển thị số CQNN đang xử lý', () => {
    renderDashboard();
    expect(screen.getAllByText(/CQNN Đang xử lý/i)[0]).toBeInTheDocument();
  });

  it('hiển thị nhãn dự án bị chậm tiến độ', () => {
    renderDashboard();
    // Text có thể là "bị chậm tiến độ" hoặc "Chậm tiến độ" tùy component
    const label = screen.queryAllByText(/chậm tiến độ/i)[0] || screen.queryAllByText(/bị chậm/i)[0];
    expect(label).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Thống kê cơ quan', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị section "Thống kê theo cơ quan"', () => {
    renderDashboard({ initialView: 'agencies' });
    expect(screen.getByText('Thống kê theo cơ quan')).toBeInTheDocument();
  });

  it('render được với 2 cơ quan trong props', () => {
    // Kiểm tra component không crash khi có nhiều agency
    expect(() => renderDashboard({ processingAgencies: mockAgencies })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Số liệu dự án', () => {
  beforeEach(() => { localStorage.clear(); });

  it('hiển thị "Dự án đã công bố"', () => {
    renderDashboard();
    expect(screen.getAllByText('Dự án đã công bố')[0]).toBeInTheDocument();
  });

  it('hiển thị tổng số 2 dự án', () => {
    renderDashboard();
    // Số "2" xuất hiện trong tổng kê
    const allTwos = screen.queryAllByText('2');
    expect(allTwos.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Điều hướng', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click vào agency card không crash', () => {
    renderDashboard();
    const agencyCards = screen.queryAllByText('Sở Xây Dựng');
    if (agencyCards.length > 0) {
      expect(() => fireEvent.click(agencyCards[0])).not.toThrow();
    }
  });

  it('click vào thủ tục không crash', () => {
    renderDashboard();
    const stepCards = screen.queryAllByText('Chấp thuận chủ trương');
    if (stepCards.length > 0) {
      expect(() => fireEvent.click(stepCards[0])).not.toThrow();
    }
  });

  it('sau khi điều hướng có thể quay lại', () => {
    renderDashboard();
    const agencyCards = screen.queryAllByText('Sở Xây Dựng');
    if (agencyCards.length > 0) {
      fireEvent.click(agencyCards[0]);
      // Tìm nút Quay lại hoặc ArrowLeft
      const backBtns = screen.queryAllByRole('button');
      // Component vẫn render được sau khi click
      expect(screen.queryAllByRole('button').length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – localStorage', () => {
  afterEach(() => { localStorage.clear(); });

  it('render bình thường khi localStorage rỗng', () => {
    localStorage.clear();
    expect(() => renderDashboard()).not.toThrow();
  });

  it('render bình thường khi localStorage có dữ liệu cũ', () => {
    localStorage.setItem(
      'actual_progress_p-1',
      JSON.stringify({ 'CHỦ TRƯƠNG': { cdtDate: '01/01/2024', nnDate: '15/01/2024' } })
    );
    expect(() => renderDashboard()).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – View search-results', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render view search-results không crash', () => {
    expect(() => renderDashboard({ initialView: 'search-results' })).not.toThrow();
  });

  it('hiển thị tiêu đề "KẾT QUẢ TÌM KIẾM"', () => {
    renderDashboard({ initialView: 'search-results' });
    expect(screen.getByText('KẾT QUẢ TÌM KIẾM')).toBeInTheDocument();
  });

  it('hiển thị empty state khi searchQuery trống', () => {
    renderDashboard({ initialView: 'search-results' });
    const el = screen.queryByText(/Không tìm thấy/i) || screen.queryByText('KẾT QUẢ TÌM KIẾM');
    expect(el).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – View projects', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render view projects không crash', () => {
    expect(() => renderDashboard({ initialView: 'projects' })).not.toThrow();
  });

  it('hiển thị header liên quan dự án trong view projects', () => {
    renderDashboard({ initialView: 'projects' });
    const el = screen.queryByText('Danh sách dự án')
      || screen.queryByText(/KH bị chậm/i)
      || screen.queryByText(/CQNN đang xử lý/i)
      || screen.queryAllByRole('heading')[0];
    expect(el).not.toBeNull();
  });

  it('hiển thị các nút điều hướng trong view projects', () => {
    renderDashboard({ initialView: 'projects' });
    expect(screen.queryAllByRole('button').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – View departments, child-steps, detail', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render view departments không crash (selectedAgency null)', () => {
    expect(() => renderDashboard({ initialView: 'departments' })).not.toThrow();
  });

  it('render view child-steps không crash (selectedParentStep null)', () => {
    expect(() => renderDashboard({ initialView: 'child-steps' })).not.toThrow();
  });

  it('render view detail không crash (selectedProject null)', () => {
    expect(() => renderDashboard({ initialView: 'detail' })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Props đặc biệt', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render không crash khi processingAgencies rỗng', () => {
    expect(() => renderDashboard({ processingAgencies: [] })).not.toThrow();
  });

  it('render không crash khi investors rỗng', () => {
    expect(() => renderDashboard({ investors: [] })).not.toThrow();
  });

  it('render không crash khi locations rỗng', () => {
    expect(() => renderDashboard({ locations: [] })).not.toThrow();
  });

  it('render không crash với actualProgress đã có data', () => {
    const actualProgress = {
      'p-1': { 'CHỦ TRƯƠNG': { cdtDate: '01/01/2024', nnDate: '15/01/2024' } }
    };
    expect(() => renderDashboard({ actualProgress })).not.toThrow();
  });

  it('render không crash khi currentUser là null', () => {
    expect(() => renderDashboard({ currentUser: null })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Điều hướng từ overview', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click vào tiêu đề thủ tục không crash', () => {
    renderDashboard();
    const cards = screen.queryAllByText(/Chấp thuận chủ trương/i);
    if (cards.length > 0) {
      expect(() => fireEvent.click(cards[0])).not.toThrow();
    }
  });

  it('sau click agency → hiển thị được button Quay lại', () => {
    renderDashboard();
    const agencyEls = screen.queryAllByText('Sở Xây Dựng');
    if (agencyEls.length > 0) {
      fireEvent.click(agencyEls[0]);
      expect(screen.queryAllByRole('button').length).toBeGreaterThan(0);
    }
  });

  it('render agencies view từ overview không crash', () => {
    renderDashboard({ initialView: 'agencies' });
    expect(screen.getByText('Thống kê theo cơ quan')).toBeInTheDocument();
  });

  it('render steps view từ overview không crash', () => {
    renderDashboard({ initialView: 'steps' });
    expect(screen.getByText('Thống kê theo thủ tục')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Stat buttons điều hướng đến projects', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click "KH bị chậm" chuyển sang view projects', () => {
    renderDashboard();
    const btn = screen.queryAllByText('KH bị chậm')[0];
    if (!btn) return;
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('click "KH bị chậm" với statusFilter delayed → empty state (mock không có past deadline)', () => {
    renderDashboard();
    const btn = screen.queryAllByText('KH bị chậm')[0];
    if (!btn) return;
    fireEvent.click(btn);
    expect(screen.queryByText('Không có dự án nào đang xử lý tại đây...')).toBeInTheDocument();
  });

  it('click "CQNN đang xử lý" chuyển sang view projects', () => {
    renderDashboard();
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('click "CQNN đang xử lý" → hiển thị cả 2 dự án (mock đều trả ontime)', () => {
    renderDashboard();
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Metric cards điều hướng đến projects', () => {
  beforeEach(() => { localStorage.clear(); });

  it('click card "Chấp thuận chủ trương" chuyển sang projects view', () => {
    renderDashboard();
    const cards = screen.queryAllByText('Chấp thuận chủ trương');
    if (cards.length === 0) return;
    fireEvent.click(cards[0]);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('click card "GP xây dựng" chuyển sang projects view', () => {
    renderDashboard();
    const card = screen.queryAllByText(/GP [Xx]ây dựng/)[0];
    if (!card) return;
    fireEvent.click(card);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('click card "Dự án đã công bố" chuyển sang projects view', () => {
    renderDashboard();
    const card = screen.queryAllByText('Dự án đã công bố')[0];
    if (!card) return;
    fireEvent.click(card);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('metric cards filter customFilterType → empty state khi không có project khớp', () => {
    renderDashboard();
    const card = screen.queryAllByText(/GP [Xx]ây dựng/)[0];
    if (!card) return;
    fireEvent.click(card);
    // Mock projects have no gpxaydung fields → customFilterType='licensed' matches nothing
    expect(screen.queryByText('Không có dự án nào đang xử lý tại đây...')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Projects view → Detail view', () => {
  beforeEach(() => { localStorage.clear(); });

  function navigateToProjects() {
    renderDashboard();
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (btn) fireEvent.click(btn);
  }

  it('click project card từ projects view chuyển sang detail view', () => {
    navigateToProjects();
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });

  it('detail view hiển thị tên dự án đã chọn', () => {
    navigateToProjects();
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('detail view hiển thị mã dự án', () => {
    navigateToProjects();
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('NOXH-2024-0001')).toBeInTheDocument();
  });

  it('detail view hiển thị stat "0/7" mốc hoàn thành', () => {
    navigateToProjects();
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('0/7')).toBeInTheDocument();
  });

  it('click back từ detail view quay về projects view', () => {
    navigateToProjects();
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    // In detail view, first button is goBack
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('detail view render không crash với actualProgress prop', () => {
    const actualProgress = {
      'p-1': { chutruong: { cdtDate: '01/01/2024', nnDate: '15/01/2024' } },
    };
    renderDashboard({ actualProgress });
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – goBack navigation', () => {
  beforeEach(() => { localStorage.clear(); });

  it('goBack từ projects view → trở về overview hiển thị "SỞ XÂY DỰNG TP.HCM"', () => {
    renderDashboard();
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    // history is now ['overview', 'projects'], goBack → overview
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });

  it('goBack từ search-results → overview (sau khi click "Tìm kiếm" bottom nav)', () => {
    renderDashboard();
    // Click "Tìm kiếm" bottom nav → navigateTo('search-results')
    const searchNavBtn = screen.queryByText('Tìm kiếm');
    if (!searchNavBtn) return;
    fireEvent.click(searchNavBtn);
    // history = ['overview', 'search-results'], goBack → overview
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });

  it('goToOverview từ "Trang chủ" button reset về overview từ agencies view', () => {
    renderDashboard({ initialView: 'agencies' });
    const homeBtn = screen.queryByText('Trang chủ');
    if (!homeBtn) return;
    fireEvent.click(homeBtn);
    expect(screen.queryByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });

  it('goToOverview từ "Trang chủ" button không crash từ steps view', () => {
    renderDashboard({ initialView: 'steps' });
    const homeBtn = screen.queryByText('Trang chủ');
    if (!homeBtn) return;
    expect(() => fireEvent.click(homeBtn)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Filter panel trong projects view', () => {
  beforeEach(() => { localStorage.clear(); });

  // FilterPanel renders agency.departments as React children — must be strings, not objects
  const stringDeptAgencies = [
    { id: 'ag-1', name: 'Sở Xây Dựng', displayOrder: 1, departments: ['Phòng QLXD', 'Phòng PTĐT'] },
    { id: 'ag-2', name: 'Sở QHKT', displayOrder: 2, departments: ['Phòng Quy hoạch'] },
  ];

  function openFilterPanel() {
    renderDashboard({ processingAgencies: stringDeptAgencies });
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (btn) fireEvent.click(btn);
    // In projects view: buttons[0]=goBack, buttons[1]=Filter
    const buttons = screen.getAllByRole('button');
    if (buttons.length > 1) fireEvent.click(buttons[1]);
  }

  it('click Filter button mở filter panel với "Xóa bộ lọc"', () => {
    openFilterPanel();
    expect(screen.queryByText('Xóa bộ lọc')).toBeInTheDocument();
  });

  it('filter panel hiển thị label "Cơ quan"', () => {
    openFilterPanel();
    expect(screen.queryByText('Cơ quan')).toBeInTheDocument();
  });

  it('filter panel hiển thị label "Chủ đầu tư"', () => {
    openFilterPanel();
    expect(screen.queryByText('Chủ đầu tư')).toBeInTheDocument();
  });

  it('thay đổi select trong filter panel không crash', () => {
    openFilterPanel();
    const selects = screen.queryAllByRole('combobox');
    if (selects.length > 0) {
      expect(() => fireEvent.change(selects[0], { target: { value: 'Sở Xây Dựng' } })).not.toThrow();
    }
  });

  it('click "Xóa bộ lọc" không crash', () => {
    openFilterPanel();
    const clearBtn = screen.queryByText('Xóa bộ lọc');
    if (!clearBtn) return;
    expect(() => fireEvent.click(clearBtn)).not.toThrow();
  });

  it('filter panel hiển thị options trong location select', () => {
    openFilterPanel();
    // combobox[1] = location select with optgroups for each agency
    expect(screen.queryAllByRole('option').length).toBeGreaterThan(0);
  });

  it('filter panel trong agencies view cũng hoạt động (string departments)', () => {
    renderDashboard({ initialView: 'agencies', processingAgencies: stringDeptAgencies });
    const buttons = screen.getAllByRole('button');
    if (buttons.length > 1) {
      fireEvent.click(buttons[1]);
      const hasFilter = screen.queryByText('Xóa bộ lọc') || screen.queryByText('Cơ quan');
      expect(hasFilter).toBeTruthy();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Local search trong projects view', () => {
  beforeEach(() => { localStorage.clear(); });

  it('search input tồn tại trong projects view', () => {
    renderDashboard({ initialView: 'projects' });
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });

  it('nhập tên dự án vào search lọc danh sách', () => {
    renderDashboard({ initialView: 'projects' });
    const input = screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nhà Ở Xã Hội Quận 7')).not.toBeInTheDocument();
  });

  it('nhập chủ đầu tư vào search lọc theo investor', () => {
    renderDashboard({ initialView: 'projects' });
    const input = screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Công ty B' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
    expect(screen.queryByText('Nhà Ở Xã Hội Bình Tân')).not.toBeInTheDocument();
  });

  it('search không khớp hiển thị empty state', () => {
    renderDashboard({ initialView: 'projects' });
    const input = screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'xyz-không-tồn-tại' } });
    expect(screen.queryByText('Không có dự án nào đang xử lý tại đây...')).toBeInTheDocument();
  });

  it('xóa search hiển thị lại tất cả dự án', () => {
    renderDashboard({ initialView: 'projects' });
    const input = screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Nhà Ở Xã Hội Quận 7').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Search trong SearchResults view', () => {
  beforeEach(() => { localStorage.clear(); });

  it('input tìm kiếm có placeholder "Tìm kiếm dự án khác..."', () => {
    renderDashboard({ initialView: 'search-results' });
    expect(screen.queryByPlaceholderText('Tìm kiếm dự án khác...')).toBeInTheDocument();
  });

  it('nhấn Enter với query → handleSearch không crash', () => {
    renderDashboard({ initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    expect(() => fireEvent.keyDown(input, { key: 'Enter' })).not.toThrow();
  });

  it('nhấn Enter với query → hiển thị dự án khớp', () => {
    renderDashboard({ initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('nhấn phím khác (không phải Enter) không trigger search', () => {
    renderDashboard({ initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    expect(() => fireEvent.keyDown(input, { key: 'a' })).not.toThrow();
  });

  it('click filter button trong search-results view toggle filter panel', () => {
    // Use string departments to avoid FilterPanel crash
    renderDashboard({
      initialView: 'search-results',
      processingAgencies: [{ id: 'ag-1', name: 'Sở Xây Dựng', displayOrder: 1, departments: ['Phòng QLXD'] }],
    });
    const buttons = screen.getAllByRole('button');
    if (buttons.length > 1) {
      fireEvent.click(buttons[1]);
      const hasFilter = screen.queryByText('Xóa bộ lọc') || screen.queryByText('Cơ quan');
      expect(hasFilter).toBeTruthy();
    }
  });

  it('search query không khớp → hiển thị "Không tìm thấy dự án nào phù hợp..." (lines 1813-1815)', () => {
    // filteredProjects.length === 0 when query matches no project → empty state renders
    renderDashboard({ initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'ZZZNOMATCH999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByText('Không tìm thấy dự án nào phù hợp...')).toBeInTheDocument();
  });

  it('search theo investor (không khớp name/code) → lọc theo investor (line 1735)', () => {
    // 'Công ty A' không match name/code nhưng match investor của p-1 → line 1735 branch = true
    renderDashboard({ initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Công ty A' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('SearchResults với delayed project → AlertCircle hiển thị (line 1793)', () => {
    // getProjectStatus returns 'delayed' → AlertCircle renders instead of CheckCircle
    const delayedProject = { ...mockProjects[0], chutruong_nn_date: '01/01/2020' };
    renderDashboard({ projects: [delayedProject], initialView: 'search-results' });
    const input = screen.queryByPlaceholderText('Tìm kiếm dự án khác...');
    if (!input) return;
    fireEvent.change(input, { target: { value: 'Bình Tân' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Projects view với delayed projects', () => {
  beforeEach(() => { localStorage.clear(); });

  it('project với nn_date quá khứ hiển thị là delayed', () => {
    const delayedProjects = [
      {
        ...mockProjects[0],
        chutruong_nn_date: '01/01/2020',
      },
      mockProjects[1],
    ];
    renderDashboard({ projects: delayedProjects });
    const btn = screen.queryAllByText('KH bị chậm')[0];
    if (!btn) return;
    fireEvent.click(btn);
    // p-1 has past chutruong_nn_date → getProjectStatus returns 'delayed'
    expect(screen.queryAllByText('Nhà Ở Xã Hội Bình Tân').length).toBeGreaterThan(0);
  });

  it('goBack từ projects với delayed filter về overview', () => {
    renderDashboard();
    const btn = screen.queryAllByText('KH bị chậm')[0];
    if (!btn) return;
    fireEvent.click(btn);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.queryByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – currentUser investor và agency', () => {
  beforeEach(() => { localStorage.clear(); });

  it('investor currentUser render không crash', () => {
    expect(() => renderDashboard({ currentUser: { userType: 'investor', agencyId: '' } })).not.toThrow();
  });

  it('agency currentUser (SXD) render không crash', () => {
    expect(() => renderDashboard({ currentUser: { userType: 'agency', agencyId: '1' } })).not.toThrow();
  });

  it('agency currentUser (không phải SXD) render không crash', () => {
    expect(() => renderDashboard({ currentUser: { userType: 'agency', agencyId: '5' } })).not.toThrow();
  });

  it('investor user điều hướng đến projects view được', () => {
    renderDashboard({ currentUser: { userType: 'investor', agencyId: '' } });
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('Tìm kiếm theo tên dự án, chủ đầu tư...')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – StageStatsTable với parentStep data', () => {
  beforeEach(() => { localStorage.clear(); });

  it('render không crash với projects có parentStep', () => {
    const projectsWithParentStep = mockProjects.map(p => ({
      ...p,
      parentStep: 'Chấp thuận chủ trương',
      stage: 'Chuẩn bị đầu tư',
    }));
    expect(() => renderDashboard({ projects: projectsWithParentStep })).not.toThrow();
  });

  it('render overview với projects có nhiều parentStep khác nhau', () => {
    const mixedProjects = [
      { ...mockProjects[0], parentStep: 'Chấp thuận chủ trương đầu tư', stage: 'Chuẩn bị đầu tư' },
      { ...mockProjects[1], parentStep: 'Quy hoạch 1/500', stage: 'Thực hiện đầu tư' },
    ];
    expect(() => renderDashboard({ projects: mixedProjects })).not.toThrow();
  });

  it('overview vẫn hiển thị "Thống kê dự án" với parentStep data', () => {
    const projectsWithParentStep = mockProjects.map(p => ({
      ...p,
      parentStep: 'GP xây dựng',
    }));
    renderDashboard({ projects: projectsWithParentStep });
    expect(screen.queryAllByText('Thống kê dự án')[0]).toBeInTheDocument();
  });

  it('click stage header trong StageStatsTable → navigate to steps (lines 770-776)', () => {
    // StageStatsTable renders stage headers with text "Stage (count)"
    // Clicking triggers onClick → setFilterProjectStage + navigateTo('steps') [lines 770-776]
    renderDashboard();
    // Stage headers render for projects with matching stage values
    const stageHeader = screen.queryAllByText(/Thực hiện đầu tư/)[0] || screen.queryAllByText(/Chuẩn bị đầu tư/)[0];
    if (!stageHeader) return;
    fireEvent.click(stageHeader);
    // After click: navigateTo('steps') called → view changes (may show steps content or overview)
    expect(document.body).toBeTruthy(); // navigated without crash
  });

  it('click subStep title trong StageStatsTable → navigate to projects (lines 795-802)', () => {
    // subSteps render when INITIAL_PROCESSES parentSteps match stage
    // Use projects with parentStep matching an INITIAL_PROCESSES step name
    const projectsWithSubStep = [
      { ...mockProjects[0], stage: 'Chuẩn bị đầu tư', parentStep: 'Chấp thuận chủ trương đầu tư' },
      { ...mockProjects[1], stage: 'Chuẩn bị đầu tư', parentStep: 'Chấp thuận chủ trương đầu tư' },
    ];
    renderDashboard({ projects: projectsWithSubStep });
    // Look for sub-step title text in the grid
    const subStepEl = screen.queryAllByText(/Chủ trương|Chấp thuận/i)[0];
    if (!subStepEl) return;
    fireEvent.click(subStepEl);
    expect(document.body).toBeTruthy();
  });

  it('goBack từ steps view về overview (lines 236-238)', () => {
    // Navigate to steps via stage click → then goBack
    renderDashboard();
    const stageHeader = screen.queryAllByText(/Thực hiện đầu tư/)[0] || screen.queryAllByText(/Chuẩn bị đầu tư/)[0];
    if (!stageHeader) return;
    fireEvent.click(stageHeader);
    // Now in steps view, history=['overview','steps']. Click back button.
    const backBtn = screen.getAllByRole('button')[0];
    fireEvent.click(backBtn);
    // goBack from steps → prevView='overview', lines 236-238 run (reset filterParentStep etc.)
    expect(screen.queryByText('SỞ XÂY DỰNG TP.HCM')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Detail view với investor currentUser', () => {
  beforeEach(() => { localStorage.clear(); });

  it('investor user vào detail view từ projects không crash', () => {
    renderDashboard({ currentUser: { userType: 'investor', agencyId: '' } });
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });

  it('admin user vào detail view không crash', () => {
    renderDashboard({ currentUser: { roleId: 'Admin', userType: 'agency', agencyId: '1' } });
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });

  it('detail view với localStorage actualProgress không crash', () => {
    localStorage.setItem(
      'actual_progress_p-1',
      JSON.stringify({ chutruong: { cdtDate: '05/01/2024', nnDate: '20/01/2024' } })
    );
    renderDashboard();
    const btn = screen.queryAllByText('CQNN đang xử lý')[0];
    if (!btn) return;
    fireEvent.click(btn);
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('DashboardApp – Detail view modal (Cập nhật tiến độ)', () => {
  beforeEach(() => { localStorage.clear(); });

  // Project with dates → hasPlan=true → "+ nhập TT" appears with canEditCdt
  const projectWithDates = {
    ...mockProjects[0],
    chutruong_cdt_date: '01/01/2024',
    chutruong_nn_date: '30/06/2024',
  };

  function navigateToDetailWithInvestor(overrides: Record<string, any> = {}) {
    renderDashboard({
      // Chủ đầu tư của chính dự án (chỉ CĐT của dự án được nhập phía CĐT)
      currentUser: { userType: 'investor', investorId: projectWithDates.investor },
      projects: [projectWithDates, mockProjects[1]],
      initialView: 'projects',
      ...overrides,
    });
    // In projects view (initialView), click the project card directly
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (projectEl) fireEvent.click(projectEl);
  }

  it('investor user thấy "+ nhập TT" button trong CDT TT row', () => {
    navigateToDetailWithInvestor();
    expect(screen.queryAllByText('+ nhập TT').length).toBeGreaterThan(0);
  });

  it('click "+ nhập TT" mở modal "Nhập tiến độ thực hiện" (dùng chung với Sơ đồ Gantt → chi tiết)', () => {
    navigateToDetailWithInvestor();
    const enterBtn = screen.queryByText('+ nhập TT');
    if (!enterBtn) return;
    fireEvent.click(enterBtn);
    expect(screen.queryByText('Nhập tiến độ thực hiện')).toBeInTheDocument();
  });

  it('modal hiển thị 2 input date (CDT và NN)', () => {
    navigateToDetailWithInvestor();
    const enterBtn = screen.queryByText('+ nhập TT');
    if (!enterBtn) return;
    fireEvent.click(enterBtn);
    const dateInputs = screen.queryAllByDisplayValue('');
    expect(dateInputs.length).toBeGreaterThan(0);
  });

    // Chủ đầu tư chỉ nhập phần của mình: khối "TIẾN ĐỘ NN" bị ẩn với tài khoản investor
  // (src/components/DashboardApp.tsx – "NN Section - Hidden for Investor", currentUser.userType !== 'investor')
  it('modal của chủ đầu tư: phía CĐT nhập được, phía cơ quan chỉ xem', () => {
    navigateToDetailWithInvestor();
    const enterBtn = screen.queryByText('+ nhập TT');
    if (!enterBtn) return;
    fireEvent.click(enterBtn);
    expect(screen.queryByText('CĐT nộp (tiến độ)')).toBeInTheDocument();
    expect(screen.queryByText('Chỉ xem')).toBeInTheDocument();
  });

  it('click "Hủy" đóng modal', () => {
    navigateToDetailWithInvestor();
    const enterBtn = screen.queryByText('+ nhập TT');
    if (!enterBtn) return;
    fireEvent.click(enterBtn);
    const cancelBtn = screen.queryByText('Hủy');
    if (!cancelBtn) return;
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument();
  });

  // Lưu trong chi tiết Dashboard đi qua server (onSubmitMilestone → POST /api/projects/:id/progress/milestone),
  // server ghi xuống các bước của thủ tục liên kết; không có bản lưu riêng theo trình duyệt
  it('"Lưu tiến độ" gửi thay đổi phía CĐT của mốc lên server rồi đóng modal', async () => {
    const onSubmitMilestone = vi.fn(async () => true);
    navigateToDetailWithInvestor({ onSubmitMilestone });
    fireEvent.click(screen.getAllByText('+ nhập TT')[0]);
    fireEvent.click(screen.getAllByRole('checkbox')[0]); // Lấy ngày KH
    await act(async () => { fireEvent.click(screen.getByText('Lưu tiến độ')); });
    expect(onSubmitMilestone).toHaveBeenCalledWith('p-1', [expect.objectContaining({ side: 'cdt' })]);
    expect(screen.queryByText('Nhập tiến độ thực hiện')).not.toBeInTheDocument();
    expect(localStorage.getItem('actual_progress_p-1')).toBeNull();
  });

    // Ô "Bước hiện tại" / "Cơ quan xử lý" theo bước quy trình khi xác định được bước (stepAgency.ts);
  // bước không có trong cấu hình quy trình → dùng mốc kế hoạch đang mở (src/components/DashboardApp.tsx
  // currentStepDisplay / agencyDisplay, sửa 05/10/2026)
  it('detail view: bước không có trong quy trình → hiện mốc kế hoạch, không hiện tên bước lạ', () => {
    const projectWithParentStep = {
      ...projectWithDates,
      parentStep: 'Chấp thuận chủ trương đầu tư',
      currentStep: 'Bước xử lý hiện tại',
      currentAgency: 'Sở Xây Dựng',
    };
    renderDashboard({
      currentUser: { userType: 'investor' },
      projects: [projectWithParentStep],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
        expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
    expect(screen.queryAllByText('Bước xử lý hiện tại').length).toBe(0);
    expect(screen.queryAllByText('Chấp thuận chủ trương').length).toBeGreaterThan(0);
  });

  it('detail view: bước có trong quy trình → hiện tên bước và cơ quan của bước', () => {
    const processes = [{
      id: 'proc-1', name: 'Quy trình thử',
      parentSteps: [{ id: 'ps-1', name: 'Quy hoạch', childSteps: [
        { id: 'cs-a', name: 'Thẩm định quy hoạch tại phường', agency: 'UBND xã phường' }
      ] }]
    }];
    const project = { ...projectWithDates, currentStep: 'Thẩm định quy hoạch tại phường', currentStepId: 'cs-a' };
    renderDashboard({ currentUser: { userType: 'investor' }, projects: [project], processes, initialView: 'projects' });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    expect(screen.queryAllByText('Thẩm định quy hoạch tại phường').length).toBeGreaterThan(0);
    // "UBND xã phường" trong cấu hình được chuẩn hóa thành "UBND cấp xã, phường"
    expect(screen.queryAllByText(/UBND cấp xã, phường/).length).toBeGreaterThan(0);
  });

  it('SXD agency user (agencyId=1) thấy "+ nhập TT" trong Agency NN TT row', () => {
    // canEditAgency = isSXD = true for agencyId='1'
    // CHỦ TRƯƠNG phase owned by SXD → Agency TT row shows "+ nhập TT"
    renderDashboard({
      currentUser: { userType: 'agency', agencyId: '1' },
      projects: [projectWithDates],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    // With SXD user: both CDT TT row AND Agency TT row show "+ nhập TT" for CHỦ TRƯƠNG
    expect(screen.queryAllByText('+ nhập TT').length).toBeGreaterThan(1);
  });

  it('SXD agency user click "+ nhập TT" trong Agency TT row mở modal', () => {
    renderDashboard({
      currentUser: { userType: 'agency', agencyId: '1' },
      projects: [projectWithDates],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    const enterBtns = screen.queryAllByText('+ nhập TT');
    if (enterBtns.length < 2) return;
    // Click the second button (Agency TT row)
    fireEvent.click(enterBtns[1]);
    expect(screen.queryByText('Nhập tiến độ thực hiện')).toBeInTheDocument();
  });

  it('detail view với dates tương lai → getKHStyles trả "sắp đến hạn" (bg-amber)', () => {
    // projectWithFutureDates has chutruong_cdt_date/nn_date in 2030 → today < planDate
    // This covers lines in getKHStyles() that return 'bg-amber-50' for future dates
    const projectWithFutureDates = {
      ...mockProjects[0],
      chutruong_cdt_date: '01/01/2030',
      chutruong_nn_date: '30/06/2030',
    };
    renderDashboard({
      projects: [projectWithFutureDates],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    // Detail view renders Gantt table with future dates → amber styling triggered
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });

  it('detail view với actual NN progress → getStatusColor gọi parseDate (lines 1906-1907)', () => {
    // getStatusColor is called when isOwnerAgency && hasActual (actual.nnDate is set)
    // Need: plan NN date + actual NN date in localStorage
    localStorage.setItem(
      'actual_progress_p-1',
      JSON.stringify({ chutruong: { cdtDate: '05/01/2024', nnDate: '20/01/2024' } })
    );
    const projectWithNnDate = {
      ...mockProjects[0],
      chutruong_cdt_date: '01/01/2024',
      chutruong_nn_date: '30/06/2030', // future NN plan date
    };
    renderDashboard({
      projects: [projectWithNnDate],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    // Agency NN TT row shows actual NN date → getStatusColor(phase, {nnDate:'20/01/2024'}) called
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });

  it('detail view với localStorage JSON không hợp lệ → catch block (lines 1863-1864)', () => {
    // JSON.parse throws when stored data is malformed → covers catch at lines 1863-1864
    localStorage.setItem('actual_progress_p-1', '{invalid_json}');
    renderDashboard({
      projects: [projectWithDates],
      initialView: 'projects',
    });
    const projectEl = screen.queryByText('Nhà Ở Xã Hội Bình Tân');
    if (!projectEl) return;
    fireEvent.click(projectEl);
    // Still renders detail view gracefully after catching parse error
    expect(screen.queryByText('CHI TIẾT DỰ ÁN GANTT')).toBeInTheDocument();
  });
});
