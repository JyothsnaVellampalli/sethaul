import { useState, useEffect } from "react";
import { fetchShipmentDetail, type ShipmentDetail } from "../services/adminApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return isoStr;
  }
}

function getSourceLabel(sourceType: string): { label: string; icon: string } {
  switch (sourceType) {
    case "ORIGINAL_PLAN":
      return { label: "Original Plan", icon: "📋" };
    case "DRIVER_DECLARED":
      return { label: "Driver Update", icon: "🚛" };
    case "OPERATIONS_OVERRIDE":
      return { label: "Operations Team", icon: "👤" };
    case "SYSTEM_CALCULATED":
      return { label: "System Auto", icon: "🤖" };
    default:
      return { label: sourceType, icon: "ℹ️" };
  }
}

function getDelayReasonLabel(code: string | null): string {
  if (!code) return "";
  const map: Record<string, string> = {
    TRAFFIC: "Traffic congestion",
    BREAKDOWN: "Vehicle breakdown",
    WEATHER: "Weather conditions",
    LOADING_DELAY: "Loading delay at origin",
    DRIVER_REST: "Driver rest stop",
    ROUTE_CHANGE: "Route change",
    CUSTOMS: "Customs/checkpoint delay",
    EARLY_DEPARTURE: "Early departure",
    UNKNOWN: "Unknown reason",
  };
  return map[code] || code.replace(/_/g, " ").toLowerCase();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  shipmentId: string;
  onClose: () => void;
}

export default function ShipmentDetailPopup({ shipmentId, onClose }: Props) {
  const [data, setData] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchShipmentDetail(shipmentId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [shipmentId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shipment Details</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading && <p className="shipment-popup__loading">Loading shipment details...</p>}
          {error && <p className="admin__error">{error}</p>}
          {!loading && !error && data && <ShipmentContent data={data} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Sections
// ---------------------------------------------------------------------------

function ShipmentContent({ data }: { data: ShipmentDetail }) {
  const { shipment, driver, vehicle, facility, carrier, current_appointments, eta_history, exceptions } = data;

  return (
    <div className="shipment-popup">
      {/* Header strip */}
      <div className="shipment-popup__id-strip">
        <span className="shipment-popup__id">{shipment.shipment_id}</span>
        <span className={`badge badge--${shipment.current_status.toLowerCase()}`}>{shipment.current_status}</span>
        <span className={`badge badge--${shipment.priority_code.toLowerCase()}`}>{shipment.priority_code}</span>
      </div>

      {/* Grid sections */}
      <div className="shipment-popup__grid">
        {/* Origin & Destination */}
        <section className="shipment-popup__section">
          <h4 className="shipment-popup__section-title">Route Information</h4>
          <dl className="shipment-popup__dl">
            <dt>Origin</dt>
            <dd>{shipment.origin_name}, {shipment.origin_city}</dd>
            <dt>Destination</dt>
            <dd>{facility ? `${facility.facility_name}, ${facility.city}` : shipment.destination_facility_id}</dd>
            <dt>Planned Departure</dt>
            <dd>{formatDateTime(shipment.planned_departure_ts)}</dd>
            <dt>Actual Departure</dt>
            <dd>{formatDateTime(shipment.actual_departure_ts)}</dd>
          </dl>
        </section>

        {/* Product & Load */}
        <section className="shipment-popup__section">
          <h4 className="shipment-popup__section-title">Product & Load</h4>
          <dl className="shipment-popup__dl">
            <dt>Customer</dt>
            <dd>{shipment.customer_name}</dd>
            <dt>Product Category</dt>
            <dd>{shipment.product_category}</dd>
            <dt>Weight</dt>
            <dd>{shipment.load_weight_kg.toLocaleString()} kg</dd>
            <dt>Pallets</dt>
            <dd>{shipment.pallet_count ?? "—"}</dd>
            <dt>Dock Type Required</dt>
            <dd>{shipment.required_dock_type}</dd>
            <dt>Temp Control</dt>
            <dd>{shipment.temperature_control_required ? "Yes" : "No"}</dd>
            <dt>Expected Unload</dt>
            <dd>{shipment.expected_unload_min} min</dd>
          </dl>
        </section>

        {/* Driver & Vehicle */}
        <section className="shipment-popup__section">
          <h4 className="shipment-popup__section-title">Driver & Vehicle</h4>
          <dl className="shipment-popup__dl">
            <dt>Driver</dt>
            <dd>{driver ? `${driver.driver_name}` : "—"}</dd>
            <dt>Driver Phone</dt>
            <dd>{driver ? <a href={`tel:${driver.phone}`}>{driver.phone}</a> : "—"}</dd>
            <dt>Vehicle</dt>
            <dd>{vehicle ? `${vehicle.registration_number} (${vehicle.vehicle_type_code})` : "—"}</dd>
            <dt>Carrier</dt>
            <dd>{carrier ? carrier.carrier_name : "—"}</dd>
          </dl>
        </section>

        {/* Appointment Slot */}
        <section className="shipment-popup__section">
          <h4 className="shipment-popup__section-title">Appointment Slot</h4>
          {current_appointments.length === 0 ? (
            <p className="shipment-popup__empty">No active appointment</p>
          ) : (
            current_appointments.map((appt) => (
              <dl className="shipment-popup__dl" key={appt.appointment_id}>
                <dt>Slot Time</dt>
                <dd>
                  {appt.appointment_slots
                    ? `${formatDateTime(appt.appointment_slots.slot_start_ts)} — ${formatDateTime(appt.appointment_slots.slot_end_ts)}`
                    : "—"}
                </dd>
                <dt>Dock</dt>
                <dd>
                  {appt.appointment_slots?.docks
                    ? `${appt.appointment_slots.docks.dock_code} (${appt.appointment_slots.docks.dock_type})`
                    : "—"}
                </dd>
                <dt>Status</dt>
                <dd><span className="badge badge--status">{appt.appointment_status}</span></dd>
                <dt>Booked Via</dt>
                <dd>{appt.booking_source?.replace(/_/g, " ") || "—"}</dd>
                <dt>Confirmed At</dt>
                <dd>{formatDateTime(appt.confirmed_at)}</dd>
              </dl>
            ))
          )}
        </section>
      </div>

      {/* ETA & Timing */}
      <section className="shipment-popup__section shipment-popup__section--full">
        <h4 className="shipment-popup__section-title">ETA Timeline</h4>
        <div className="shipment-popup__eta-summary">
          <span><strong>Original ETA:</strong> {formatDateTime(shipment.original_eta_ts)}</span>
          <span><strong>Latest ETA:</strong> {formatDateTime(shipment.latest_eta_ts)}</span>
          {shipment.original_eta_ts !== shipment.latest_eta_ts && (
            <span className="shipment-popup__eta-delta">
              (ETA has been updated)
            </span>
          )}
        </div>

        {eta_history.length > 0 ? (
          <div className="shipment-popup__eta-history">
            <table className="shipment-popup__eta-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Updated By</th>
                  <th>New ETA</th>
                  <th>Reason</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {eta_history.map((eta) => {
                  const source = getSourceLabel(eta.source_type);
                  return (
                    <tr key={eta.eta_update_id}>
                      <td>{formatDateTime(eta.created_at)}</td>
                      <td>
                        <span className="shipment-popup__source-badge">
                          <span>{source.icon}</span>
                          <span>{source.label}</span>
                          {eta.reported_by_driver_name && (
                            <span className="shipment-popup__source-detail">
                              ({eta.reported_by_driver_name})
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{formatDateTime(eta.declared_eta_ts)}</td>
                      <td>{getDelayReasonLabel(eta.delay_reason_code)}</td>
                      <td>{eta.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="shipment-popup__empty">No ETA updates recorded</p>
        )}
      </section>

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <section className="shipment-popup__section shipment-popup__section--full">
          <h4 className="shipment-popup__section-title">Exceptions</h4>
          <div className="shipment-popup__exceptions">
            {exceptions.map((exc) => (
              <div key={exc.exception_id} className="shipment-popup__exception-card">
                <div className="shipment-popup__exception-header">
                  <span className={`badge badge--${exc.severity_code.toLowerCase()}`}>{exc.severity_code}</span>
                  <span className="badge badge--status">{exc.exception_status}</span>
                  <span>{exc.exception_type}</span>
                  <span className="shipment-popup__exception-time">{formatDate(exc.reported_at)}</span>
                </div>
                <p className="shipment-popup__exception-desc">{exc.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Metadata footer */}
      <div className="shipment-popup__footer">
        <span>Order Ref: {shipment.order_reference}</span>
        <span>Created: {formatDate(shipment.created_at)}</span>
      </div>
    </div>
  );
}
