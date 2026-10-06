import { UserAccount } from '../types';

// Sample projects were removed: projects only come from the database.

export const INITIAL_INVESTORS = [
  'Chưa có chủ đầu tư',
  'Công ty CP ĐTXD Xuân Mai Sài Gòn',
  'Cty CP SX KD XNK DV & ĐT Tân Bình Tanimex',
  'Công ty Cổ phần An Cư Đức Phú',
  'Công ty Cổ phần Bất động sản Nhà Bè',
  'Cty TNHH XD TM Hoàng Nam',
  'Cty CP Địa ốc Thảo Điền',
  'Cty CPXD & KD Địa ốc Hòa Bình',
  'Công ty TNHH Thương mại – Xây dựng Lê Thành',
  'Công ty Cổ phần Bất động sản Tiến Phước',
  'Công ty TNHH Đầu tư và phát triển đô thị Vũng Tàu',
  'Công ty Hodeco',
  'Công ty Cổ phần Bất động sản Dragon Village',
  'Cty CP BĐS Exim',
  'Công ty CP Phát triển Thành phố Xanh',
  'Công ty TNHH MTV Phát triển Công nghiệp Tân Thuận (IPC)',
  'Tổng Công ty Đầu tư Phát triển nhà và Đô thị',
  'Tổng công ty Đầu tư và Phát triển Công nghiệp - CTCP',
  'Công ty TNHH MTV Đầu tư Kinh doanh nhà Khang Phúc',
  'Công ty Cổ phần Đầu tư địa ốc Vạn Phúc'
];

export const INITIAL_PROJECT_GROUPS = ['Nhóm A', 'Nhóm B', 'Nhóm C'];
export const INITIAL_PROJECT_CATEGORIES = ['Bộ công an', 'Bộ quốc phòng', 'Nghị quyết số 201','Đầu tư công', 'Khác'];
export const INITIAL_BUILDING_GRADES = ['Cấp đặc biệt', 'Cấp I', 'Cấp II', 'Cấp III', 'Cấp IV'];
export const INITIAL_PROJECT_STATUSES = ['Đang xử lý', 'Trễ', 'Hoàn thành'];
export const INITIAL_PROJECT_STAGES = [
  {
    name: 'CHUẨN BỊ ĐẦU TƯ',
    milestones: [
      'Chấp thuận chủ trương đầu tư',
      'Phê duyệt quy hoạch 1/500',
      'Quyết định giao đất / thuê đất',
      'Phê duyệt báo cáo ĐTM / Thẩm định HTKT',
      'Thẩm định báo cáo nghiên cứu khả thi',
      'Nghiệm thu / Thẩm duyệt PCCC',
      'Cấp Giấy phép xây dựng'
    ]
  },
  {
    name: 'THỰC HIỆN ĐẦU TƯ',
    milestones: [
      'Khởi công công trình',
      'Nghiệm thu phần móng / hạ tầng',
      'Xây dựng hoàn thiện phần thân',
      'Nghiệm thu hoàn thành đưa vào sử dụng'
    ]
  },
  {
    name: 'KẾT THÚC ĐẦU TƯ',
    milestones: [
      'Bàn giao tài sản / Đưa vào sử dụng',
      'Quyết toán dự án hoàn thành',
      'Cấp chứng nhận sở hữu công trình'
    ]
  }
];


export const INITIAL_AGENCIES = [
  { id: '1', name: 'Sở Xây dựng', displayOrder: 1, departments: ['Phòng PTĐT', 'Phòng QLXDCT DDCN', 'Phòng QLN & TTBĐS', 'Phòng KT & VLXD', 'Phòng QLCL CTXD', 'Phòng HTKT', 'Phòng QLBT & KTCTGT'] },
  { id: '2', name: 'Sở Quy hoạch Kiến trúc', displayOrder: 2, departments: [] },
  { id: '3', name: 'Sở NNMT', displayOrder: 3, departments: [] },
  { id: '5', name: 'Sở Tài chính', displayOrder: 4, departments: [] },
  { id: '6', name: 'UBND cấp xã, phường', displayOrder: 5, departments: ['Phường Bình Đông', 'Phường Diên Hồng',  'Phường Tân Thới Hiệp','Phường Long Phước','Phường Rạch Dừa', 'Phường Rạch Ông', 'Phường Phú Định', 'Phường An Nhơn',  'Phường An Khánh', 'Phường Thạnh Mỹ Tây', 'Phường Tân Thuận', 'Phường Bình Hưng Hòa A',  'Phường Tăng Nhơn Phú', 'Xã Hiệp Phước',  'Phường An Lạc','Phường Phước Long','Phường An Phú', 'Phường Thuận Giao', 'Phường Bình Tân',  'Xã Bình Hưng', 'Phường Hiệp Bình', 'Phường Hiệp Phú', 'Phường Long Trường',  'Phường Chánh Hiệp', 'Xã Tân Kiên',  'Phường Phú Mỹ', 'Phường Tân Tạo', 'Xã Phong Phú',  'Xã An Phú Tây',  'Phường Thủ Đức',  'Phường Cát Lái',  'Xã Đa Phước',  'Xã Hưng Long', 'Xã Quy Đức',  'Xã Tân Nhựt',  'Xã Bình Lợi',  'Phường Vườn Lài', 'Phường Khánh Hội', 'Phường Chánh Hưng', 'Phường Đông Hưng Thuận'] },
  { id: '7', name: 'UBND TP', displayOrder: 6, departments: [] },
  { id: '8', name: 'HĐND TP', displayOrder: 7, departments: [] },
  { id: '9', name: 'Công an TP (PCCC)', displayOrder: 8, departments: [] }
];

export const INITIAL_FUNDING_SOURCES = ['Vốn ngân sách', 'Vốn doanh nghiệp', 'Vốn vay', 'Nguồn tài chính công đoàn'];
export const INITIAL_STEP_STATUSES = ['Chưa bắt đầu', 'Đang xử lý', 'Chờ bổ sung hồ sơ', 'Đã trình', 'Đã phê duyệt', 'Hoàn thành', 'Bị trả hồ sơ', 'Tạm dừng'];
export const INITIAL_LOCATIONS = [
  { ward: 'Phường Tân Phú', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Rạch Dừa', oldArea: 'Quận 7' },
  { ward: 'Phường Phước Long', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Long Trường', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Thủ Đức', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Cát Lái', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Gò Vấp', oldArea: 'Quận Gò Vấp' },
  { ward: 'Phường An Khánh', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Bình Đông', oldArea: 'Quận 8' },
  { ward: 'Phường Thạnh Mỹ Tây', oldArea: 'Quận Bình Thạnh' },
  { ward: 'Phường Hạnh Thông', oldArea: 'Quận Gò Vấp' },
  { ward: 'Phường Tân Thới Hiệp', oldArea: 'Quận 12' },
  { ward: 'Phường Long Phước', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Khánh Hội', oldArea: 'Quận 4' },
  { ward: 'Phường Chánh Hưng', oldArea: 'Quận 8' },
  { ward: 'Phường Đông Hưng Thuận', oldArea: 'Quận 12' },
  { ward: 'Phường Phú Định', oldArea: 'Quận 8' },
  { ward: 'Phường Tân Thuận', oldArea: 'Quận 7' },
  { ward: 'Phường Bình Hưng Hòa', oldArea: 'Quận Bình Tân' },
  { ward: 'Phường Tăng Nhơn Phú', oldArea: 'TP. Thủ Đức' },
  { ward: 'Xã Hiệp Phước', oldArea: 'Huyện Nhà Bè' },
  { ward: 'Phường An Lạc', oldArea: 'Quận Bình Tân' },
  { ward: 'Phường Bình Tân', oldArea: 'Quận Bình Tân' },
  { ward: 'Xã Bình Hưng', oldArea: 'Huyện Bình Chánh' },
  { ward: 'Phường Phú Mỹ', oldArea: 'Quận 7' },
  { ward: 'Phường Hiệp Bình', oldArea: 'TP. Thủ Đức' },
  { ward: 'Phường Chánh Hiệp', oldArea: 'Bình Dương' },
  { ward: 'Phường An Phú', oldArea: 'Bình Dương' },
  { ward: 'Phường Thuận Giao', oldArea: 'Bình Dương' }
];

export const INITIAL_PROCESSES = [
  {
    "id": "p1",
    "name": "Quy trình NOXH ĐẤT NN",
    "parentSteps": [
      {
        "id": "ps1",
        "name": "Chấp thuận chủ trương đầu tư đồng thời giao chủ đầu tư theo pháp luật về nhà ở",
        "shortName": "Chấp thuận chủ trương",
        "slaDays": 40,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs1",
            "name": "Công bộ thông tin",
            "shortName": "Công bố",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 30
          },
          {
            "id": "cs3",
            "name": "Thẩm định chủ trương đầu tư",
            "shortName": "TĐ CTĐT",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 7
          },
          {
            "id": "cs2",
            "name": "Chấp thuận chủ trương đầu tư",
            "shortName": "PD CTĐT",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps2",
        "name": "Thẩm định, phê duyệt quy hoạch chi tiết tỷ lệ 1/500 hoặc chấp thuận quy hoạch tổng mặt bằng tỷ lệ 1/500 (quy hoạch chi tiết được lập theo quy trình rút gọn) theo pháp luật về quy hoạch đô thị và nông thôn",
        "shortName": "QH 1/500",
        "slaDays": 22,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs4",
            "name": "Thẩm định / lấy ý kiến quy hoạch (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 02 đơn vị hành chính cấp xã trở lên)",
            "shortName": "TĐ QH",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs5",
            "name": "Chấp thuận (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 02 đơn vị hành chính cấp xã trở lên)",
            "shortName": "CT QH",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 7
          },
          {
            "id": "cs41",
            "name": "Thẩm định / lấy ý kiến quy hoạch (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "shortName": "TĐ QH PX",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs51",
            "name": "Chấp thuận (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "shortName": "CT QH PX",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 7
          }
        ]
      },
      {
        "id": "ps3",
        "name": "Giao đất, cho thuê đất hoặc cho phép chuyển mục đích sử dụng đất theo pháp luật về đất đai",
        "shortName": "QĐ Giao đất",
        "slaDays": 7,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs6",
            "name": "Thẩm định trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "shortName": "TĐ GĐ PX",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs7",
            "name": "Phê duyệt / có ý kiến địa phương trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "shortName": "PD GĐ PX",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          },
           {
            "id": "cs61",
            "name": "Thẩm định trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "shortName": "TĐ GĐ Sở",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs71",
            "name": "Phê duyệt / có ý kiến địa phương trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "shortName": "PD GĐ UBTP",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps14",
        "name": "Báo cáo nghiên cứu khả thi",
        "shortName": "BC NCKT",
        "slaDays": 15,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs811",
            "name": "Thẩm duyệt BC NCKT",
            "shortName": "TD BC NCKT",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLBT & KTCTGT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps10",
        "name": "Đầu nối hạ tầng kỹ thuật",
        "shortName": "ĐN HTKT",
        "slaDays": 15,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [       
		      {
            "id": "cs83",
            "name": "Đầu nối hạ tầng kỹ thuật",
            "shortName": "ĐN HTKT",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLBT & KTCTGT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps11",
        "name": "Thẩm duyệt PCCC",
        "shortName": "TD PCCC",
        "slaDays": 15,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [       
		      {
            "id": "cs81",
            "name": "Thẩm duyệt PCCC",
            "shortName": "TD PCCC",
            "agency": "Công an TP (PCCC)",
            "department": "",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps4",
        "name": "Cấp giấy phép xây dựng",
        "shortName": "GPXD",
        "slaDays": 15,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [          
		      {
            "id": "cs82",
            "name": "Cấp Giấy phép môi trường",
            "shortName": "CPMT",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs8",
            "name": "Cấp giấy phép xây dựng",
            "shortName": "GPXD",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLXDCT DDCN",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps5",
        "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 40,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs9",
            "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Chủ đầu tư",
            "department": "",
            "slaDays": 40
          }
        ]
      },
      {
        "id": "ps6",
        "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội và thủ tục thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
        "slaDays": 30,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs10",
            "name": "Công bố thời gian tiếp nhận hồ sơ",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 30
          },
          {
            "id": "cs11",
            "name": "Thông báo nhà ở hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps7",
        "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội đối với dự án nhà ở xã hội không sử dụng vốn đầu tư công, nguồn tài chính công đoàn",
        "slaDays": 10,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs12",
            "name": "Có ý kiến đối với danh sách đối tượng dự kiến được giải quyết mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps8",
        "name": "Kiểm tra công tác nghiệm thu hoàn thành công trình của cơ quan chuyên môn về xây dựng tại địa phương",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs13",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          },
          {
            "id": "cs14",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps9",
        "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs15",
            "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 15
          }
        ]
      }
    ]
  },
  {
    "id": "p5",
    "name": "Quy trình NOXH ĐẤT NN (Trường hợp đất <2ha )",
    "parentSteps": [
      {
        "id": "ps51",
        "name": "Chấp thuận chủ trương đầu tư đồng thời giao chủ đầu tư theo pháp luật về nhà ở",
        "slaDays": 40,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs51",
            "name": "Công bố thông tin",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 30
          },
          {
            "id": "cs53",
            "name": "Thẩm định chủ trương đầu tư",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 7
          },
          {
            "id": "cs52",
            "name": "Chấp thuận chủ trương đầu tư",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps52",
        "name": "Thẩm định, phê duyệt quy hoạch chi tiết tỷ lệ 1/500 hoặc chấp thuận quy hoạch tổng mặt bằng tỷ lệ 1/500 (quy hoạch chi tiết được lập theo quy trình rút gọn) theo pháp luật về quy hoạch đô thị và nông thôn",
        "slaDays": 22,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs54",
            "name": "Thẩm định / lấy ý kiến quy hoạch (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs55",
            "name": "Chấp thuận (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          },
          {
            "id": "cs541",
            "name": "Thẩm định / lấy ý kiến quy hoạch (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs551",
            "name": "Chấp thuận (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps53",
        "name": "Giao đất, cho thuê đất hoặc cho phép chuyển mục đích sử dụng đất theo pháp luật về đất đai",
        "slaDays": 7,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs56",
            "name": "Thẩm định trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs57",
            "name": "Phê duyệt / có ý kiến địa phương trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          },
           {
            "id": "cs561",
            "name": "Thẩm định trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs571",
            "name": "Phê duyệt / có ý kiến địa phương trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps54",
        "name": "Cấp giấy phép xây dựng",
        "slaDays": 15,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs581",
            "name": "Thẩm duyệt PCCC",
            "agency": "Công an TP (PCCC)",
            "department": "",
            "slaDays": 10
          },
		  {
            "id": "cs582",
            "name": "Cấp Giấy phép môi trường",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 15
          },
		  {
            "id": "cs583",
            "name": "Đầu nối hạ tầng kỹ thuật",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLBT & KTCTGT",
            "slaDays": 15
          },
          {
            "id": "cs58",
            "name": "Cấp giấy phép xây dựng",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLXDCT DDCN",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps55",
        "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 40,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs59",
            "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Chủ đầu tư",
            "department": "",
            "slaDays": 40
          }
        ]
      },
      {
        "id": "ps56",
        "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội và thủ tục thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
        "slaDays": 30,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs510",
            "name": "Công bố thời gian tiếp nhận hồ sơ",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 30
          },
          {
            "id": "cs511",
            "name": "Thông báo nhà ở hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps57",
        "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội đối với dự án nhà ở xã hội không sử dụng vốn đầu tư công, nguồn tài chính công đoàn",
        "slaDays": 10,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs512",
            "name": "Có ý kiến đối với danh sách đối tượng dự kiến được giải quyết mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps58",
        "name": "Kiểm tra công tác nghiệm thu hoàn thành công trình của cơ quan chuyên môn về xây dựng tại địa phương",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs513",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          },
          {
            "id": "cs514",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps59",
        "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs515",
            "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 15
          }
        ]
      }
    ]
  },
  {
    "id": "p2",
    "name": "Quy trình NOXH Đất Doanh nghiệp",
    "parentSteps": [
      {
        "id": "ps10",
        "name": "Chấp thuận chủ trương đầu tư đồng thời giao chủ đầu tư theo pháp luật về nhà ở",
        "slaDays": 18,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs16",
            "name": "Thẩm định chủ trương đầu tư",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          },
          {
            "id": "cs17",
            "name": "Phê duyệt, Chấp thuận CTĐT/ xử lý tại UBND TP",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps11",
        "name": "Thẩm định, phê duyệt quy hoạch chi tiết tỷ lệ 1/500 hoặc chấp thuận quy hoạch tổng mặt bằng tỷ lệ 1/500 (quy hoạch chi tiết được lập theo quy trình rút gọn) theo pháp luật về quy hoạch đô thị và nông thôn",
        "slaDays": 22,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs18",
            "name": "Thẩm định / lấy ý kiến quy hoạch(Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 02 đơn vị hành chính cấp xã trở lên)",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 15
          },
		  {
            "id": "cs181",
            "name": "Thẩm định / lấy ý kiến quy hoạch(Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs19",
            "name": "Chấp thuận (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 02 đơn vị hành chính cấp xã trở lên)",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 7
          },
          {
            "id": "cs191",
            "name": "Chấp thuận (Trường hợp đất >=2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 7
          }
        ]
      },
      {
        "id": "ps12",
        "name": "Giao đất, cho thuê đất hoặc cho phép chuyển mục đích sử dụng đất theo pháp luật về đất đai",
        "slaDays": 7,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs20",
            "name": "Thẩm định trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs21",
            "name": "Chấp thuận trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          },
          {
            "id": "cs201",
            "name": "Thẩm định trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs211",
            "name": "Chấp thuận trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps13",
        "name": "Cấp giấy phép xây dựng",
        "slaDays": 15,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs221",
            "name": "Thẩm duyệt PCCC",
            "agency": "Công an TP (PCCC)",
            "department": "",
            "slaDays": 10
          },
		  {
            "id": "cs222",
            "name": "Cấp Giấy phép môi trường",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 15
          },
		  {
            "id": "cs223",
            "name": "Đầu nối hạ tầng kỹ thuật",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLBT & KTCTGT",
            "slaDays": 15
          },
		  {
            "id": "cs22",
            "name": "Cấp giấy phép xây dựng",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLXDCT DDCN",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps14",
        "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 0,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs23",
            "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Chủ đầu tư",
            "department": "",
            "slaDays": 40
          }
        ]
      },
      {
        "id": "ps15",
        "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội và thủ tục thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
        "slaDays": 30,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs24",
            "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 30
          },
          {
            "id": "cs25",
            "name": "Thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps16",
        "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội đối với dự án nhà ở xã hội không sử dụng vốn đầu tư công, nguồn tài chính công đoàn",
        "slaDays": 10,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs26",
            "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps17",
        "name": "Kiểm tra công tác nghiệm thu hoàn thành công trình của cơ quan chuyên môn về xây dựng tại địa phương",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs27",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          },
          {
            "id": "cs28",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps18",
        "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs29",
            "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 15
          }
        ]
      }
    ]
  },
  {
    "id": "p4",
    "name": "Quy trình NOXH Đất Doanh nghiệp (Trường hợp đất <2ha)",
    "parentSteps": [
      {
        "id": "ps410",
        "name": "Chấp thuận chủ trương đầu tư đồng thời giao chủ đầu tư theo pháp luật về nhà ở",
        "slaDays": 18,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs416",
            "name": "Thẩm định chủ trương đầu tư",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          },
          {
            "id": "cs417",
            "name": "Phê duyệt, Chấp thuận CTĐT/ xử lý tại UBND TP",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps411",
        "name": "Thẩm định, phê duyệt quy hoạch chi tiết tỷ lệ 1/500 hoặc chấp thuận quy hoạch tổng mặt bằng tỷ lệ 1/500 (quy hoạch chi tiết được lập theo quy trình rút gọn) theo pháp luật về quy hoạch đô thị and nông thôn",
        "slaDays": 7,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs418",
            "name": "Thẩm định / lấy ý kiến quy hoạch(Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "Sở Quy hoạch Kiến trúc",
            "department": "",
            "slaDays": 5
          },
		  {
            "id": "cs4181",
            "name": "Thẩm định / lấy ý kiến quy hoạch(Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs419",
            "name": "Chấp thuận (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          },
          {
            "id": "cs4191",
            "name": "Chấp thuận (Trường hợp đất <2ha thuộc quy hoạch địa giới hành chính của 01 đơn vị hành chính cấp xã)",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps412",
        "name": "Giao đất, cho thuê đất hoặc cho phép chuyển mục đích sử dụng đất theo pháp luật về đất đai",
        "slaDays": 7,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs420",
            "name": "Thẩm định trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs421",
            "name": "Chấp thuận trường hợp giao đất / cho thuê đất cho toàn bộ diện tích đất thực hiện dự án NOXH",
            "agency": "UBND cấp xã, phường",
            "department": "",
            "slaDays": 2
          },
          {
            "id": "cs4201",
            "name": "Thẩm định trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs4211",
            "name": "Chấp thuận trường hợp dự án có NOXH có bố trí 20% diện tích đất làm nhà ở Thương mại",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 2
          }
        ]
      },
      {
        "id": "ps413",
        "name": "Cấp giấy phép xây dựng",
        "slaDays": 15,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs4221",
            "name": "Thẩm duyệt PCCC",
            "agency": "Công an TP (PCCC)",
            "department": "",
            "slaDays": 10
          },
		  {
            "id": "cs4222",
            "name": "Cấp Giấy phép môi trường",
            "agency": "Sở NNMT",
            "department": "",
            "slaDays": 15
          },
		  {
            "id": "cs4223",
            "name": "Đầu nối hạ tầng kỹ thuật",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLBT & KTCTGT",
            "slaDays": 15
          },
		  {
            "id": "cs422",
            "name": "Cấp giấy phép xây dựng",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLXDCT DDCN",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps414",
        "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 40,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs423",
            "name": "Phê duyệt giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Chủ đầu tư",
            "department": "",
            "slaDays": 40
          }
        ]
      },
      {
        "id": "ps415",
        "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội và thủ tục thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
        "slaDays": 30,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs424",
            "name": "Công bố thời gian tiếp nhận hồ sơ đăng ký mua, thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 30
          },
          {
            "id": "cs425",
            "name": "Thông báo nhà ở xã hội hình thành trong tương lai đủ điều kiện được bán, cho thuê mua",
            "agency": "Sở Xây dựng",
            "department": "Phòng PTĐT",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps416",
        "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội đối với dự án nhà ở xã hội không sử dụng vốn đầu tư công, nguồn tài chính công đoàn",
        "slaDays": 10,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs426",
            "name": "Có ý kiến đối với danh sách các đối tượng dự kiến được giải quyết mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLN & TTBĐS",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps417",
        "name": "Kiểm tra công tác nghiệm thu hoàn thành công trình của cơ quan chuyên môn về xây dựng tại địa phương",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs427",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          },
          {
            "id": "cs428",
            "name": "Kiểm tra nghiệm thu hoàn thành công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "Phòng QLCL CTXD",
            "slaDays": 15
          }
        ]
      },
      {
        "id": "ps418",
        "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs429",
            "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 15
          }
        ]
      }
    ]
  },
  {
    "id": "p3",
    "name": "Quy trình NOXH Vốn đầu tư công",
    "parentSteps": [
      {
        "id": "ps19",
        "name": "Giao nhiệm vụ chuẩn bị đầu tư",
        "slaDays": 12,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs30",
            "name": "Chủ trì giao nhiệm vụ chuẩn bị đầu tư",
            "agency": "Sở Tài chính",
            "department": "",
            "slaDays": 5
          },
          {
            "id": "cs31",
            "name": "Phối hợp giao nhiệm vụ chuẩn bị đầu tư",
            "agency": "Sở Xây dựng (phối hợp)",
            "department": "",
            "slaDays": 2
          },
          {
            "id": "cs32",
            "name": "Phê duyệt / ban hành nhiệm vụ",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 5
          }
        ]
      },
      {
        "id": "ps20",
        "name": "Lập, thẩm định Báo cáo nghiên cứu tiền khả thi (nhóm A) / Báo cáo đề xuất chủ trương đầu tư dự án (nhóm B, C) và trình cơ quan có thẩm quyền quyết định chủ trương đầu tư",
        "slaDays": 17,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs33",
            "name": "Thẩm định hồ sơ dự án nhóm B, C",
            "agency": "Sở Tài chính",
            "department": "",
            "slaDays": 14
          },
          {
            "id": "cs34",
            "name": "Thẩm định hồ sơ dự án nhóm A",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 20
          },
          {
            "id": "cs35",
            "name": "Trình / quyết định chủ trương đầu tư",
            "agency": "HĐND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps21",
        "name": "Đăng ký kế hoạch vốn đầu tư công trung hạn",
        "slaDays": 0,
        "stage": "CHUẨN BỊ ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs36",
            "name": "Đăng ký kế hoạch vốn đầu tư công trung hạn",
            "agency": "Sở Tài chính",
            "department": "",
            "slaDays": 0
          },
          {
            "id": "cs37",
            "name": "Trình / phê duyệt kế hoạch vốn",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 0
          }
        ]
      },
      {
        "id": "ps22",
        "name": "Lập báo cáo nghiên cứu khả thi đầu tư xây dựng, trình thẩm định và phê duyệt quyết định đầu tư",
        "slaDays": 23,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs38",
            "name": "Thẩm định dự án nhóm A",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 20
          },
          {
            "id": "cs39",
            "name": "Thẩm định dự án nhóm B",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs40",
            "name": "Thẩm định dự án nhóm C",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 10
          },
          {
            "id": "cs41",
            "name": "Phê duyệt quyết định đầu tư",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      },
      {
        "id": "ps23",
        "name": "Lập thiết kế xây dựng triển khai sau thiết kế cơ sở và dự toán của dự án, trình thẩm định và phê duyệt",
        "slaDays": 22,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs42",
            "name": "Thẩm định thiết kế và dự toán công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 20
          },
          {
            "id": "cs43",
            "name": "Thẩm định thiết kế and dự toán công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs44",
            "name": "Phê duyệt thiết kế và dự toán",
            "agency": "Chủ đầu tư",
            "department": "",
            "slaDays": 0
          }
        ]
      },
      {
        "id": "ps24",
        "name": "Thủ tục cho thuê, cho thuê mua nhà ở xã hội do Nhà nước đầu tư xây dựng bằng vốn đầu tư công",
        "slaDays": 15,
        "stage": "THỰC HIỆN ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs45",
            "name": "Kiểm tra / xử lý thủ tục cho thuê, cho thuê mua",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 10
          },
          {
            "id": "cs46",
            "name": "Phê duyệt / chấp thuận",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 5
          }
        ]
      },
      {
        "id": "ps25",
        "name": "Kiểm tra giá bán, giá thuê mua nhà ở xã hội",
        "slaDays": 15,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs47",
            "name": "Kiểm tra giá bán, giá thuê mua công trình cấp I, đặc biệt",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 15
          },
          {
            "id": "cs48",
            "name": "Kiểm tra giá bán, giá thuê mua công trình cấp II, III",
            "agency": "Sở Xây dựng",
            "department": "Phòng KT & VLXD",
            "slaDays": 10
          }
        ]
      },
      {
        "id": "ps26",
        "name": "Lập, trình phê duyệt giá thuê, giá thuê mua nhà ở xã hội",
        "slaDays": 18,
        "stage": "KẾT THÚC ĐẦU TƯ",
        "childSteps": [
          {
            "id": "cs49",
            "name": "Lập / thẩm định giá thuê, giá thuê mua",
            "agency": "Sở Xây dựng",
            "department": "",
            "slaDays": 15
          },
          {
            "id": "cs50",
            "name": "Phê duyệt giá thuê, giá thuê mua",
            "agency": "UBND TP",
            "department": "",
            "slaDays": 3
          }
        ]
      }
    ]
  }
];

export const INITIAL_ROLES = ['Admin', 'Lãnh đạo', 'Chuyên viên'];

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'u1',
    fullName: 'Quản trị hệ thống',
    phone: '0901234567',
    email: 'admin@example.com',
    username: 'admin',
    userType: 'agency',
    agencyId: '1', // Sở Xây dựng
    department: 'Phòng PTĐT',
    roleId: 'Admin'
  },
  {
    id: 'u2',
    fullName: 'Lãnh đạo Sở Xây dựng',
    phone: '0902222222',
    email: 'sxd@example.com',
    username: 'sxd',
    userType: 'agency',
    agencyId: '1', // Sở Xây dựng
    department: 'Phòng PTĐT',
    roleId: 'Lãnh đạo'
  },
  {
    id: 'u3',
    fullName: 'Lãnh đạo Sở NNMT',
    phone: '0903333333',
    email: 'snnmt@example.com',
    username: 'snnmt',
    userType: 'agency',
    agencyId: '3', // Sở NNMT
    department: '',
    roleId: 'Lãnh đạo'
  },
  {
    id: 'u4',
    fullName: 'Chủ đầu tư',
    phone: '0904444444',
    email: 'cdt@example.com',
    username: 'cdt',
    userType: 'investor',
    investorId: 'Công ty TNHH Thương mại – Xây dựng Lê Thành',
    roleId: 'Lãnh đạo'
  },
  {
    id: 'u5',
    fullName: 'Chuyên viên Sở Xây dựng',
    phone: '0905555555',
    email: 'sxd_cv@example.com',
    username: 'sxd_cv',
    userType: 'agency',
    agencyId: '1', // Sở Xây dựng
    department: 'Phòng PTĐT',
    roleId: 'Chuyên viên'
  },
  {
    id: 'u6',
    fullName: 'Lãnh đạo Sở Quy hoạch Kiến trúc',
    phone: '0905555556',
    email: 'sqhkt@example.com',
    username: 'sqhkt',
    userType: 'agency',
    agencyId: '2', // Sở Quy hoạch Kiến trúc
    department: 'Phòng PTĐT',
    roleId: 'Lãnh đạo'
  }
];
