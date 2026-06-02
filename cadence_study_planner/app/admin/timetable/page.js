'use client';

import React, { useState, useEffect, useRef } from 'react';

// Consistent time slot coordinates matching your engine rules
const TIME_SLOTS = ["08:30-11:30", "11:30-14:30", "14:30-17:30"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** * Aesthetic track color mapper based on cohort strings
*/ 
const getCohortColorClass = (cohort) => {
  if (!cohort) return 'blue';
  
  // Extract the suffix (e.g., "Level 300 CS A" -> "A")
  const suffix = cohort.trim().split(' ').pop().toUpperCase();
  
  const mapping = {
    'A': 'purple',
    'B': 'teal',
    'C': 'coral',
    'D': 'blue'
  };
  
  return mapping[suffix] || 'blue';
};

/**
 * Admin Timetable Compiler Interface
 * Connects directly to the backend greedy constraint engine.
 */
export default function AdminTimetableCompiler() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [matrix, setMatrix] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // Real-time calculated telemetry metrics
  const [metrics, setMetrics] = useState({
    totalDemands: 0,
    cohortsScheduled: 0,
    slotsAllocated: 0,
    underAllocated: 0
  });

  const logContainerRef = useRef(null);

  // Helper to append diagnostic traces to our view console
  const setSingleLog = (text, type = 'ok') => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs([{ text, type, time: now }]);
  };

  /**
   * Automatically scroll logs to the bottom on append updates
   */
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  /**
   * Pulls the existing active timetable schema state on layout initialization
   */
  useEffect(() => {
    async function fetchCurrentTimetable() {
      try {
        setLoading(true);
        setStatus('Fetching');
        const res = await fetch('/api/timetable/current');
        const json = await res.json();

        if (json.success && json.data?.scheduleMatrix) {
          const normalizedMatrix = json.data.scheduleMatrix;
          setMatrix(normalizedMatrix);
          calculateTelemetry(normalizedMatrix);
          setLogs([{ text: "Active deployed timetable loaded successfully from database sync.", type: "ok", time: "Now" }]);
          setStatus('Compiled');
        } else {
          setLogs([{ text: "No compiled master timetable detected for this semester. Ready to run engine initialization.", type: "warn", time: "Now" }]);
          setStatus('Not Compiled');
        }
      } catch (err) {
        setLogs([{ text: `Failed to initialize system telemetry: ${err.message}`, type: 'warn', time: 'Now' }]);
      } finally {
        setLoading(false);
      }
    }
    fetchCurrentTimetable();
  }, []);

  /**
   * Processes structural metrics directly from the solved allocation blocks
   */
  const calculateTelemetry = (scheduleMap) => {
    let allocations = 0;
    const uniqueCohorts = new Set();

    DAYS.forEach(day => {
      const daySlots = scheduleMap[day] || [];
      daySlots.forEach(slot => {
        const slotsArray = slot.assignments || slot.slots || [];
        slotsArray.forEach(assign => {
          if (assign.assignedClass) {
            allocations++;
            uniqueCohorts.add(assign.assignedClass);
          }
        });
      });
    });

    setMetrics(prev => ({
      ...prev,
      cohortsScheduled: uniqueCohorts.size,
      slotsAllocated: allocations
    }));
  };

  /**
   * Utility delay function for simulating async wait times in logs (optional).
   */
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Dispatches a compilation command to our backend engine
   */
  const handleCompileExecution = async () => {
  if (loading) return;

  setLoading(true);
  setStatus('Compiling');

  setSingleLog(
    "Initializing greedy conflict constraint resolver..."
    );
    
  await wait(800); 

  try {
    const response = await fetch('/api/timetable/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'admin'
      }
    });

    setSingleLog(
      "Compilation engine responded successfully."
    );

    await wait(500);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.message || `HTTP Compilation Crash: ${response.status}`
      );
    }

    setSingleLog(
      "Parsing generated allocation matrix..."
    );

    await wait(500);

    if (result.success && result.data?.scheduleMatrix) {

      const activeMatrix = result.data.scheduleMatrix;

      setSingleLog(
        "Updating active timetable state..."
      );

      await wait(300);

      setMatrix(activeMatrix);

      setSingleLog(
        "Recalculating telemetry metrics..."
      );

      await wait(300);

      calculateTelemetry(activeMatrix);

      setSingleLog(
        "Timetable compilation completed successfully."
      );

      setStatus('Compiled');

    } else {
      throw new Error(
        "Target data structure returned malformed values."
      );
    }

  } catch (err) {

    await wait(500); // Simulate delay before logging error

    setSingleLog(
      `Compilation Failure: ${err.message}`,
      "warn"
    );

    setStatus('Error');

  } finally {
    setLoading(false);
  }
};

  return (
    <div className="page" style={{ padding: '2rem 0', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* Dynamic Native Style Layer Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
        .header-left h1 { font-size: 22px; font-weight: 500; }
        .header-left p { font-size: 14px; color: #888; margin-top: 4px; }
        .badge { font-size: 12px; padding: 3px 10px; border-radius: 6px; background: #04342C; color: #9FE1CB; }
        .badge.warn { background: #4A1B0C; color: #F5C4B3; }
        .compile-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; font-size: 14px; font-weight: 500; border-radius: 6px; border: 0.5px solid #333; background: #111; color: #fff; cursor: pointer; }
        .compile-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 2rem; }
        .metric { background: #111; border: 0.5px solid #222; border-radius: 6px; padding: 1rem; }
        .metric-label { font-size: 13px; color: #888; margin-bottom: 6px; }
        .metric-value { font-size: 24px; font-weight: 500; color: #fff; }
        .metric-value.warn { color: #FAECE7; }
        .section-label { font-size: 13px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; }
        .timetable-wrap { border: 0.5px solid #222; border-radius: 8px; overflow: hidden; margin-bottom: 2rem; background: #0a0a0a; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
        th { background: #111; padding: 10px 12px; text-align: left; font-weight: 500; font-size: 12px; color: #888; border-bottom: 0.5px solid #222; }
        td { padding: 8px 12px; border-bottom: 0.5px solid #222; vertical-align: top; background: #0e0e0e; }
        .slot { background: #1a1a1a; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; border-left: 3px solid #666; }
        .slot-course { font-weight: 500; font-size: 12px; color: #fff; }
        .slot-meta { font-size: 11px; color: #aaa; margin-top: 2px; }
        .slot.purple { background: #1c1530; border-left-color: #7c5dfa; }
        .slot.teal { background: #0c1f1a; border-left-color: #10b981; }
        .slot.coral { background: #2a1410; border-left-color: #f97316; }
        .slot.blue { background: #0c1a30; border-left-color: #3b82f6; }
        .time-col { font-size: 12px; color: #888; font-weight: 500; width: 110px; background: #111; border-right: 0.5px solid #222; }
        .empty { color: #444; font-size: 12px; font-style: italic; }
        .log { border: 0.5px solid #222; border-radius: 8px; overflow-y: auto; max-height: 220px; background: #070707; }
        .log-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; border-bottom: 0.5px solid #111; font-size: 13px; color: #ccc; }
        .log-row.ok { background: rgba(16, 185, 129, 0.03); }
        .log-row.warn { background: rgba(245, 158, 11, 0.03); } 
        .spinner { width: 14px; height: 14px; border: 2px solid #333; border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />

      <div className="header">
        <div className="header-left">
          <h1>Timetable Compiler</h1>
          <p>Academic Year 2025/2026 · Semester 2</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`badge ${status === 'Compiling' || status === 'Not Compiled' ? 'warn' : ''}`}>
            {status}
          </span>
          <button className="compile-btn" onClick={handleCompileExecution} disabled={loading}>
            {loading ? <div className="spinner"></div> : <span>🔄 Recompile</span>}
          </button>
        </div>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">System State</div>
          <div className="metric-value" style={{ fontSize: '15px', color: loading ? '#f59e0b' : '#10b981' }}>
            {loading ? 'PROCESSING_GRAPH' : 'ENGINE_ONLINE'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Active Cohorts</div>
          <div className="metric-value">{metrics.cohortsScheduled}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Allocated Blocks</div>
          <div className="metric-value">{metrics.slotsAllocated}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Unresolved Clashes</div>
          <div className="metric-value warn">{metrics.underAllocated}</div>
        </div>
      </div>

      <p className="section-label">Generated Schedule</p>

      <div className="timetable-wrap">
        <table>
          <thead>
            <tr>
              <th>Time Slot</th>
              {DAYS.map(day => <th key={day}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map(slotKey => (
              <tr key={slotKey}>
                <td className="time-col">{slotKey.replace('-', ' – ')}</td>
                {DAYS.map(dayKey => {
                  const dayArray = matrix ? matrix[dayKey] : null;
                  const slotNode = dayArray?.find(s => s.timeSlot === slotKey);
                  const assignments = slotNode?.assignments || [];

                  return (
                    <td key={dayKey}>
                      {assignments.length > 0 ? (
                        assignments.map((assign, index) => (
                          <div 
                            key={`${assign.assignedCourse}-${assign.assignedClass}-${index}`} 
                            className={`slot ${getCohortColorClass(assign.assignedClass)}`}
                          >
                            <div className="slot-course">
                            {typeof assign.assignedCourse === 'string'
                              ? assign.assignedCourse
                              : `${assign.assignedCourse.code} - ${assign.assignedCourse.name}`}
                            </div>
                            <div className="slot-meta">
                              {assign.assignedClass} · {assign.assignedLecturer}
                            </div>
                          </div>
                        ))
                      ) : (
                        <span className="empty">No classes</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="section-label">Compiler Diagnostic Log</p>
      
      <div className="log" ref={logContainerRef}>
        {logs.map((log, i) => (
          <div className={`log-row ${log.type}`} key={i}>
            <span
              style={{
                color: log.type === 'ok' ? '#10b981' : '#f59e0b',
                fontWeight: 700,
                minWidth: '16px'
              }}
            >
              {log.type === 'ok' ? '✓' : '⚠'}
            </span>

            <div style={{ color: '#ccc' }}>
              {log.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}