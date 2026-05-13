"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { NES_ZIONA_STREETS, Street } from "@/lib/nes-ziona-streets";

const DAY_TO_NUM: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

function nextOccurrence(hebrewDay: string): Date {
  const target = DAY_TO_NUM[hebrewDay];
  const now = new Date();
  let delta = (target - now.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  const result = new Date(now);
  result.setDate(now.getDate() + delta);
  return result;
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

export function StreetSearch() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Street | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const suggestions = useMemo(() => {
    if (query.length < 2) return [];
    return NES_ZIONA_STREETS.filter((s) => s.name.includes(query)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(street: Street) {
    setSelected(street);
    setQuery(street.name);
    setOpen(false);
  }

  function clear() {
    setQuery("");
    setSelected(null);
    setOpen(false);
    inputRef.current?.focus();
  }

  const nextTakeout = selected ? nextOccurrence(selected.takeout_day) : null;
  const days = nextTakeout ? daysUntil(nextTakeout) : null;

  return (
    <>
      <style>{styles}</style>
      <div className="ss-root" dir="rtl">
        <div className="ss-label">חיפוש לפי רחוב — נס ציונה</div>

        <div className="ss-input-wrap">
          <span className="ss-icon">🔍</span>
          <input
            ref={inputRef}
            className="ss-input"
            placeholder="הקלד שם רחוב..."
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setOpen(true);
            }}
            onFocus={() => query.length >= 2 && setOpen(true)}
          />
          {query && (
            <button className="ss-clear" onClick={clear} aria-label="נקה">
              ×
            </button>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <ul className="ss-list" ref={listRef}>
            {suggestions.map((s) => (
              <li key={s.name} className="ss-item" onMouseDown={() => select(s)}>
                <span className="ss-street-name">{s.name}</span>
                <span className="ss-day-chip">הוצאה: {s.takeout_day}</span>
              </li>
            ))}
          </ul>
        )}

        {selected && nextTakeout && days !== null && (
          <div className={`ss-result ${days === 1 ? "ss-result--urgent" : ""}`}>
            <div className="ss-result-street">רחוב {selected.name}</div>
            <div className="ss-result-row">
              <span className="ss-result-label">יום ההוצאה הקרוב</span>
              <span className="ss-result-date">
                {nextTakeout.toLocaleDateString("he-IL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
            </div>
            <div className="ss-result-row">
              <span className="ss-result-label">יום הפינוי</span>
              <span className="ss-result-day">{selected.collection_day}</span>
            </div>
            <div className={`ss-countdown ${days === 1 ? "urgent" : ""}`}>
              {days === 1 ? "⏰ מחר!" : days === 2 ? "בעוד יומיים" : `בעוד ${days} ימים`}
            </div>
          </div>
        )}

        {open && query.length >= 2 && suggestions.length === 0 && (
          <div className="ss-empty">לא נמצא רחוב עם השם &quot;{query}&quot;</div>
        )}
      </div>
    </>
  );
}

const styles = `
  .ss-root {
    padding: 12px 12px 8px;
    border-bottom: 1px solid #2e3348;
    position: relative;
  }
  .ss-label {
    font-size: 10px; font-weight: 700; color: #7880a0;
    text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;
  }
  .ss-input-wrap {
    display: flex; align-items: center; gap: 8px;
    background: #0f1117; border: 1px solid #2e3348; border-radius: 8px;
    padding: 7px 10px;
    transition: border-color 0.15s;
  }
  .ss-input-wrap:focus-within { border-color: #38e07b; }
  .ss-icon { font-size: 14px; flex-shrink: 0; }
  .ss-input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #e8eaf2; font-family: 'Heebo', sans-serif; font-size: 14px;
    text-align: right;
  }
  .ss-input::placeholder { color: #7880a0; }
  .ss-clear {
    background: none; border: none; color: #7880a0; font-size: 18px;
    cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0;
  }
  .ss-clear:hover { color: #e8eaf2; }

  .ss-list {
    position: absolute; right: 12px; left: 12px; top: 100%;
    background: #1a1d27; border: 1px solid #2e3348; border-radius: 8px;
    list-style: none; margin: 4px 0 0; padding: 4px 0;
    z-index: 100; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    max-height: 260px; overflow-y: auto;
  }
  .ss-item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; cursor: pointer; gap: 8px;
    transition: background 0.1s;
  }
  .ss-item:hover { background: #22263a; }
  .ss-street-name { font-size: 14px; color: #e8eaf2; }
  .ss-day-chip {
    font-size: 10px; color: #38e07b; background: #38e07b18;
    padding: 2px 7px; border-radius: 10px; white-space: nowrap; flex-shrink: 0;
  }

  .ss-result {
    margin-top: 10px; border-radius: 10px;
    background: #22263a; border: 1px solid #2e3348;
    padding: 12px; display: flex; flex-direction: column; gap: 6px;
  }
  .ss-result--urgent { border-color: #f87171; }
  .ss-result-street { font-size: 15px; font-weight: 700; color: #e8eaf2; }
  .ss-result-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .ss-result-label { font-size: 11px; color: #7880a0; }
  .ss-result-date { font-size: 13px; font-weight: 600; color: #38e07b; }
  .ss-result-day { font-size: 12px; color: #a0a8c0; }
  .ss-countdown {
    font-size: 12px; font-weight: 700; color: #7880a0;
    padding-top: 6px; border-top: 1px solid #2e3348;
  }
  .ss-countdown.urgent { color: #f87171; }

  .ss-empty {
    margin-top: 8px; font-size: 12px; color: #7880a0; text-align: center; padding: 6px 0;
  }
`;
