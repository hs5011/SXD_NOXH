import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  group?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  error?: boolean;
}

const removeTones = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Chọn...',
  className = '',
  error = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter((opt) => {
    const normLabel = removeTones(opt.label);
    const normQuery = removeTones(searchQuery);
    return normLabel.includes(normQuery);
  });

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  // Group filtered options if they have groups
  const hasGroups = options.some((opt) => opt.group);
  const groups: { [key: string]: SearchableOption[] } = {};
  const ungrouped: SearchableOption[] = [];

  if (hasGroups) {
    filteredOptions.forEach((opt) => {
      if (opt.group) {
        if (!groups[opt.group]) {
          groups[opt.group] = [];
        }
        groups[opt.group].push(opt);
      } else {
        ungrouped.push(opt);
      }
    });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-4 py-2 bg-white border rounded-2xl text-sm outline-none transition-all flex items-center justify-between gap-2 cursor-pointer select-none ${
          error
            ? 'border-rose-300 ring-rose-500/10'
            : isOpen
            ? 'border-blue-500 ring-4 ring-blue-500/10'
            : 'border-slate-200 hover:border-slate-300'
        } ${className}`}
      >
        {/* One line only: long names are cut with "…" and shown in full on hover */}
        <span
          className={`min-w-0 truncate ${selectedOption ? 'text-slate-800 font-medium' : 'text-slate-400'}`}
          title={selectedOption ? selectedOption.label : undefined}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedOption && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-0.5 hover:bg-slate-200/50 rounded-full transition-colors"
              title="Bỏ chọn"
            >
              <X size={14} className="text-slate-400" />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full min-w-[min(18rem,90vw)] mt-1.5 bg-white border border-slate-100 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
          {/* Search Input Area */}
          <div className="p-2 border-b border-slate-50 flex items-center gap-2 bg-slate-50/50">
            <Search size={14} className="text-slate-400 ml-1 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Tìm kiếm..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-none text-xs outline-none text-slate-700 placeholder:text-slate-400 py-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 hover:bg-slate-200/50 rounded-full transition-colors"
              >
                <X size={12} className="text-slate-400" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto p-1.5 scrollbar-thin">
            {filteredOptions.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400 font-medium italic">
                Không tìm thấy kết quả
              </div>
            ) : hasGroups ? (
              <>
                {ungrouped.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      value === opt.value
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </div>
                ))}
                {Object.entries(groups).map(([groupName, groupOpts]) => (
                  <div key={groupName} className="space-y-0.5 mt-1">
                    <div className="px-3 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 rounded-lg">
                      {groupName}
                    </div>
                    {groupOpts.map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => handleSelect(opt.value)}
                        className={`w-full text-left px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                          value === opt.value
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                    value === opt.value
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
