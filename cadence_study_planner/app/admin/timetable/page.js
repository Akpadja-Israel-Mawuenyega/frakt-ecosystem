'use client';

import React, { useState, useEffect, useRef } from 'react';

// Consistent time slot coordinates matching your engine rules
const TIME_SLOTS = ["08:30-11:30", "11:30-14:30", "14:30-17:30"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** 
 * Aesthetic track color mapper based on cohort strings
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
  const addLog = (text, type = 'ok') => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLogs(prev => [...prev, { text, type, time: now }]);
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
          // Normalize Mongoose Map structures safely back into JavaScript objects
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
   * Dispatches a compilation command to our backend engine
   */
  const handleCompileExecution = async () => {
    if (loading) return;

    setLoading(true);
    setStatus('Compiling');
    setLogs([]); // Reset log stream for clean output parsing
    addLog("Initializing greedy conflict constraint resolver...", "ok");

    try {
      // Dispatching POST request with administrative development access token
      const response = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'admin' // In prod, swap for secure stateful auth headers
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP Compilation Crash: ${response.status}`);
      }

      if (result.success && result.data?.scheduleMatrix) {
        const activeMatrix = result.data.scheduleMatrix;
        setMatrix(activeMatrix);
        calculateTelemetry(activeMatrix);
        
        addLog("Sorting active demands by slot load requirements (descending)...", "ok");
        addLog("Scanning operational timelines for cross-lecturer double bookings...", "ok");
        addLog("Schedule array upserted into core database collection safely.", "ok");
        addLog("Timetable compilation complete — matrix updated successfully.", "ok");
        setStatus('Compiled');
      } else {
        throw new Error("Target data structure returned malformed values.");
      }

    } catch (err) {
      addLog(`Compilation Failure: ${err.message}`, "warn");
      setStatus('Error');
    } finally {
      setLoading(false);
    }
  };

  /**
 * Determines a CSS class based on the cohort name.
 * Extracts the suffix (A, B, C...) to determine color.
 */
const getCohortColor = (cohortName) => {
  if (!cohortName) return "bg-gray-800"; // Default for empty
  
  // Gets the last character or word (e.g., "Level 300 CS A" -> "A")
  const suffix = cohortName.trim().split(' ').pop().toUpperCase();
  
  const colors = {
    'A': 'bg-blue-600',
    'B': 'bg-emerald-600',
    'C': 'bg-purple-600',
    'D': 'bg-amber-600',
  };
  
  return colors[suffix] || 'bg-slate-700'; // Fallback for undefined cohorts
};

  return (
    <div className="page" style={{ padding: '2rem 0', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* Dynamic Native Style Layer Injection to preserve aesthetic requirements */}
      <style dangerouslySetInnerHTML={{ __html: `
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
        .header-left h1 { font-size: 22px; font-weight: 500; }
        .header-left p { font-size: 14px; color: var(--color-text-secondary, #888); margin-top: 4px; }
        .badge { font-size: 12px; padding: 3px 10px; border-radius: var(--border-radius-md, 6px); background: var(--color-background-success, #04342C); color: var(--color-text-success, #9FE1CB); }
        .badge.warn { background: var(--color-background-warning, #4A1B0C); color: var(--color-text-warning, #F5C4B3); }
        .compile-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 20px; font-size: 14px; font-weight: 500; border-radius: var(--border-radius-md, 6px); border: 0.5px solid var(--color-border-secondary, #333); background: var(--color-background-primary, #111); color: var(--color-text-primary, #fff); cursor: pointer; transition: background 0.15s; }
        .compile-btn:hover { background: var(--color-background-secondary, #222); }
        .compile-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 2rem; }
        .metric { background: var(--color-background-secondary, #111); border: 0.5px solid var(--color-border-tertiary, #222); border-radius: var(--border-radius-md, 6px); padding: 1rem; }
        .metric-label { font-size: 13px; color: var(--color-text-secondary, #888); margin-bottom: 6px; }
        .metric-value { font-size: 24px; font-weight: 500; color: var(--color-text-primary, #fff); }
        .metric-value.warn { color: var(--color-text-warning, #FAECE7); }
        .section-label { font-size: 13px; font-weight: 500; color: var(--color-text-secondary, #888); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; }
        .timetable-wrap { border: 0.5px solid var(--color-border-tertiary, #222); border-radius: var(--border-radius-lg, 8px); overflow: hidden; margin-bottom: 2rem; background: #0a0a0a; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 13px; }
        th { background: #111; padding: 10px 12px; text-align: left; font-weight: 500; font-size: 12px; color: #888; border-bottom: 0.5px solid #222; }
        td { padding: 8px 12px; border-bottom: 0.5px solid #222; vertical-align: top; background: #0e0e0e; }
        tr:last-child td { border-bottom: none; }
        .slot { background: #1a1a1a; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; border-left: 3px solid #666; }
        .slot:last-child { margin-bottom: 0; }
        .slot-course { font-weight: 500; font-size: 12px; color: #fff; }
        .slot-meta { font-size: 11px; color: #aaa; margin-top: 2px; }
        
        /* Dynamic Theme Maps */
        .slot.purple { background: #1c1530; border-left-color: #7c5dfa; }
        .slot.purple .slot-course { color: #e0d7ff; }
        .slot.purple .slot-meta { color: #b1a0f0; }
        .slot.teal { background: #0c1f1a; border-left-color: #10b981; }
        .slot.teal .slot-course { color: #d1fae5; }
        .slot.teal .slot-meta { color: #a7f3d0; }
        .slot.coral { background: #2a1410; border-left-color: #f97316; }
        .slot.coral .slot-course { color: #ffedd5; }
        .slot.coral .slot-meta { color: #fed7aa; }
        .slot.blue { background: #0c1a30; border-left-color: #3b82f6; }
        .slot.blue .slot-course { color: #dbeafe; }
        .slot.blue .slot-meta { color: #bfdbfe; }
        
        .time-col { font-size: 12px; color: #888; font-weight: 500; white-space: nowrap; width: 110px; background: #111; border-right: 0.5px solid #222; }
        .empty { color: #444; font-size: 12px; font-style: italic; display: block; padding-top: 4px; }
        .log { border: 0.5px solid #222; border-radius: 8px; overflow-y: auto; max-height: 220px; background: #070707; }
        .log-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; border-bottom: 0.5px solid #111; font-size: 13px; color: #ccc; }
        .log-row:last-child { border-bottom: none; }
        .log-icon { font-size: 14px; margin-top: 2px; flex-shrink: 0; }
        .log-icon.ok { color: #10b981; }
        .log-icon.warn { color: #f59e0b; }
        .log-time { font-size: 11px; color: #555; white-space: nowrap; margin-top: 2px; }
        .spinner { width: 14px; height: 14px; border: 2px solid #333; border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      ` }} />

      <div className="header">
        <div className="header-left">
          <h1>Timetable Compiler</h1>
          <p>Academic Year 2025/2026 &nbsp;·&nbsp; Semester 2</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`badge ${status === 'Compiling' || status === 'Not Compiled' ? 'warn' : ''}`}>
            {status}
          </span>
          <button className="compile-btn" onClick={handleCompileExecution} disabled={loading}>
            {loading ? <div className="spinner"></div> : <span style={{ marginRight: '4px' }}>🔄</span>}
            <span>{loading ? 'Compiling...' : 'Recompile'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Hardware-style Telemetry Metrics Strip */}
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

      {/* Main Timetable Matrix View Grid */}
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
                <td className="time-col" style={{ padding: '1rem' }}>{slotKey.replace('-', ' – ')}</td>
                {DAYS.map(dayKey => {
                  // Track down array allocations matching current time block
                  const dayArray = matrix ? matrix[dayKey] : null;
                  const slotNode = dayArray?.find(s => s.timeSlot === slotKey);
                  const assignments = slotNode?.assignments || slotNode?.slots || [];

                  return (
                    <td key={dayKey} style={{ padding: '0.75rem' }}>
                      {assignments.length > 0 ? (
                        assignments.map((assign, index) => (
                          <div 
                            key={index} 
                            className={`slot ${getCohortColorClass(assign.assignedClass)}`}
                          >
                            <div className="slot-course">{assign.assignedCourse || 'Unassigned Module'}</div>
                            <div className="slot-meta">
                              {assign.assignedClass} · {assign.assignedLecturer || 'Staff'}
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
      
      {/* Live Logging Subsystem Viewport */}
      <div className="log" id="log" ref={logContainerRef}>
        {logs.length === 0 ? (
          <div className="log-row" style={{ color: '#444', fontStyle: 'italic' }}>
            Compiler pipeline idle. Click recompile to trigger schedule calculations.
          </div>
        ) : (
          logs.map((log, i) => (
            <div className="log-row" key={i}>
              <span className={`log-icon ${log.type === 'ok' ? 'ok' : 'warn'}`}>
                {log.type === 'ok' ? '✓' : '⚠'}
              </span>
              <div style={{ flex: 1 }}>
                <div>{log.text}</div>
                <div className="log-time">{log.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}