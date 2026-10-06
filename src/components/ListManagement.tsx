import React, { useState } from 'react';
import { Trash2, Plus, Edit2, Save, X, UserPlus } from 'lucide-react';

interface ListManagementProps {
  items: string[];
  setItems: (items: string[]) => void;
  title: string;
  onAddUser?: (investor: string) => void;
  isEmbedded?: boolean;
}

const DESCRIPTIONS: Record<string, string> = {
  'Chủ đầu tư': 'Định nghĩa danh sách các chủ đầu tư tham gia thực hiện dự án.',
  'Nhóm dự án': 'Phân chia dự án theo các nhóm quy mô hoặc đặc thù quản lý.',
  'Phân loại dự án': 'Phân loại dự án theo tính chất công trình, nguồn vốn hoặc loại hình đầu tư.',
  'Cấp công trình': 'Quy định cấp thiết kế xây dựng công trình của dự án.',
  'Trạng thái dự án': 'Quản lý các trạng thái vòng đời thực hiện của dự án.',
  'Trạng thái bước': 'Định nghĩa các trạng thái thực hiện của từng thủ tục, bước con.',
  'Nguồn vốn': 'Quản lý danh mục các nguồn vốn đầu tư của dự án.'
};

export default function ListManagement({ items, setItems, title, onAddUser, isEmbedded }: ListManagementProps) {
  const [newItem, setNewItem] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  // Inline messages under the add box / the row being edited
  const [addError, setAddError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) {
      setAddError('Tên danh mục không được để trống.');
      return;
    }
    if (items.some(item => item.trim().toLowerCase() === trimmed.toLowerCase())) {
      setAddError(`"${trimmed}" đã có trong danh mục ${title}.`);
      return;
    }
    setAddError(null);
    setItems([...items, trimmed]);
    setNewItem('');
  };

  const handleDelete = (index: number) => {
    const itemToDelete = items[index];
    if (confirm(`Bạn có chắc chắn muốn xóa "${itemToDelete}" khỏi danh mục ${title} không?`)) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(items[index]);
    setEditError(null);
  };

  const saveEdit = (index: number) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError('Tên danh mục không được để trống.');
      return;
    }
    const otherItems = items.filter((_, i) => i !== index);
    if (otherItems.some(item => item.trim().toLowerCase() === trimmed.toLowerCase())) {
      setEditError(`"${trimmed}" đã có trong danh mục ${title}.`);
      return;
    }
    setEditError(null);

    const newItems = [...items];
    newItems[index] = trimmed;
    setItems(newItems);
    setEditingIndex(null);
    setEditValue('');
  };

  const description = DESCRIPTIONS[title] || `Quản lý danh mục ${title.toLowerCase()} trong hệ thống.`;

  const innerContent = (
    <>
      {!isEmbedded && (
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Quản lý {title}</h2>
          <p className="text-slate-500 text-sm mt-1">{description}</p>
        </div>
      )}
      
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
      <div className="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          value={newItem}
          onChange={(e) => { setNewItem(e.target.value); setAddError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={`Thêm ${title.toLowerCase()} mới...`} 
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium" 
        />
        <button 
          onClick={handleAdd}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0 text-sm cursor-pointer"
        >
          <Plus size={18} /> Thêm {title.toLowerCase()}
        </button>
      </div>
      {addError && <p role="alert" className="text-xs font-semibold text-rose-600">{addError}</p>}
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            {editingIndex === i ? (
              <div className="flex-1 mr-4 space-y-1">
                <input 
                  type="text" 
                  value={editValue}
                  onChange={(e) => { setEditValue(e.target.value); setEditError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(i); }}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg outline-none bg-white text-sm"
                />
                {editError && <p role="alert" className="text-xs font-semibold text-rose-600">{editError}</p>}
              </div>
            ) : (
              <span className="font-medium text-slate-700">{item}</span>
            )}
            <div className="flex items-center gap-2">
              {onAddUser && title === 'Chủ đầu tư' && (
                <button onClick={() => onAddUser(item)} className="text-blue-600 hover:text-blue-700 p-2" title="Tạo tài khoản">
                  <UserPlus size={18} />
                </button>
              )}
              {editingIndex === i ? (
                <>
                  <button onClick={() => saveEdit(i)} className="text-emerald-600 hover:text-emerald-700 p-2">
                    <Save size={18} />
                  </button>
                  <button onClick={() => setEditingIndex(null)} className="text-slate-500 hover:text-slate-600 p-2">
                    <X size={18} />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => startEdit(i)} className="text-blue-600 hover:text-blue-700 p-2">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(i)} className="text-rose-500 hover:text-rose-600 p-2">
                    <Trash2 size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (isEmbedded) {
    return <div className="space-y-6">{innerContent}</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6">
      {innerContent}
    </div>
  );
}
