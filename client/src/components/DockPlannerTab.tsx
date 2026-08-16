import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchDockPlanner,
  type DockPlannerData,
  type DockPlannerDock,
  type DockPlannerSlot,
  type FilterOptions,
} from "../services/adminApi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const VIEW_OPTIONS = ["day", "week", "month"] as const;
type ViewMode = (typeof VIEW_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getWeekDays(base: Date): Date[] {
  const start = new Date(base);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getMonthDays(base: Date): Date[] {
  const year = base.getFullYear();
  const month = base.getMonth();
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function formatDayNum(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit" });
}

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

interface Props {
  facilities: FilterOptions["facilities"];
  defaultFacilityId?: string;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function DockPlannerTab({ facilities, defaultFacilityId }: Props) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId || facilities[0]?.facility_id || "");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [data, setData] = useState<DockPlannerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [showDocks, setShowDocks] = useState<string[]>([]); // empty = all
  const [showShipmentInfo, setShowShipmentInfo] = useState(true);

  // Popup
  const [popupSlot, setPopupSlot] = useState<DockPlannerSlot | null>(null);

  // Compute date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      return { start: toDateStr(baseDate), end: toDateStr(baseDate) };
    } else if (viewMode === "week") {
      const days = getWeekDays(baseDate);
      return { start: toDateStr(days[0]), end: toDateStr(days[6]) };
    } else {
      const days = getMonthDays(baseDate);
      return { start: toDateStr(days[0]), end: toDateStr(days[days.length - 1]) };
    }
  }, [viewMode, baseDate]);

  // Load data
  const loadData = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDockPlanner(facilityId, dateRange.start, dateRange.end);
      setData(result);
      // Reset dock filter when facility changes
      if (showDocks.length > 0) {
        const validIds = new Set(result.docks.map((d) => d.dock_id));
        setShowDocks((prev) => prev.filter((id) => validIds.has(id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dock planner");
    } finally {
      setLoading(false);
    }
  }, [facilityId, dateRange.start, dateRange.end]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter docks
  const visibleDocks = useMemo(() => {
    if (!data) return [];
    if (showDocks.length === 0) return data.docks;
    return data.docks.filter((d) => showDocks.includes(d.dock_id));
  }, [data, showDocks]);

  // Build slot lookup: dock_id -> date -> hour -> slot
  const slotGrid = useMemo(() => {
    if (!data) return new Map<string, Map<string, Map<number, DockPlannerSlot>>>();
    const grid = new Map<string, Map<string, Map<number, DockPlannerSlot>>>();
    for (const slot of data.slots) {
      const dockId = slot.dock_id;
      const date = slot.slot_start_ts.slice(0, 10);
      const hour = parseInt(slot.slot_start_ts.slice(11, 13), 10);
      if (!grid.has(dockId)) grid.set(dockId, new Map());
      const dockMap = grid.get(dockId)!;
      if (!dockMap.has(date)) dockMap.set(date, new Map());
      dockMap.get(date)!.set(hour, slot);
    }
    return grid;
  }, [data]);

  // Navigation
  function navigate(dir: -1 | 1) {
    setBaseDate((prev) => {
      if (viewMode === "day") return addDays(prev, dir);
      if (viewMode === "week") return addDays(prev, dir * 7);
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  function goToday() {
    setBaseDate(new Date());
  }

  // Get dates for the current view
  const viewDates = useMemo(() => {
    if (viewMode === "day") return [baseDate];
    if (viewMode === "week") return getWeekDays(baseDate);
    return getMonthDays(baseDate);
  }, [viewMode, baseDate]);

  return (
    <div className="dock-planner">
      {/* Controls */}
      <div className="dock-planner__controls">
        <div className="dock-planner__nav">
          <select
            className="dock-planner__facility-select"
            value={facilityId}
            onChange={(e) => setFacilityId(e.target.value)}
          >
            {facilities.map((f) => (
              <option key={f.facility_id} value={f.facility_id}>
                {f.facility_name} ({f.city})
              </option>
            ))}
          </select>

          <div className="dock-planner__view-toggle">
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v}
                className={`dock-planner__view-btn ${viewMode === v ? "dock-planner__view-btn--active" : ""}`}
                onClick={() => setViewMode(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <div className="dock-planner__date-nav">
            <button className="dock-planner__nav-btn" onClick={() => navigate(-1)}>&lsaquo;</button>
            <button className="dock-planner__today-btn" onClick={goToday}>Today</button>
            <button className="dock-planner__nav-btn" onClick={() => navigate(1)}>&rsaquo;</button>
            <span className="dock-planner__date-label">
              {viewMode === "day" && baseDate.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
              {viewMode === "week" && `${formatDayShort(getWeekDays(baseDate)[0])} — ${formatDayShort(getWeekDays(baseDate)[6])}`}
              {viewMode === "month" && baseDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* Filters row */}
        <div className="dock-planner__filters">
          <label className="dock-planner__filter-label">
            <input
              type="checkbox"
              checked={showShipmentInfo}
              onChange={(e) => setShowShipmentInfo(e.target.checked)}
            />
            Show shipment details
          </label>

          {data && data.docks.length > 0 && (
            <div className="dock-planner__dock-filter">
              <span className="dock-planner__filter-label">Docks:</span>
              <button
                className={`dock-planner__dock-chip ${showDocks.length === 0 ? "dock-planner__dock-chip--active" : ""}`}
                onClick={() => setShowDocks([])}
              >
                All
              </button>
              {data.docks.map((d) => (
                <button
                  key={d.dock_id}
                  className={`dock-planner__dock-chip dock-planner__dock-chip--${d.dock_type.toLowerCase()} ${showDocks.includes(d.dock_id) ? "dock-planner__dock-chip--active" : ""}`}
                  onClick={() => {
                    setShowDocks((prev) =>
                      prev.includes(d.dock_id)
                        ? prev.filter((id) => id !== d.dock_id)
                        : [...prev, d.dock_id]
                    );
                  }}
                >
                  {d.dock_code} ({d.dock_type})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="dock-planner__legend">
          <span className="dock-planner__legend-item"><span className="dock-planner__legend-dot dock-planner__legend-dot--available"></span> Available</span>
          <span className="dock-planner__legend-item"><span className="dock-planner__legend-dot dock-planner__legend-dot--occupied"></span> Occupied</span>
          <span className="dock-planner__legend-item"><span className="dock-planner__legend-dot dock-planner__legend-dot--blocked"></span> Blocked</span>
          <span className="dock-planner__legend-item"><span className="dock-planner__legend-dot dock-planner__legend-dot--closed"></span> Closed</span>
        </div>
      </div>

      {/* Error / Loading */}
      {error && <div className="admin__error">{error}</div>}
      {loading && <div className="dock-planner__loading">Loading planner...</div>}

      {/* Summary strip */}
      {data && !loading && data.summary && (
        <DaySummaryStrip summary={data.summary} viewDates={viewDates} />
      )}

      {/* Calendar Grid */}
      {data && !loading && (
        viewMode === "day" ? (
          <DayView
            docks={visibleDocks}
            slotGrid={slotGrid}
            date={toDateStr(baseDate)}
            showShipmentInfo={showShipmentInfo}
            onSlotClick={setPopupSlot}
          />
        ) : viewMode === "week" ? (
          <WeekView
            docks={visibleDocks}
            slotGrid={slotGrid}
            dates={viewDates.map(toDateStr)}
            viewDatesRaw={viewDates}
            showShipmentInfo={showShipmentInfo}
            onSlotClick={setPopupSlot}
          />
        ) : (
          <MonthView
            docks={visibleDocks}
            slotGrid={slotGrid}
            dates={viewDates.map(toDateStr)}
            viewDatesRaw={viewDates}
            summary={data.summary}
            onDayClick={(d) => { setBaseDate(new Date(d)); setViewMode("day"); }}
          />
        )
      )}

      {/* Slot Popup */}
      {popupSlot && (
        <SlotDetailPopup slot={popupSlot} docks={data?.docks || []} onClose={() => setPopupSlot(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day Summary Strip
// ---------------------------------------------------------------------------

function DaySummaryStrip({ summary, viewDates }: { summary: DockPlannerData["summary"]; viewDates: Date[] }) {
  const totals = useMemo(() => {
    let occupied = 0, available = 0, blocked = 0, total = 0;
    for (const d of viewDates) {
      const key = toDateStr(d);
      const s = summary[key];
      if (s) {
        occupied += s.occupied;
        available += s.available;
        blocked += s.blocked;
        total += s.total_slots;
      }
    }
    return { occupied, available, blocked, total };
  }, [summary, viewDates]);

  const pct = totals.total > 0 ? Math.round((totals.occupied / totals.total) * 100) : 0;

  return (
    <div className="dock-planner__summary-strip">
      <div className="dock-planner__summary-item">
        <span className="dock-planner__summary-value">{totals.total}</span>
        <span className="dock-planner__summary-label">Total Slots</span>
      </div>
      <div className="dock-planner__summary-item dock-planner__summary-item--occupied">
        <span className="dock-planner__summary-value">{totals.occupied}</span>
        <span className="dock-planner__summary-label">Occupied</span>
      </div>
      <div className="dock-planner__summary-item dock-planner__summary-item--available">
        <span className="dock-planner__summary-value">{totals.available}</span>
        <span className="dock-planner__summary-label">Available</span>
      </div>
      <div className="dock-planner__summary-item dock-planner__summary-item--blocked">
        <span className="dock-planner__summary-value">{totals.blocked}</span>
        <span className="dock-planner__summary-label">Blocked</span>
      </div>
      <div className="dock-planner__summary-item">
        <span className="dock-planner__summary-value">{pct}%</span>
        <span className="dock-planner__summary-label">Utilization</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day View — Dock rows × 24 hour columns
// ---------------------------------------------------------------------------

function DayView({
  docks, slotGrid, date, showShipmentInfo, onSlotClick,
}: {
  docks: DockPlannerDock[];
  slotGrid: Map<string, Map<string, Map<number, DockPlannerSlot>>>;
  date: string;
  showShipmentInfo: boolean;
  onSlotClick: (s: DockPlannerSlot) => void;
}) {
  return (
    <div className="dock-planner__day-grid-wrapper">
      <div className="dock-planner__day-grid">
        {/* Header row — hours */}
        <div className="dock-planner__grid-header">
          <div className="dock-planner__dock-label-cell">Dock</div>
          {HOURS.map((h) => (
            <div key={h} className="dock-planner__hour-header">{formatHour(h)}</div>
          ))}
        </div>

        {/* Dock rows */}
        {docks.map((dock) => (
          <div key={dock.dock_id} className="dock-planner__dock-row">
            <div className="dock-planner__dock-label-cell">
              <span className="dock-planner__dock-name">{dock.dock_code}</span>
              <span className={`dock-planner__dock-type dock-planner__dock-type--${dock.dock_type.toLowerCase()}`}>
                {dock.dock_type}
              </span>
            </div>
            {HOURS.map((h) => {
              const slot = slotGrid.get(dock.dock_id)?.get(date)?.get(h);
              return (
                <SlotCell
                  key={h}
                  slot={slot}
                  showShipmentInfo={showShipmentInfo}
                  onClick={() => slot && onSlotClick(slot)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week View — Compact: Dock × Day with hour occupancy bars
// ---------------------------------------------------------------------------

function WeekView({
  docks, slotGrid, dates, viewDatesRaw, showShipmentInfo, onSlotClick,
}: {
  docks: DockPlannerDock[];
  slotGrid: Map<string, Map<string, Map<number, DockPlannerSlot>>>;
  dates: string[];
  viewDatesRaw: Date[];
  showShipmentInfo: boolean;
  onSlotClick: (s: DockPlannerSlot) => void;
}) {
  return (
    <div className="dock-planner__week-grid-wrapper">
      <div className="dock-planner__week-grid">
        {/* Header row */}
        <div className="dock-planner__week-header">
          <div className="dock-planner__dock-label-cell">Dock</div>
          {viewDatesRaw.map((d, i) => (
            <div key={i} className="dock-planner__week-day-header">{formatDayShort(d)}</div>
          ))}
        </div>

        {/* Dock rows */}
        {docks.map((dock) => (
          <div key={dock.dock_id} className="dock-planner__week-dock-row">
            <div className="dock-planner__dock-label-cell">
              <span className="dock-planner__dock-name">{dock.dock_code}</span>
              <span className={`dock-planner__dock-type dock-planner__dock-type--${dock.dock_type.toLowerCase()}`}>
                {dock.dock_type}
              </span>
            </div>
            {dates.map((date) => {
              const daySlots = slotGrid.get(dock.dock_id)?.get(date);
              return (
                <WeekDayCell
                  key={date}
                  daySlots={daySlots}
                  showShipmentInfo={showShipmentInfo}
                  onSlotClick={onSlotClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekDayCell({
  daySlots,
  showShipmentInfo,
  onSlotClick,
}: {
  daySlots: Map<number, DockPlannerSlot> | undefined;
  showShipmentInfo: boolean;
  onSlotClick: (s: DockPlannerSlot) => void;
}) {
  if (!daySlots || daySlots.size === 0) {
    return <div className="dock-planner__week-day-cell dock-planner__week-day-cell--empty">—</div>;
  }

  const occupied = Array.from(daySlots.values()).filter((s) => s.appointment).length;
  const blocked = Array.from(daySlots.values()).filter((s) => s.slot_status === "BLOCKED").length;
  const total = daySlots.size;
  const available = total - occupied - blocked;

  // Show mini hour bars
  return (
    <div className="dock-planner__week-day-cell">
      <div className="dock-planner__week-mini-bars">
        {Array.from(daySlots.entries())
          .sort(([a], [b]) => a - b)
          .map(([hour, slot]) => (
            <div
              key={hour}
              className={`dock-planner__mini-bar ${getSlotClass(slot)}`}
              title={`${formatHour(hour)}: ${getSlotTooltip(slot, showShipmentInfo)}`}
              onClick={() => onSlotClick(slot)}
            />
          ))}
      </div>
      <div className="dock-planner__week-day-stats">
        <span className="dock-planner__stat-occupied">{occupied}</span>/
        <span className="dock-planner__stat-available">{available}</span>/
        <span className="dock-planner__stat-blocked">{blocked}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month View — Calendar grid with per-day summaries
// ---------------------------------------------------------------------------

function MonthView({
  dates, viewDatesRaw, summary, onDayClick,
}: {
  docks: DockPlannerDock[];
  slotGrid: Map<string, Map<string, Map<number, DockPlannerSlot>>>;
  dates: string[];
  viewDatesRaw: Date[];
  summary: DockPlannerData["summary"];
  onDayClick: (date: string) => void;
}) {
  // Pad to start on Monday
  const firstDay = viewDatesRaw[0].getDay();
  const paddingBefore = (firstDay === 0 ? 6 : firstDay - 1);

  return (
    <div className="dock-planner__month-grid">
      {/* Weekday headers */}
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className="dock-planner__month-weekday">{d}</div>
      ))}
      {/* Padding */}
      {Array.from({ length: paddingBefore }).map((_, i) => (
        <div key={`pad-${i}`} className="dock-planner__month-cell dock-planner__month-cell--empty" />
      ))}
      {/* Days */}
      {viewDatesRaw.map((d, i) => {
        const dateStr = dates[i];
        const s = summary[dateStr];
        const pct = s && s.total_slots > 0 ? Math.round((s.occupied / s.total_slots) * 100) : 0;
        const isToday = toDateStr(new Date()) === dateStr;

        return (
          <div
            key={dateStr}
            className={`dock-planner__month-cell ${isToday ? "dock-planner__month-cell--today" : ""}`}
            onClick={() => onDayClick(dateStr)}
          >
            <span className="dock-planner__month-day-num">{formatDayNum(d)}</span>
            {s && (
              <div className="dock-planner__month-stats">
                <div className="dock-planner__month-bar">
                  <div className="dock-planner__month-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="dock-planner__month-pct">{pct}%</span>
                <span className="dock-planner__month-detail">{s.occupied}/{s.total_slots}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot Cell (Day View)
// ---------------------------------------------------------------------------

function SlotCell({
  slot, showShipmentInfo, onClick,
}: {
  slot: DockPlannerSlot | undefined;
  showShipmentInfo: boolean;
  onClick: () => void;
}) {
  if (!slot) {
    return <div className="dock-planner__slot-cell dock-planner__slot-cell--no-slot" />;
  }

  const cls = getSlotClass(slot);
  const appt = slot.appointment;

  return (
    <div className={`dock-planner__slot-cell ${cls}`} onClick={onClick} title={getSlotTooltip(slot, showShipmentInfo)}>
      {appt && showShipmentInfo && appt.shipment && (
        <div className="dock-planner__slot-info">
          <span className="dock-planner__slot-customer">{truncate(appt.shipment.customer_name, 8)}</span>
          <span className={`dock-planner__slot-priority dock-planner__slot-priority--${appt.shipment.priority_code.toLowerCase()}`}>
            {appt.shipment.priority_code === "CRITICAL" ? "!" : appt.shipment.priority_code === "HIGH" ? "▲" : ""}
          </span>
        </div>
      )}
      {slot.slot_status === "BLOCKED" && <span className="dock-planner__slot-icon">🚫</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot Detail Popup
// ---------------------------------------------------------------------------

function SlotDetailPopup({
  slot, docks, onClose,
}: {
  slot: DockPlannerSlot;
  docks: DockPlannerDock[];
  onClose: () => void;
}) {
  const dock = docks.find((d) => d.dock_id === slot.dock_id);
  const appt = slot.appointment;
  const shipment = appt?.shipment;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Slot Details</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <dl className="detail__dl">
            <dt>Dock</dt><dd>{dock?.dock_code || slot.dock_id} ({dock?.dock_type})</dd>
            <dt>Time</dt><dd>{formatSlotTime(slot.slot_start_ts)} — {formatSlotTime(slot.slot_end_ts)}</dd>
            <dt>Status</dt>
            <dd>
              <span className={`badge badge--${slot.appointment ? "occupied" : slot.slot_status.toLowerCase()}`}>
                {slot.appointment ? "OCCUPIED" : slot.slot_status}
              </span>
            </dd>
            {dock && (
              <>
                <dt>Max Weight</dt><dd>{dock.max_vehicle_weight_kg.toLocaleString()} kg</dd>
                <dt>Refrigerated</dt><dd>{dock.supports_refrigerated ? "Yes" : "No"}</dd>
              </>
            )}
          </dl>

          {appt && (
            <>
              <h4 style={{ marginTop: 12, marginBottom: 6, fontSize: 13, color: "#6b7280" }}>APPOINTMENT</h4>
              <dl className="detail__dl">
                <dt>Appointment ID</dt><dd>{appt.appointment_id}</dd>
                <dt>Status</dt><dd><span className="badge badge--status">{appt.appointment_status}</span></dd>
                <dt>Booking Source</dt><dd>{appt.booking_source?.replace(/_/g, " ")}</dd>
              </dl>
            </>
          )}

          {shipment && (
            <>
              <h4 style={{ marginTop: 12, marginBottom: 6, fontSize: 13, color: "#6b7280" }}>SHIPMENT</h4>
              <dl className="detail__dl">
                <dt>Shipment ID</dt><dd>{shipment.shipment_id}</dd>
                <dt>Order Ref</dt><dd>{shipment.order_reference}</dd>
                <dt>Customer</dt><dd>{shipment.customer_name}</dd>
                <dt>Product</dt><dd>{shipment.product_category}</dd>
                <dt>Driver</dt><dd>{shipment.drivers?.driver_name || shipment.driver_id}</dd>
                <dt>Phone</dt><dd>{shipment.drivers?.phone || "—"}</dd>
                <dt>Priority</dt>
                <dd>
                  <span className={`badge badge--${shipment.priority_code.toLowerCase()}`}>
                    {shipment.priority_code}
                  </span>
                </dd>
                <dt>Weight</dt><dd>{shipment.load_weight_kg.toLocaleString()} kg</dd>
                <dt>Dock Type</dt><dd>{shipment.required_dock_type}</dd>
                <dt>Latest ETA</dt><dd>{formatSlotTime(shipment.latest_eta_ts)}</dd>
                <dt>Status</dt><dd>{shipment.current_status}</dd>
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getSlotClass(slot: DockPlannerSlot): string {
  if (slot.appointment) return "dock-planner__slot-cell--occupied";
  if (slot.slot_status === "BLOCKED") return "dock-planner__slot-cell--blocked";
  if (slot.slot_status === "CLOSED") return "dock-planner__slot-cell--closed";
  return "dock-planner__slot-cell--available";
}

function getSlotTooltip(slot: DockPlannerSlot, showShipment: boolean): string {
  if (slot.slot_status === "BLOCKED") return "Blocked";
  if (slot.slot_status === "CLOSED") return "Closed";
  if (!slot.appointment) return "Available";
  const s = slot.appointment.shipment;
  if (!s || !showShipment) return "Occupied";
  return `${s.customer_name} | ${s.product_category} | ${s.priority_code} | ${s.drivers?.driver_name || ""}`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function formatSlotTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch {
    return iso;
  }
}
