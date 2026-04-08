"use client";

import { useEffect, useRef, useState } from "react";

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
}

/**
 * 검색 가능한 드롭다운(combobox) 컴포넌트.
 * - 입력창에 타이핑하면 실시간으로 옵션이 필터링됨
 * - 외부 클릭 시 드롭다운이 닫힘
 * - 옵션이 없거나 disabled일 때도 안전하게 동작
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "검색 또는 선택",
  disabled = false,
  emptyMessage = "옵션이 없습니다",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 외부 value 변경 시 input과 동기화
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        // 입력한 값이 옵션에 없으면 원래 value로 되돌림
        if (!options.includes(query)) {
          setQuery(value);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [options, query, value]);

  const filtered = query
    ? options.filter((opt) => opt.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleSelect = (opt: string) => {
    onChange(opt);
    setQuery(opt);
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    setOpen(true);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          className="form-control"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          style={{ paddingRight: value ? 30 : 12 }}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="지우기"
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9CA3AF",
              fontSize: 16,
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            maxHeight: 240,
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 16px", color: "#9CA3AF", fontSize: 13 }}>
              {options.length === 0 ? emptyMessage : "일치하는 결과가 없습니다"}
            </div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 14,
                  color: "#111827",
                  backgroundColor: opt === value ? "#F3F4F6" : "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = opt === value ? "#F3F4F6" : "transparent")
                }
              >
                {opt}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
