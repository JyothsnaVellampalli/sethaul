import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import SlotCalendarPicker from "../components/SlotCalendarPicker";
import ShipmentDetailPopup from "../components/ShipmentDetailPopup";
import {
  fetchDashboard,
  fetchFilters,
  fetchAvailableSlots,
  type DashboardData,
  type FilterOptions,
  type ExceptionRow,
  type ShipmentRow,
  type AvailableSlot,
} from "../services/adminApi";

// Lazy load DockPlannerTab — only fetched when tab is active
const DockPlannerTab = lazy(() => import("../components/DockPlannerTab"));

type TabKey = "planner" | "exceptions" | "shipments";

function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [facilityFilter, setFacilityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [exceptionTypeFilter, setExceptionTypeFilter] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("planner");

  // Track if data tabs have been loaded at least once (lazy load)
  const [dataTabLoaded, setDataTabLoaded] = useState(false);

  // Modal state
  const [etaOverride, setEtaOverride] = useState<{
    shipmentId: string;
    facilityId: string;
    dockType: string;
    currentEta: string;
    customerName: string;
    productCategory: string;
  } | null>(null);
  const [driverPopup, setDriverPopup] = useState<string | null>(null);
  const [shipmentPopup, setShipmentPopup] = useState<string | null>(null);

  // Load filters eagerly (small payload, needed by planner tab too)
  useEffect(() => {
    fetchFilters()
      .then(setFilters)
      .catch(() => {});
  }, []);

  // Load dashboard data only when exceptions/shipments tab is active (lazy)
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashData = await fetchDashboard({
        facility_id: facilityFilter || undefined,
        status: statusFilter || undefined,
        driver_id: driverFilter || undefined,
        exception_type: exceptionTypeFilter || undefined,
      });
      setData(dashData);
      setDataTabLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [facilityFilter, statusFilter, driverFilter, exceptionTypeFilter]);

  // Trigger data load when switching to exceptions/shipments tab
  useEffect(() => {
    if (activeTab === "exceptions" || activeTab === "shipments") {
      if (!dataTabLoaded) {
        loadData();
      }
    }
  }, [activeTab, dataTabLoaded, loadData]);

  // Reload when filters change (only if data tab has been loaded)
  useEffect(() => {
    if (dataTabLoaded && (activeTab === "exceptions" || activeTab === "shipments")) {
      loadData();
    }
  }, [facilityFilter, statusFilter, driverFilter, exceptionTypeFilter]);

  const handleExceptionClick = (exceptionId: string) => {
    navigate(`/admin/exceptions/${exceptionId}`);
  };

  const handleRefresh = () => {
    if (activeTab === "planner") {
      // Planner handles its own refresh internally
      return;
    }
    loadData();
  };

  return (
    <div className="admin">
      <header className="admin__header">
        <h1>SetuHaul Operations Dashboard</h1>
        <div className="admin__header-actions">
          <button className="admin__action-btn" onClick={() => navigate("/admin/slots")}>
            Manage Slots
          </button>
          <button className="admin__action-btn" onClick={() => navigate("/admin/shipments/new")}>
            + New Shipment
          </button>
          {activeTab !== "planner" && (
            <button className="admin__refresh" onClick={handleRefresh} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="admin__error">{error}</div>}

      {/* Summary Cards — show when data is available */}
      {data && (activeTab === "exceptions" || activeTab === "shipments") && (
        <div className="admin__summary">
          <div className="summary-card">
            <span className="summary-card__value">{data.summary.total_shipments}</span>
            <span className="summary-card__label">Total Shipments</span>
          </div>
          <div className="summary-card summary-card--alert">
            <span className="summary-card__value">{data.summary.active_exceptions}</span>
            <span className="summary-card__label">Active Exceptions</span>
          </div>
          {Object.entries(data.summary.severity_breakdown).map(([sev, count]) => (
            <div key={sev} className={`summary-card summary-card--${sev.toLowerCase()}`}>
              <span className="summary-card__value">{count}</span>
              <span className="summary-card__label">{sev}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters — show only for exceptions/shipments tabs */}
      {filters && (activeTab === "exceptions" || activeTab === "shipments") && (
        <div className="admin__filters">
          <select value={facilityFilter} onChange={(e) => setFacilityFilter(e.target.value)}>
            <option value="">All Facilities</option>
            {filters.facilities.map((f) => (
              <option key={f.facility_id} value={f.facility_id}>
                {f.facility_name} ({f.city})
              </option>
            ))}
          </select>

          <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
            <option value="">All Drivers</option>
            {filters.drivers.map((d) => (
              <option key={d.driver_id} value={d.driver_id}>
                {d.driver_name} ({d.driver_id})
              </option>
            ))}
          </select>

          <select value={exceptionTypeFilter} onChange={(e) => setExceptionTypeFilter(e.target.value)}>
            <option value="">All Issue Types</option>
            {filters.exception_types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {filters.statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab Selector */}
      <div className="admin__tabs">
        <button
          className={`admin__tab ${activeTab === "planner" ? "admin__tab--active" : ""}`}
          onClick={() => setActiveTab("planner")}
        >
          Dock Planner
        </button>
        <button
          className={`admin__tab ${activeTab === "exceptions" ? "admin__tab--active" : ""}`}
          onClick={() => setActiveTab("exceptions")}
        >
          Exceptions {data ? `(${data.exceptions.length})` : ""}
        </button>
        <button
          className={`admin__tab ${activeTab === "shipments" ? "admin__tab--active" : ""}`}
          onClick={() => setActiveTab("shipments")}
        >
          Shipments {data ? `(${data.shipments.length})` : ""}
        </button>
      </div>

      {/* Dock Planner Tab */}
      {activeTab === "planner" && filters && (
        <Suspense fallback={<div className="dock-planner__loading">Loading Dock Planner...</div>}>
          <DockPlannerTab
            facilities={filters.facilities}
            defaultFacilityId={facilityFilter || undefined}
          />
        </Suspense>
      )}

      {/* Exceptions Table */}
      {activeTab === "exceptions" && (
        <>
          {loading && <div className="dock-planner__loading">Loading exceptions...</div>}
          {!loading && data && (
            <div className="admin__table-wrapper">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Driver</th>
                    <th>Shipment</th>
                    <th>Type</th>
                    <th>Declared ETA</th>
                    <th>Delay (min)</th>
                    <th>Status</th>
                    <th>Reported</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exceptions.length === 0 && (
                    <tr><td colSpan={9} className="admin__empty">No active exceptions</td></tr>
                  )}
                  {data.exceptions.map((exc: ExceptionRow) => (
                    <tr key={exc.exception_id} className={`admin__row admin__row--${exc.severity_code.toLowerCase()}`}>
                      <td>
                        <span className={`badge badge--${exc.severity_code.toLowerCase()}`}>
                          {exc.severity_code}
                        </span>
                      </td>
                      <td>{exc.drivers?.driver_name || exc.driver_id}</td>
                      <td>
                        {exc.shipment_id ? (
                          <button className="admin__link-btn" onClick={() => setShipmentPopup(exc.shipment_id!)}>
                            {exc.shipment_id}
                          </button>
                        ) : "—"}
                      </td>
                      <td>{exc.exception_type}</td>
                      <td>{exc.declared_eta_ts ? formatTime(exc.declared_eta_ts) : "—"}</td>
                      <td>{exc.reported_delay_min ?? "—"}</td>
                      <td>
                        <span className="badge badge--status">{exc.exception_status}</span>
                      </td>
                      <td>{formatTime(exc.reported_at)}</td>
                      <td>
                        <button
                          className="admin__action-btn"
                          onClick={() => handleExceptionClick(exc.exception_id)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Shipments Table */}
      {activeTab === "shipments" && (
        <>
          {loading && <div className="dock-planner__loading">Loading shipments...</div>}
          {!loading && data && (
            <div className="admin__table-wrapper">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Driver</th>
                    <th>Facility</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Dock Type</th>
                    <th>Original ETA</th>
                    <th>Latest ETA</th>
                    <th>Weight (kg)</th>
                    <th>Product</th>
                  </tr>
                </thead>
                <tbody>
                  {data.shipments.length === 0 && (
                    <tr><td colSpan={10} className="admin__empty">No shipments found</td></tr>
                  )}
                  {data.shipments.map((s: ShipmentRow) => (
                    <tr key={s.shipment_id} className={`admin__row admin__row--status-${s.current_status.toLowerCase()}`}>
                      <td className="admin__mono">
                        <button className="admin__link-btn" onClick={() => setShipmentPopup(s.shipment_id)}>
                          {s.shipment_id}
                        </button>
                      </td>
                      <td>
                        <button className="admin__link-btn" onClick={() => setDriverPopup(s.driver_id)}>
                          {s.drivers?.driver_name || s.driver_id}
                        </button>
                      </td>
                      <td>{s.facilities?.facility_name || s.destination_facility_id}</td>
                      <td>
                        <StatusDropdown
                          shipmentId={s.shipment_id}
                          currentStatus={s.current_status}
                          onStatusChange={loadData}
                        />
                      </td>
                      <td>
                        <span className={`badge badge--${s.priority_code.toLowerCase()}`}>
                          {s.priority_code}
                        </span>
                      </td>
                      <td>{s.required_dock_type}</td>
                      <td>{formatTime(s.original_eta_ts)}</td>
                      <td>
                        <span className="eta-cell">
                          {formatTime(s.latest_eta_ts)}
                          <button
                            className="eta-edit-btn"
                            title="Override ETA"
                            onClick={() => setEtaOverride({ shipmentId: s.shipment_id, facilityId: s.destination_facility_id, dockType: s.required_dock_type, currentEta: s.latest_eta_ts, customerName: s.customer_name, productCategory: s.product_category })}
                          >
                            ✎
                          </button>
                        </span>
                      </td>
                      <td>{s.load_weight_kg.toLocaleString()}</td>
                      <td>{s.product_category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ETA Override Modal */}
      {etaOverride && (
        <EtaOverrideModal
          shipmentId={etaOverride.shipmentId}
          facilityId={etaOverride.facilityId}
          dockType={etaOverride.dockType}
          currentEta={etaOverride.currentEta}
          customerName={etaOverride.customerName}
          productCategory={etaOverride.productCategory}
          onClose={() => setEtaOverride(null)}
          onSuccess={() => { setEtaOverride(null); loadData(); }}
        />
      )}

      {/* Driver Info Popup */}
      {driverPopup && (
        <DriverInfoPopup
          driverId={driverPopup}
          onClose={() => setDriverPopup(null)}
        />
      )}

      {/* Shipment Detail Popup */}
      {shipmentPopup && (
        <ShipmentDetailPopup
          shipmentId={shipmentPopup}
          onClose={() => setShipmentPopup(null)}
        />
      )}
    </div>
  );
}

function formatTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-IN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: true });
  } catch {
    return isoStr;
  }
}

const ALL_STATUSES = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "AT_GATE", "WAITING", "IN_DOCK", "COMPLETED", "CANCELLED"];
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

function StatusDropdown({
  shipmentId,
  currentStatus,
  onStatusChange,
}: {
  shipmentId: string;
  currentStatus: string;
  onStatusChange: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    if (newStatus === currentStatus) return;

    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/shipments/${shipmentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Update failed" }));
        alert(err.detail || "Failed to update status");
        return;
      }
      onStatusChange();
    } catch {
      alert("Network error updating status");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <select
      className={`status-select status-select--${currentStatus.toLowerCase()}`}
      value={currentStatus}
      onChange={handleChange}
      disabled={updating}
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

export default AdminDashboard;

// ===========================================================================
// ETA Override Modal
// ===========================================================================

const MODAL_API = import.meta.env.VITE_API_URL || "/api";

function EtaOverrideModal({
  shipmentId, facilityId, dockType, currentEta, customerName, productCategory, onClose, onSuccess,
}: {
  shipmentId: string;
  facilityId: string;
  dockType: string;
  currentEta: string;
  customerName: string;
  productCategory: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableSlots(facilityId, dockType !== "ANY" ? dockType : undefined, currentEta, true)
      .then((res) => setSlots(res.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoading(false));
  }, [facilityId, dockType, currentEta]);

  async function handleSubmit() {
    if (selectedSlots.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${MODAL_API}/admin/shipments/${shipmentId}/eta-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_id: selectedSlots[0], slot_ids: selectedSlots, notes: notes || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Override failed" }));
        throw new Error(err.detail);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Override ETA — {shipmentId}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="modal-info-strip">
            <span><strong>Customer:</strong> {customerName}</span>
            <span><strong>Product:</strong> {productCategory}</span>
            <span><strong>Current ETA:</strong> {formatTime(currentEta)}</span>
            <span><strong>Dock:</strong> {dockType}</span>
          </div>
          {error && <div className="admin__error">{error}</div>}
          <SlotCalendarPicker
            slots={slots}
            selectedSlots={selectedSlots}
            onSelectSlots={setSelectedSlots}
            declaredEta={currentEta}
            loading={loading}
            maxSlots={3}
          />
          <div className="modal-actions">
            <textarea
              className="detail__textarea"
              placeholder="Override reason (optional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
            <div className="modal-btns">
              <button className="admin__back-btn" onClick={onClose}>Cancel</button>
              <button className="detail__approve-btn" onClick={handleSubmit} disabled={selectedSlots.length === 0 || submitting}>
                {submitting ? "Saving..." : `Confirm Override (${selectedSlots.length} slot${selectedSlots.length > 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Driver Info Popup
// ===========================================================================

interface DriverDetail {
  driver_id: string;
  driver_name: string;
  phone: string;
  licence_number: string;
  home_base_city: string | null;
  driver_status: string;
  carrier_id: string;
  carrier_name: string;
  carrier_phone: string;
}

function DriverInfoPopup({ driverId, onClose }: { driverId: string; onClose: () => void }) {
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${MODAL_API}/admin/drivers/${driverId}`)
      .then((r) => r.json())
      .then(setDriver)
      .catch(() => setDriver(null))
      .finally(() => setLoading(false));
  }, [driverId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Driver Info</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading && <p>Loading...</p>}
          {!loading && !driver && <p>Driver not found.</p>}
          {driver && (
            <dl className="detail__dl">
              <dt>Name</dt><dd>{driver.driver_name}</dd>
              <dt>ID</dt><dd>{driver.driver_id}</dd>
              <dt>Phone</dt><dd><a href={`tel:${driver.phone}`}>{driver.phone}</a></dd>
              <dt>Licence</dt><dd>{driver.licence_number}</dd>
              <dt>Home City</dt><dd>{driver.home_base_city || "—"}</dd>
              <dt>Status</dt><dd><span className={`badge badge--${driver.driver_status.toLowerCase()}`}>{driver.driver_status}</span></dd>
              <dt>Carrier</dt><dd>{driver.carrier_name} ({driver.carrier_id})</dd>
              <dt>Carrier Phone</dt><dd><a href={`tel:${driver.carrier_phone}`}>{driver.carrier_phone}</a></dd>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
