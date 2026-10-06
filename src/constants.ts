import { Project, AgencyStats, WorkflowStep } from './types';

export const PROJECT_STAGES = ['CHUẨN BỊ ĐẦU TƯ', 'THỰC HIỆN ĐẦU TƯ', 'KẾT THÚC ĐẦU TƯ', 'Hoàn thành'];
export const PROJECT_STEPS_DTC = [
  'Chấp thuận chủ trương đầu tư',
  'Quy hoạch chi tiết 1/500',
  'Quyết định đầu tư',
  'Giao đất / Cho thuê đất',
  'Thẩm định thiết kế cơ sở',
  'Giấy phép xây dựng',
  'Thi công xây dựng',
  'Nghiệm thu / Bàn giao'
];
export const PROJECT_STEPS_DN = [
  'Chấp thuận chủ trương đầu tư',
  'Quy hoạch chi tiết 1/500',
  'Giao đất / Cho thuê đất',
  'Thẩm định thiết kế cơ sở',
  'Giấy phép xây dựng',
  'Thi công xây dựng',
  'Nghiệm thu / Bàn giao'
];
export const PROJECT_STEPS = Array.from(new Set([...PROJECT_STEPS_DTC, ...PROJECT_STEPS_DN]));
export const PROJECT_REGIONS = ['TP.HCM', 'Bình Dương', 'Bà Rịa - Vũng Tàu'];
