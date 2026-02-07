import React, { useState, useEffect, useRef } from 'react';

interface DateMarkerModalProps {
  onConfirm: (date: string, showTime: boolean) => void;
  onCancel: () => void;
}

export const DateMarkerModal: React.FC<DateMarkerModalProps> = ({ onConfirm, onCancel }) => {
  // Default to today's date
  const today = new Date();
  const defaultDate = today.toISOString().split('T')[0];
  const defaultTime = today.toTimeString().slice(0, 5);

  const [date, setDate] = useState(defaultDate);
  const [includeTime, setIncludeTime] = useState(false);
  const [time, setTime] = useState(defaultTime);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dateInputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build ISO date string
    let isoDate: string;
    if (includeTime) {
      isoDate = `${date}T${time}:00`;
    } else {
      isoDate = `${date}T00:00:00`;
    }

    onConfirm(isoDate, includeTime);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="date-marker-overlay" onKeyDown={handleKeyDown}>
      <form className="date-marker-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-icon">&#128197;</span>
          <h2>Add Date Marker</h2>
        </div>

        <div className="form-group">
          <label htmlFor="date-input">Date</label>
          <input
            ref={dateInputRef}
            id="date-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-input"
            required
          />
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeTime}
              onChange={(e) => setIncludeTime(e.target.checked)}
            />
            <span className="checkbox-text">Include time</span>
          </label>
        </div>

        {includeTime && (
          <div className="form-group">
            <label htmlFor="time-input">Time</label>
            <input
              id="time-input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="time-input"
            />
          </div>
        )}

        <div className="modal-buttons">
          <button type="button" className="btn btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-confirm">
            Add Marker
          </button>
        </div>
      </form>

      <style>{`
        .date-marker-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(4px);
        }

        .date-marker-modal {
          background: rgba(26, 26, 46, 0.98);
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 12px;
          padding: 24px;
          min-width: 320px;
          max-width: 400px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }

        .modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
        }

        .modal-icon {
          font-size: 28px;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #ffffff;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 8px;
        }

        .date-input,
        .time-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid rgba(78, 205, 196, 0.3);
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.3);
          color: white;
          font-size: 14px;
          box-sizing: border-box;
        }

        .date-input:focus,
        .time-input:focus {
          outline: none;
          border-color: #4ecdc4;
          box-shadow: 0 0 0 2px rgba(78, 205, 196, 0.2);
        }

        /* Custom styling for date/time inputs */
        .date-input::-webkit-calendar-picker-indicator,
        .time-input::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }

        .checkbox-group {
          margin: 20px 0;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #4ecdc4;
          cursor: pointer;
        }

        .checkbox-text {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .modal-buttons {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }

        .btn {
          padding: 10px 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }

        .btn-cancel {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .btn-cancel:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .btn-confirm {
          background: #4ecdc4;
          color: #1a1a2e;
          font-weight: 600;
        }

        .btn-confirm:hover {
          background: #5fd3d3;
        }

        .btn:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
};
