import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';

interface Teacher {
  id: string;
  name: string;
  subject: string;
}

interface CallLog {
  id: string;
  teacherId: string;
  teacherName: string;
  studentName?: string;
  studentClass?: string;
  date?: string;
  timestamp?: string;
  durationSec?: number;
  durationFormatted?: string;
  outcome?: string;
  remarks?: string;
}

interface TeacherCallStat {
  id: string;
  name: string;
  shortName: string;
  subject: string;
  minutes: number;
  callsCount: number;
  avgDurationSec: number;
}

const FALLBACK_TEACHERS: Teacher[] = [
  { id: 'TCH-101', name: 'Mrs. Sunita Sharma', subject: 'Mathematics' },
  { id: 'TCH-102', name: 'Mr. Rajesh Verma', subject: 'General Science' },
  { id: 'TCH-103', name: 'Ms. Ananya Roy', subject: 'English' },
];

const BAR_COLORS = [
  '#2563eb', // Royal Blue
  '#7c3aed', // Purple
  '#059669', // Emerald
  '#d97706', // Amber/Gold
  '#db2777', // Rose
  '#0891b2', // Cyan
];

function getWeekBoundaries(referenceDate = new Date()): { monday: Date; sunday: Date } {
  const d = new Date(referenceDate);
  const day = d.getDay();
  // In JS getDay(): Sunday = 0, Monday = 1, ... Saturday = 6
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
}

function parseLogDate(log: CallLog): Date | null {
  if (log.date) {
    const parts = log.date.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const parsed = new Date(y, m, day, 12, 0, 0);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  if (log.timestamp) {
    const parsed = new Date(log.timestamp);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

export const CallingReportChart: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>(FALLBACK_TEACHERS);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [timeframe, setTimeframe] = useState<'current_week' | 'all_time'>('current_week');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const storedTeachersRaw = localStorage.getItem('svis_live_permanent_teachers_v4');
      if (storedTeachersRaw) {
        const parsed = JSON.parse(storedTeachersRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTeachers(parsed);
        }
      }

      const storedLogsRaw = localStorage.getItem('svis_live_permanent_call_logs_v5');
      if (storedLogsRaw) {
        const parsed = JSON.parse(storedLogsRaw);
        if (Array.isArray(parsed)) {
          setCallLogs(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Error reading calling logs from localStorage', e);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleCustomRefresh = () => {
      loadData();
    };

    window.addEventListener('refreshCallingChart', handleCustomRefresh);
    window.addEventListener('storage', handleCustomRefresh);

    // Also expose a global trigger so vanilla JS can call window.refreshCallingChart()
    (window as unknown as { refreshCallingChart?: () => void }).refreshCallingChart = loadData;

    return () => {
      window.removeEventListener('refreshCallingChart', handleCustomRefresh);
      window.removeEventListener('storage', handleCustomRefresh);
    };
  }, [loadData]);

  const { monday, sunday } = useMemo(() => getWeekBoundaries(), []);

  const weekRangeFormatted = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${monday.toLocaleDateString('en-IN', options)} – ${sunday.toLocaleDateString('en-IN', options)}`;
  }, [monday, sunday]);

  // Filter logs based on timeframe
  const relevantLogs = useMemo(() => {
    if (timeframe === 'all_time') {
      return callLogs;
    }
    return callLogs.filter((log) => {
      const logDate = parseLogDate(log);
      if (!logDate) return false;
      return logDate >= monday && logDate <= sunday;
    });
  }, [callLogs, timeframe, monday, sunday]);

  // Aggregate stats per teacher
  const chartData: TeacherCallStat[] = useMemo(() => {
    // Map teachers to stats
    const teacherMap = new Map<string, TeacherCallStat>();

    teachers.forEach((t) => {
      // Short name e.g. "Mrs. Sunita" or "Mr. Rajesh"
      const nameParts = t.name.split(' ');
      const shortName = nameParts.length > 2 ? `${nameParts[0]} ${nameParts[1]}` : t.name;

      teacherMap.set(t.id, {
        id: t.id,
        name: t.name,
        shortName,
        subject: t.subject || 'Faculty',
        minutes: 0,
        callsCount: 0,
        avgDurationSec: 0,
      });
    });

    // Also account for logs with teacherName if teacherId not in teachers
    relevantLogs.forEach((log) => {
      let matchedTeacherId = log.teacherId;
      if (!teacherMap.has(matchedTeacherId)) {
        // Try match by name
        for (const [id, t] of teacherMap.entries()) {
          if (t.name === log.teacherName || log.teacherName?.includes(t.name)) {
            matchedTeacherId = id;
            break;
          }
        }
      }

      if (!teacherMap.has(matchedTeacherId)) {
        // Unknown teacher logged, add them
        const tName = log.teacherName || 'Unknown Teacher';
        teacherMap.set(matchedTeacherId || tName, {
          id: matchedTeacherId || tName,
          name: tName,
          shortName: tName,
          subject: 'Faculty',
          minutes: 0,
          callsCount: 0,
          avgDurationSec: 0,
        });
      }

      const stat = teacherMap.get(matchedTeacherId)!;
      const sec = log.durationSec || 60;
      stat.minutes += Math.round((sec / 60) * 10) / 10;
      stat.callsCount += 1;
    });

    // Final calculations and round minutes
    const result: TeacherCallStat[] = [];
    teacherMap.forEach((stat) => {
      // Round to 1 decimal place or whole number
      stat.minutes = Math.round(stat.minutes * 10) / 10;
      stat.avgDurationSec = stat.callsCount > 0 ? Math.round((stat.minutes * 60) / stat.callsCount) : 0;
      result.push(stat);
    });

    // Sort descending by minutes
    return result.sort((a, b) => b.minutes - a.minutes);
  }, [teachers, relevantLogs]);

  // Overall totals
  const totalMinutes = useMemo(() => {
    return Math.round(chartData.reduce((acc, curr) => acc + curr.minutes, 0) * 10) / 10;
  }, [chartData]);

  const totalCalls = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.callsCount, 0);
  }, [chartData]);

  const topCaller = useMemo(() => {
    if (chartData.length === 0 || chartData[0].minutes === 0) return null;
    return chartData[0];
  }, [chartData]);

  const avgCallMin = useMemo(() => {
    if (totalCalls === 0) return 0;
    return Math.round((totalMinutes / totalCalls) * 10) / 10;
  }, [totalMinutes, totalCalls]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadData();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #bfdbfe',
        borderRadius: '16px',
        padding: '20px 22px',
        boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.08), 0 8px 10px -6px rgba(37, 99, 235, 0.04)',
      }}
    >
      {/* Header with Title and Week Range */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <h4
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#1e1b4b',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                letterSpacing: '-0.01em',
              }}
            >
              Faculty Calling Minutes Analytics (Recharts Bar Chart)
            </h4>
          </div>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '0.84rem',
              color: '#64748b',
              fontWeight: 500,
            }}
          >
            {timeframe === 'current_week' ? (
              <span>
                📅 <strong>Current Week:</strong> {weekRangeFormatted} • Visualizing total talk time per faculty
              </span>
            ) : (
              <span>📅 <strong>All-Time Cumulative Calling Minutes</strong></span>
            )}
          </p>
        </div>

        {/* Action Controls & Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '9999px',
              border: '1px solid #cbd5e1',
            }}
          >
            <button
              type="button"
              onClick={() => setTimeframe('current_week')}
              style={{
                border: 'none',
                background: timeframe === 'current_week' ? '#2563eb' : 'transparent',
                color: timeframe === 'current_week' ? '#ffffff' : '#475569',
                padding: '5px 14px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              🗓️ Current Week
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('all_time')}
              style={{
                border: 'none',
                background: timeframe === 'all_time' ? '#2563eb' : 'transparent',
                color: timeframe === 'all_time' ? '#ffffff' : '#475569',
                padding: '5px 14px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              📈 All Time
            </button>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            title="Refresh calling chart data"
            style={{
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              borderRadius: '9999px',
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }}>
              🔄
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Metric Badges */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>
            ⏱️ Total Talk Time
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
            {totalMinutes} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>mins</span>
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
            📞 Calls Logged
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#14532d', marginTop: '2px' }}>
            {totalCalls} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>calls</span>
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
            border: '1px solid #e9d5ff',
            borderRadius: '12px',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase' }}>
            🏆 Top Caller
          </div>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#581c87',
              marginTop: '4px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {topCaller ? topCaller.shortName : 'No calls yet'}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            padding: '10px 14px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
            ⏳ Avg Duration
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#78350f', marginTop: '2px' }}>
            {avgCallMin} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>min/call</span>
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart Container */}
      <div
        style={{
          width: '100%',
          height: 310,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 12px 10px 6px',
          position: 'relative',
        }}
      >
        {chartData.length === 0 ? (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontSize: '0.9rem',
            }}
          >
            No faculty teachers found to plot.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 22, right: 20, left: -10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                unit="m"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as TeacherCallStat;
                    return (
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
                          fontSize: '0.82rem',
                          minWidth: '180px',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
                          👨‍🏫 {data.name}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.76rem', marginBottom: '6px' }}>
                          Dept: <strong>{data.subject}</strong> ({data.id})
                        </div>
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e3a8a', fontWeight: 700 }}>
                            <span>⏱️ Total Minutes:</span>
                            <span>{data.minutes} mins</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                            <span>📞 Parent Calls:</span>
                            <span style={{ fontWeight: 700 }}>{data.callsCount}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                            <span>⏳ Avg Duration:</span>
                            <span>{data.callsCount > 0 ? `${Math.round(data.avgDurationSec / 60 * 10) / 10}m` : '0m'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="minutes"
                name="Call Minutes"
                radius={[8, 8, 0, 0]}
                maxBarSize={55}
                animationDuration={800}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                  />
                ))}
                <LabelList
                  dataKey="minutes"
                  position="top"
                  formatter={(val: unknown) => `${val}m`}
                  style={{ fill: '#1e1b4b', fontWeight: 800, fontSize: 12 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Teacher Legend & Quick Breakdown Badges */}
      <div
        style={{
          marginTop: '14px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {chartData.map((t, idx) => (
          <div
            key={t.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '0.78rem',
              color: '#334155',
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: BAR_COLORS[idx % BAR_COLORS.length],
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{t.name}:</span>
            <strong style={{ color: '#1e1b4b' }}>{t.minutes}m</strong>
            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>({t.callsCount} calls)</span>
          </div>
        ))}
      </div>
    </div>
  );
};
