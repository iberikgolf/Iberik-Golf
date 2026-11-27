import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw, Search, Wrench, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  FleetOverviewResponse,
  FleetVehicleItem,
  UserProfile,
  VehicleReservationItem,
  VehicleReservationRow,
} from '../types/golf';
import { TEE_TIME_SLOTS, formatEuropeanDate, getTodayIsoDate } from '../lib/golf-schedule';
import { AdminPlayerSelector } from './AdminPlayerSelector';
import { EuropeanDateInput } from './EuropeanDateInput';

interface FleetViewProps {
  initialTargetUserId?: string;
}

export const FleetView: React.FC<FleetViewProps> = ({ initialTargetUserId = '' }) => {
  const {
    firebaseUser,
    profile,
    isStaff,
    isSuperuser,
    managedCourseSlugs,
    canManageCourse,
    signInWithGoogle,
    authFetch,
  } = useAuth();
  const [date, setDate] = useState<string>(getTodayIsoDate());
  const [checkStartTime, setCheckStartTime] = useState<string>('10:00');
  const [courseFilter, setCourseFilter] = useState<'all' | 'guitiriz' | 'aguas-santas'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'buggy' | 'electric_trolley'>('all');
  const [brandFilter, setBrandFilter] = useState<'all' | 'YAMAHA' | 'DEHOU'>('all');

  const [overview, setOverview] = useState<FleetOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Searchable Vehicle Reservations Ledger
  const [reservationsList, setReservationsList] = useState<VehicleReservationRow[]>([]);
  const [resLoading, setResLoading] = useState(false);
  const [resSearch, setResSearch] = useState('');
  const [resDateScope, setResDateScope] = useState<'selected' | 'all'>('selected');
  const [resCourseFilter, setResCourseFilter] = useState<'all' | 'guitiriz' | 'aguas-santas'>('all');
  const [confirmDeleteResId, setConfirmDeleteResId] = useState<number | null>(null);

  // Direct standalone reservation form
  const [reserveCourse, setReserveCourse] = useState<'guitiriz' | 'aguas-santas'>('guitiriz');
  const [reserveType, setReserveType] = useState<'buggy' | 'electric_trolley'>('buggy');
  const [reserveTime, setReserveTime] = useState<string>('10:00');
  const [reserveVehicleId, setReserveVehicleId] = useState<string>('');
  const [reserveNotes, setReserveNotes] = useState('');
  const [staffTargetUserId, setStaffTargetUserId] = useState(initialTargetUserId);
  const [playersDirectory, setPlayersDirectory] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (
      isStaff &&
      managedCourseSlugs.length > 0 &&
      !managedCourseSlugs.includes(reserveCourse)
    ) {
      setReserveCourse(managedCourseSlugs[0] as 'guitiriz' | 'aguas-santas');
      setReserveVehicleId('');
    }
  }, [isStaff, managedCourseSlugs, reserveCourse]);

  useEffect(() => {
    if (initialTargetUserId !== undefined) {
      setStaffTargetUserId(initialTargetUserId);
    }
  }, [initialTargetUserId]);

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmedMsg, setConfirmedMsg] = useState<string | null>(null);

  // Edit Vehicle Reservation Modal (Staff/Superuser)
  const [editingRes, setEditingRes] = useState<VehicleReservationItem | null>(null);
  const [editUserId, setEditUserId] = useState('');
  const [editVehicleId, setEditVehicleId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('10:00');
  const [editStatus, setEditStatus] = useState('reserved');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = firebaseUser
        ? `/api/fleet?date=${encodeURIComponent(date)}&startTime=${encodeURIComponent(checkStartTime)}`
        : `/api/fleet/public-summary?date=${encodeURIComponent(date)}&startTime=${encodeURIComponent(
            checkStartTime
          )}`;
      const res = firebaseUser ? await authFetch(url) : await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo cargar el estado de los vehículos.');
      }
      const payload: FleetOverviewResponse = await res.json();
      setOverview(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, authFetch, date, checkStartTime]);

  const fetchReservationsList = useCallback(async () => {
    if (!firebaseUser) {
      setReservationsList([]);
      setResLoading(false);
      return;
    }
    setResLoading(true);
    try {
      const res = await authFetch('/api/fleet/reservations');
      if (res.ok) {
        setReservationsList(await res.json());
      }
    } catch {
      // ignore transient background error
    } finally {
      setResLoading(false);
    }
  }, [firebaseUser, authFetch]);

  const refreshAllFleet = useCallback(async () => {
    await Promise.all([fetchFleet(), fetchReservationsList()]);
  }, [fetchFleet, fetchReservationsList]);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  useEffect(() => {
    fetchReservationsList();
  }, [fetchReservationsList]);

  useEffect(() => {
    if (!isStaff || !firebaseUser) return;
    let cancelled = false;
    authFetch('/api/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: UserProfile[]) => {
        if (!cancelled) setPlayersDirectory(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isStaff, firebaseUser, authFetch]);

  const filteredVehicles = useMemo(() => {
    if (!overview) return [];
    return overview.vehicles.filter((v) => {
      if (courseFilter !== 'all' && v.courseSlug !== courseFilter) return false;
      if (typeFilter !== 'all' && v.type !== typeFilter) return false;
      if (brandFilter !== 'all' && (v.brand || '').toUpperCase() !== brandFilter) return false;
      return true;
    });
  }, [overview, courseFilter, typeFilter, brandFilter]);

  const filteredVehicleReservations = useMemo(() => {
    const q = resSearch.trim().toLowerCase();
    return reservationsList.filter((r) => {
      if (resDateScope === 'selected' && r.date !== date) return false;
      if (resCourseFilter !== 'all' && r.courseSlug !== resCourseFilter) return false;
      if (!q) return true;
      return [
        r.vehicleCode,
        r.vehicleBrand,
        r.vehicleLabel,
        r.courseName,
        r.userNombre,
        r.userApellidos,
        r.userEmail,
        r.userLicencia,
        r.userTelefono,
        r.date,
        formatEuropeanDate(r.date),
        r.startTime,
        r.endTime,
        r.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [reservationsList, resDateScope, date, resCourseFilter, resSearch]);

  const summaryStats = useMemo(() => {
    const vehicles = overview?.vehicles || [];
    const byCourse = (slug: string, type: string) => {
      const subset = vehicles.filter((v) => v.courseSlug === slug && v.type === type);
      const freeNow = subset.filter(
        (v) => v.status === 'operational' && !v.busyAtSelectedTime
      ).length;
      return { total: subset.length, freeNow };
    };
    const aguasBuggiesList = vehicles.filter(
      (v) => v.courseSlug === 'aguas-santas' && v.type === 'buggy'
    );
    const aguasYamaha = aguasBuggiesList.filter(
      (v) => (v.brand || '').toUpperCase() === 'YAMAHA'
    );
    const aguasDehou = aguasBuggiesList.filter(
      (v) => (v.brand || '').toUpperCase() === 'DEHOU'
    );
    return {
      totalCount: vehicles.length,
      guitirizCount: vehicles.filter((v) => v.courseSlug === 'guitiriz').length,
      aguasCount: vehicles.filter((v) => v.courseSlug === 'aguas-santas').length,
      guitirizBuggies: byCourse('guitiriz', 'buggy'),
      guitirizTrolleys: byCourse('guitiriz', 'electric_trolley'),
      aguasBuggies: {
        ...byCourse('aguas-santas', 'buggy'),
        yamahaTotal: aguasYamaha.length,
        yamahaFree: aguasYamaha.filter((v) => v.status === 'operational' && !v.busyAtSelectedTime)
          .length,
        dehouTotal: aguasDehou.length,
        dehouFree: aguasDehou.filter((v) => v.status === 'operational' && !v.busyAtSelectedTime)
          .length,
      },
      aguasTrolleys: byCourse('aguas-santas', 'electric_trolley'),
    };
  }, [overview]);

  const availableUnitsForForm = useMemo(() => {
    if (!overview) return [];
    return overview.vehicles.filter(
      (v) =>
        v.courseSlug === reserveCourse &&
        v.type === reserveType &&
        v.status === 'operational' &&
        !v.busyAtSelectedTime
    );
  }, [overview, reserveCourse, reserveType]);

  const handleReserveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStaff || !canManageCourse(reserveCourse)) return;
    setActionError(null);
    setConfirmedMsg(null);

    if (!firebaseUser) {
      await signInWithGoogle();
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/fleet/reservations', {
        method: 'POST',
        body: JSON.stringify({
          courseSlug: reserveCourse,
          vehicleType: reserveType,
          vehicleId: reserveVehicleId ? Number(reserveVehicleId) : undefined,
          date,
          startTime: reserveTime,
          notes: reserveNotes,
          ...(isStaff && staffTargetUserId ? { targetUserId: Number(staffTargetUserId) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo reservar el vehículo.');
      }
      const titularName = body.titular
        ? `${body.titular.nombre || ''} ${body.titular.apellidos || ''}`.trim() || body.titular.email
        : '';
      setConfirmedMsg(
        `Unidad ${body.vehicle?.code || ''} reservada el ${formatEuropeanDate(date)} desde las ${reserveTime}${
          titularName ? ` a nombre de ${titularName}` : ''
        }. Pago en recepción del campo de golf.`
      );
      setReserveVehicleId('');
      setReserveNotes('');
      await refreshAllFleet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al reservar vehículo');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMaintenance = async (v: FleetVehicleItem) => {
    setActionError(null);
    const nextStatus = v.status === 'operational' ? 'maintenance' : 'operational';
    try {
      const res = await authFetch(`/api/fleet/vehicles/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la unidad.');
      }
      await refreshAllFleet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al actualizar estado');
    }
  };

  const handleUpdateVehicleReservation = async (
    resId: number,
    patch: { status?: string; mewsStatus?: string }
  ) => {
    setActionError(null);
    try {
      const res = await authFetch(`/api/fleet/reservations/${resId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la reserva.');
      }
      await refreshAllFleet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al actualizar reserva');
    }
  };

  const handleDeleteCancelledReservation = async (resId: number) => {
    setActionError(null);
    try {
      const res = await authFetch(`/api/fleet/reservations/${resId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo borrar la reserva cancelada.');
      }
      setConfirmDeleteResId(null);
      await refreshAllFleet();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al borrar la reserva cancelada');
    }
  };

  const openEditModal = (resItem: VehicleReservationItem) => {
    setEditingRes(resItem);
    setEditUserId(String(resItem.userId || ''));
    setEditVehicleId(String(resItem.vehicleId));
    setEditDate(resItem.date);
    setEditStartTime(resItem.startTime);
    setEditStatus(resItem.status);
    setEditNotes(resItem.notes || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRes) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await authFetch(`/api/fleet/reservations/${editingRes.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          userId: editUserId ? Number(editUserId) : undefined,
          vehicleId: editVehicleId ? Number(editVehicleId) : undefined,
          date: editDate,
          startTime: editStartTime,
          status: editStatus,
          notes: editNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo guardar la edición.');
      }
      setEditingRes(null);
      await refreshAllFleet();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al editar la reserva');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E2E5EB]">
        <div>
          <p className="text-xs font-medium text-[#555C68]">
            Control unificado de vehículos · Guitiriz (2 buggies YAMAHA + 6 carros) y Aguas Santas
            (2 buggies YAMAHA + 8 buggies DEHOU + 6 carros)
          </p>
          <h1 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
            Gestión Centralizada de Vehículos
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <EuropeanDateInput
            ariaLabel="Fecha de consulta de vehículos"
            value={date}
            onChange={(nextDate) => setDate(nextDate)}
            className="px-3.5 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
          />

          <select
            aria-label="Hora de consulta de disponibilidad"
            value={checkStartTime}
            onChange={(e) => {
              setCheckStartTime(e.target.value);
              setReserveTime(e.target.value);
            }}
            className="px-3.5 py-2 text-xs font-hours font-medium bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
          >
            {TEE_TIME_SLOTS.map((s) => (
              <option key={s} value={s}>
                Franja {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={refreshAllFleet}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#E2E5EB] rounded-lg text-[#111827] hover:bg-[#F4F6F9] whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || resLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Centralized Fleet Availability Strip */}
      <div className="bg-white border border-[#E2E5EB] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E5EB]">
        <div className="p-5">
          <p className="text-xs text-[#555C68]">Guitiriz · Buggies YAMAHA (9 hoyos)</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
            {summaryStats.guitirizBuggies.freeNow} / {summaryStats.guitirizBuggies.total || 2}
          </p>
          <p className="mt-1 text-[11px] text-[#555C68]">
            Disponibles a las <span className="font-hours font-semibold text-[#111827]">{checkStartTime}</span> (uso aprox. 4h)
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#555C68]">Guitiriz · Carros eléctricos</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
            {summaryStats.guitirizTrolleys.freeNow} / {summaryStats.guitirizTrolleys.total || 6}
          </p>
          <p className="mt-1 text-[11px] text-[#555C68]">
            Disponibles a las <span className="font-hours font-semibold text-[#111827]">{checkStartTime}</span> (uso aprox. 4h)
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#555C68]">Aguas Santas · Buggies (YAMAHA y DEHOU)</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
            {summaryStats.aguasBuggies.freeNow} / {summaryStats.aguasBuggies.total || 10}
          </p>
          <p className="mt-1 text-[11px] text-[#555C68]">
            <span className="font-mono font-medium text-[#111827]">
              {summaryStats.aguasBuggies.yamahaFree}/{summaryStats.aguasBuggies.yamahaTotal || 2} YAMAHA
            </span>{' '}
            ·{' '}
            <span className="font-mono font-medium text-[#111827]">
              {summaryStats.aguasBuggies.dehouFree}/{summaryStats.aguasBuggies.dehouTotal || 8} DEHOU
            </span>{' '}
            a las <span className="font-hours font-semibold text-[#111827]">{checkStartTime}</span>
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-[#555C68]">Aguas Santas · Carros eléctricos</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
            {summaryStats.aguasTrolleys.freeNow} / {summaryStats.aguasTrolleys.total || 6}
          </p>
          <p className="mt-1 text-[11px] text-[#555C68]">
            Disponibles a las <span className="font-hours font-semibold text-[#111827]">{checkStartTime}</span> (uso aprox. 4h)
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Split: 24-Unit Inventory Table + Direct Reservation Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
              {[
                { id: 'all', label: `Ambos campos (${summaryStats.totalCount || 24})` },
                { id: 'guitiriz', label: `Guitiriz (${summaryStats.guitirizCount || 8})` },
                { id: 'aguas-santas', label: `Aguas Santas (${summaryStats.aguasCount || 16})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCourseFilter(tab.id as 'all' | 'guitiriz' | 'aguas-santas')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    courseFilter === tab.id
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                {[
                  { id: 'all', label: 'Todos los equipos' },
                  { id: 'buggy', label: 'Buggies' },
                  { id: 'electric_trolley', label: 'Carros eléctricos' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id as 'all' | 'buggy' | 'electric_trolley')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      typeFilter === tab.id
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                {[
                  { id: 'all', label: 'Todas las marcas' },
                  { id: 'YAMAHA', label: 'YAMAHA' },
                  { id: 'DEHOU', label: 'DEHOU' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBrandFilter(tab.id as 'all' | 'YAMAHA' | 'DEHOU')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      brandFilter === tab.id
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4">Campo</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Marca</th>
                    <th className="py-3 px-4">
                      Estado a las <span className="font-hours">{checkStartTime}</span>
                    </th>
                    <th className="py-3 px-4">Reservas del día ({formatEuropeanDate(date)})</th>
                    {isSuperuser && <th className="py-3 px-4 text-right">Mantenimiento</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEEF3] text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={isSuperuser ? 7 : 6} className="py-10 text-center text-[#555C68]">
                        Cargando inventario de vehículos...
                      </td>
                    </tr>
                  ) : filteredVehicles.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperuser ? 7 : 6} className="py-10 text-center text-[#555C68]">
                        No hay unidades para el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredVehicles.map((v) => {
                      const isMaint = v.status === 'maintenance';
                      const stateLabel = isMaint
                        ? 'En mantenimiento'
                        : v.busyAtSelectedTime
                        ? 'Ocupado en franja'
                        : 'Disponible';
                      const stateColor = isMaint
                        ? 'text-[#B91C1C]'
                        : v.busyAtSelectedTime
                        ? 'text-[#B45309]'
                        : 'text-[#15803D]';

                      const windows = v.reservationsToday?.length
                        ? v.reservationsToday
                        : (v.occupiedWindows || []).map((w, i) => ({
                            id: i,
                            vehicleId: v.id,
                            courseId: v.courseId,
                            userId: 0,
                            teeTimeReservationId: null,
                            date,
                            startTime: w.startTime,
                            endTime: w.endTime,
                            status: 'reserved',
                            mewsStatus: 'PENDING_RECEPTION',
                            notes: '',
                            userNombre: '',
                            userApellidos: '',
                            userEmail: '',
                          }));

                      return (
                        <tr key={v.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-[#111827] whitespace-nowrap">
                            {v.code}
                          </td>
                          <td className="py-3 px-4 text-[#404854] whitespace-nowrap">
                            {v.courseName}
                          </td>
                          <td className="py-3 px-4 text-[#404854] whitespace-nowrap">
                            {v.type === 'buggy' ? 'Buggy' : 'Carro eléctrico'}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold whitespace-nowrap">
                            {v.brand ? (
                              <span
                                className={
                                  v.brand === 'YAMAHA' ? 'text-[#003087]' : 'text-[#111827]'
                                }
                              >
                                {v.brand}
                              </span>
                            ) : (
                              <span className="text-[#7A828E] font-normal">—</span>
                            )}
                          </td>
                          <td className={`py-3 px-4 font-medium whitespace-nowrap ${stateColor}`}>
                            {stateLabel}
                          </td>
                          <td className="py-3 px-4 tabular-nums text-[#555C68]">
                            {windows.length === 0 ? (
                              <span>Sin reservas</span>
                            ) : (
                              <div className="space-y-1">
                                {windows.map((w) => {
                                  const holderLabel =
                                    w.userNombre || w.userApellidos
                                      ? `${w.userNombre} ${w.userApellidos}`.trim()
                                      : w.userEmail || '';
                                  return (
                                    <div
                                      key={w.id}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span>
                                        <span className="font-hours font-medium text-[#111827]">
                                          {w.startTime}–{w.endTime}
                                        </span>
                                        {holderLabel ? ` · ${holderLabel}` : ''}
                                      </span>
                                      {isStaff && canManageCourse(v.courseSlug) && w.id > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {w.status === 'reserved' && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateVehicleReservation(w.id, {
                                                  status: 'in_use',
                                                })
                                              }
                                              className="px-2 py-0.5 text-[11px] bg-[#EBEEF3] text-[#111827] rounded hover:bg-[#E2E5EB]"
                                            >
                                              Entregar
                                            </button>
                                          )}
                                          {w.status === 'in_use' && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateVehicleReservation(w.id, {
                                                  status: 'returned',
                                                })
                                              }
                                              className="px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-900 rounded hover:bg-emerald-200"
                                            >
                                              Devuelto
                                            </button>
                                          )}
                                          {w.mewsStatus === 'PENDING_RECEPTION' && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateVehicleReservation(w.id, {
                                                  mewsStatus: 'BILLED_MEWS',
                                                })
                                              }
                                              className="px-2 py-0.5 text-[11px] bg-[#003087] text-white rounded hover:bg-[#002266]"
                                            >
                                              Cobrado
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => openEditModal(w)}
                                            className="px-2 py-0.5 text-[11px] border border-[#E2E5EB] text-[#111827] rounded hover:bg-[#EBEEF3]"
                                          >
                                            Editar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateVehicleReservation(w.id, {
                                                status: 'cancelled',
                                              })
                                            }
                                            className="px-2 py-0.5 text-[11px] text-[#B91C1C] border border-red-200 rounded hover:bg-red-50"
                                          >
                                            Cancelar
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          {isSuperuser && (
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              {canManageCourse(v.courseSlug) ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleMaintenance(v)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-[#E2E5EB] rounded-md hover:bg-[#EBEEF3] text-[#111827]"
                                >
                                  <Wrench className="w-3 h-3" />
                                  <span>{isMaint ? 'Habilitar' : 'Mantenimiento'}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-[#7A828E]">Solo consulta</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Standalone Equipment Booking Form (Staff Only) / Availability Summary (Players) */}
        <aside className="lg:col-span-4 bg-white border border-[#E2E5EB] rounded-xl p-6 space-y-5">
          <div className="pb-4 border-b border-[#EBEEF3]">
            <p className="text-xs text-[#555C68]">
              {isStaff ? 'Reserva directa de equipo' : 'Disponibilidad en tiempo real'}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-[#111827]">
              {isStaff
                ? 'Asignar buggy o carro eléctrico'
                : 'Consulta de vehículos'}
            </h2>
          </div>

          {!isStaff ? (
            <div className="space-y-4">
              <div className="p-4 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#555C68]">Fecha y franja</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {formatEuropeanDate(date)} ·{' '}
                    <span className="font-hours text-[#003087]">{checkStartTime}</span>
                  </span>
                </div>
                <div className="pt-2 border-t border-[#EBEEF3] flex items-center justify-between gap-2">
                  <span className="text-[#555C68]">Guitiriz · Buggies YAMAHA</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {summaryStats.guitirizBuggies.freeNow}/{summaryStats.guitirizBuggies.total || 2}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#555C68]">Guitiriz · Carros eléctricos</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {summaryStats.guitirizTrolleys.freeNow}/{summaryStats.guitirizTrolleys.total || 6}
                  </span>
                </div>
                <div className="pt-2 border-t border-[#EBEEF3] flex items-center justify-between gap-2">
                  <span className="text-[#555C68]">Aguas Santas · Buggies</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {summaryStats.aguasBuggies.freeNow}/{summaryStats.aguasBuggies.total || 10}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#555C68]">Aguas Santas · Carros eléct.</span>
                  <span className="font-mono font-semibold text-[#111827]">
                    {summaryStats.aguasTrolleys.freeNow}/{summaryStats.aguasTrolleys.total || 6}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854] space-y-1">
                <p className="font-semibold text-[#111827]">
                  Solo consulta de disponibilidad
                </p>
                <p className="text-[#555C68] leading-relaxed">
                  Los usuarios player no tienen permisos para reservar vehículos directamente. Para
                  solicitar un buggy o carro eléctrico, contacta con recepción del campo de golf.
                </p>
              </div>
            </div>
          ) : (
            <>
              {confirmedMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{confirmedMsg}</span>
                </div>
              )}

              {actionError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              <form onSubmit={handleReserveVehicle} className="space-y-4">
                {isStaff && (
              <AdminPlayerSelector
                players={playersDirectory}
                selectedUserId={staffTargetUserId}
                onChange={setStaffTargetUserId}
                onPlayerCreated={(created) =>
                  setPlayersDirectory((prev) =>
                    prev.some((u) => u.id === created.id)
                      ? prev.map((u) => (u.id === created.id ? created : u))
                      : [...prev, created]
                  )
                }
                authFetch={authFetch}
                currentAdminLabel={
                  profile
                    ? `${profile.nombre} ${profile.apellidos}`.trim() || profile.email
                    : undefined
                }
              />
            )}

            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1.5">Campo</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!canManageCourse('guitiriz')}
                  onClick={() => {
                    if (!canManageCourse('guitiriz')) return;
                    setReserveCourse('guitiriz');
                    setReserveVehicleId('');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    reserveCourse === 'guitiriz'
                      ? 'bg-[#003087] text-white border-[#003087]'
                      : !canManageCourse('guitiriz')
                      ? 'bg-[#EEF1F6] text-[#A2AAA4] border-[#E2E5EB] cursor-not-allowed'
                      : 'bg-white text-[#111827] border-[#E2E5EB]'
                  }`}
                >
                  Guitiriz (9h)
                  {!canManageCourse('guitiriz') && (
                    <span className="block text-[10px] font-normal">Solo consulta</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={!canManageCourse('aguas-santas')}
                  onClick={() => {
                    if (!canManageCourse('aguas-santas')) return;
                    setReserveCourse('aguas-santas');
                    setReserveVehicleId('');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    reserveCourse === 'aguas-santas'
                      ? 'bg-[#003087] text-white border-[#003087]'
                      : !canManageCourse('aguas-santas')
                      ? 'bg-[#EEF1F6] text-[#A2AAA4] border-[#E2E5EB] cursor-not-allowed'
                      : 'bg-white text-[#111827] border-[#E2E5EB]'
                  }`}
                >
                  Aguas Santas (18h)
                  {!canManageCourse('aguas-santas') && (
                    <span className="block text-[10px] font-normal">Solo consulta</span>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1.5">
                Tipo de vehículo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReserveType('buggy');
                    setReserveVehicleId('');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    reserveType === 'buggy'
                      ? 'bg-[#003087] text-white border-[#003087]'
                      : 'bg-white text-[#111827] border-[#E2E5EB]'
                  }`}
                >
                  Buggy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReserveType('electric_trolley');
                    setReserveVehicleId('');
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    reserveType === 'electric_trolley'
                      ? 'bg-[#003087] text-white border-[#003087]'
                      : 'bg-white text-[#111827] border-[#E2E5EB]'
                  }`}
                >
                  Carro eléctrico
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="fleet-start-time"
                className="block text-xs font-medium text-[#404854] mb-1.5"
              >
                Hora de recogida
              </label>
              <select
                id="fleet-start-time"
                value={reserveTime}
                onChange={(e) => {
                  setReserveTime(e.target.value);
                  setCheckStartTime(e.target.value);
                }}
                className="w-full px-3 py-2 text-xs font-hours font-medium bg-white border border-[#E2E5EB] rounded-lg"
              >
                {TEE_TIME_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fleet-unit-select"
                className="block text-xs font-medium text-[#404854] mb-1.5"
              >
                Unidad ({availableUnitsForForm.length} libres a las{' '}
                <span className="font-hours font-semibold">{reserveTime}</span>)
              </label>
              <select
                id="fleet-unit-select"
                value={reserveVehicleId}
                onChange={(e) => setReserveVehicleId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg"
              >
                <option value="">Asignación automática disponible</option>
                {availableUnitsForForm.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                    {u.brand ? ` · ${u.brand}` : ''} · {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fleet-notes"
                className="block text-xs font-medium text-[#404854] mb-1.5"
              >
                Referencia / Nota
              </label>
              <input
                id="fleet-notes"
                type="text"
                value={reserveNotes}
                onChange={(e) => setReserveNotes(e.target.value)}
                placeholder="Salida ya reservada, batería completa..."
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>

            <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854]">
              Pago en recepción del campo de golf.
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-lg transition-colors"
            >
              {!firebaseUser
                ? 'Acceder con Google para reservar'
                : submitting
                ? 'Reservando unidad...'
                : 'Confirmar reserva de vehículo'}
            </button>
              </form>
            </>
          )}
        </aside>
      </div>

      {/* Searchable Vehicle Reservations Ledger with Calendar Date Filter */}
      {firebaseUser && (
        <section className="pt-8 border-t border-[#E2E5EB] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#555C68]">
                {isStaff
                  ? 'Consulta histórica y diaria por calendario'
                  : 'Tus reservas registradas en Guitiriz y Aguas Santas'}
              </p>
              <h2 className="mt-0.5 font-display text-2xl font-semibold text-[#111827]">
                {isStaff ? 'Buscador de Reservas de Vehículos' : 'Mis Reservas de Vehículos'}
              </h2>
            </div>

            <span className="text-xs font-mono tabular-nums text-[#555C68]">
              {filteredVehicleReservations.length}{' '}
              {filteredVehicleReservations.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white border border-[#E2E5EB] rounded-xl p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={resSearch}
                onChange={(e) => setResSearch(e.target.value)}
                placeholder="Buscar por unidad, marca, titular, licencia, fecha o nota..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <EuropeanDateInput
                ariaLabel="Buscar reservas de vehículos por fecha en calendario"
                value={date}
                onChange={(nextDate) => {
                  setDate(nextDate);
                  setResDateScope('selected');
                }}
                className={`px-3 py-1.5 text-xs font-mono bg-white border rounded-lg text-[#111827] ${
                  resDateScope === 'selected'
                    ? 'border-[#003087] ring-1 ring-[#003087]/20'
                    : 'border-[#E2E5EB]'
                }`}
              />

              <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setDate(getTodayIsoDate());
                    setResDateScope('selected');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    resDateScope === 'selected' && date === getTodayIsoDate()
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  Hoy
                </button>
                {date !== getTodayIsoDate() && (
                  <button
                    type="button"
                    onClick={() => setResDateScope('selected')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      resDateScope === 'selected'
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    {formatEuropeanDate(date)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setResDateScope('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    resDateScope === 'all'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  Todas las fechas
                </button>
              </div>

              <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                {[
                  { id: 'all', label: 'Todos los campos' },
                  { id: 'guitiriz', label: 'Guitiriz' },
                  { id: 'aguas-santas', label: 'Aguas Santas' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() =>
                      setResCourseFilter(tab.id as 'all' | 'guitiriz' | 'aguas-santas')
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      resCourseFilter === tab.id
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                    <th className="py-3 px-4">Fecha y Horario</th>
                    <th className="py-3 px-4">Vehículo y Campo</th>
                    <th className="py-3 px-4">Titular / Jugador</th>
                    <th className="py-3 px-4">Estado y Notas</th>
                    <th className="py-3 px-4">Cobro en recepción</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEEF3] text-xs">
                  {resLoading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[#555C68]">
                        Cargando reservas de vehículos...
                      </td>
                    </tr>
                  ) : filteredVehicleReservations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-[#555C68]">
                        No hay reservas de vehículos para {resDateScope === 'selected' ? formatEuropeanDate(date) : 'el filtro actual'}.
                      </td>
                    </tr>
                  ) : (
                    filteredVehicleReservations.map((v) => {
                      const isCancelled = v.status === 'cancelled';
                      const isBilled = v.mewsStatus === 'BILLED_MEWS';
                      const statusText =
                        v.status === 'cancelled'
                          ? 'Cancelada'
                          : v.status === 'in_use'
                          ? 'En uso'
                          : v.status === 'returned'
                          ? 'Devuelto'
                          : 'Reservado';
                      return (
                        <tr key={v.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                            <span className="font-semibold text-[#111827]">
                              {formatEuropeanDate(v.date)}
                            </span>
                            <span className="mx-1.5 text-[#7A828E]">·</span>
                            <span className="font-hours text-[#003087] font-semibold">
                              {v.startTime}–{v.endTime}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <p className="font-mono font-semibold text-[#111827]">
                              {v.vehicleCode} ·{' '}
                              <span className="font-sans font-normal text-[#404854]">
                                {v.vehicleType === 'buggy' ? 'Buggy' : 'Carro eléctrico'}
                                {v.vehicleBrand ? ` · ${v.vehicleBrand}` : ''}
                              </span>
                            </p>
                            <p className="text-[11px] text-[#555C68]">{v.courseName}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#111827]">
                              {`${v.userNombre} ${v.userApellidos}`.trim() || v.userEmail}
                            </p>
                            <p className="font-mono text-[11px] text-[#555C68]">
                              {v.userLicencia ? `${v.userLicencia} · ` : ''}
                              {v.userTelefono || v.userEmail}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-medium ${
                                isCancelled
                                  ? 'text-[#B91C1C]'
                                  : v.status === 'returned'
                                  ? 'text-[#15803D]'
                                  : v.status === 'in_use'
                                  ? 'text-[#003087]'
                                  : 'text-[#111827]'
                              }`}
                            >
                              {statusText}
                            </span>
                            {v.teeTimeReservationId && (
                              <p className="text-[11px] text-[#555C68]">
                                Vinculado a Tee Time #{v.teeTimeReservationId}
                              </p>
                            )}
                            {v.notes && <p className="text-[11px] text-[#555C68]">{v.notes}</p>}
                          </td>
                          <td
                            className={`py-3 px-4 font-medium whitespace-nowrap ${
                              isCancelled
                                ? 'text-[#B91C1C]'
                                : isBilled
                                ? 'text-[#15803D]'
                                : 'text-[#B45309]'
                            }`}
                          >
                            {isCancelled
                              ? 'Cancelada'
                              : isBilled
                              ? 'Pagado en recepción'
                              : 'Pendiente en recepción'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                            {isStaff && canManageCourse(v.courseSlug) && v.status === 'reserved' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateVehicleReservation(v.id, { status: 'in_use' })
                                }
                                className="px-2.5 py-1 text-xs bg-[#EBEEF3] text-[#111827] rounded-md hover:bg-[#E2E5EB]"
                              >
                                Entregar
                              </button>
                            )}
                            {isStaff && canManageCourse(v.courseSlug) && v.status === 'in_use' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateVehicleReservation(v.id, { status: 'returned' })
                                }
                                className="px-2.5 py-1 text-xs bg-emerald-100 text-emerald-900 rounded-md hover:bg-emerald-200"
                              >
                                Devuelto
                              </button>
                            )}
                            {isStaff && canManageCourse(v.courseSlug) && !isCancelled && !isBilled && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateVehicleReservation(v.id, {
                                    mewsStatus: 'BILLED_MEWS',
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                              >
                                Cobrado
                              </button>
                            )}
                            {isStaff && canManageCourse(v.courseSlug) && (
                              <button
                                type="button"
                                onClick={() => openEditModal(v)}
                                className="px-2.5 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                              >
                                Editar
                              </button>
                            )}
                            {!isCancelled && (!isStaff || canManageCourse(v.courseSlug)) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateVehicleReservation(v.id, { status: 'cancelled' })
                                }
                                className="px-2.5 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                              >
                                Cancelar
                              </button>
                            )}
                            {isStaff &&
                              canManageCourse(v.courseSlug) &&
                              isCancelled &&
                              (confirmDeleteResId === v.id ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCancelledReservation(v.id)}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                  >
                                    Sí, borrar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteResId(null)}
                                    className="px-2 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteResId(v.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                >
                                  Borrar
                                </button>
                              ))}
                            {isStaff && !canManageCourse(v.courseSlug) && (
                              <span className="text-[11px] text-[#7A828E]">Solo consulta</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {editingRes && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar reserva de vehículo"
        >
          <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EBEEF3]">
              <h3 className="font-display text-2xl font-semibold text-[#111827]">
                Editar reserva de vehículo
              </h3>
              <button
                type="button"
                onClick={() => setEditingRes(null)}
                className="p-1.5 rounded-lg text-[#555C68] hover:bg-[#EBEEF3]"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              {playersDirectory.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">
                    Titular de la reserva
                  </label>
                  <select
                    value={editUserId}
                    onChange={(e) => setEditUserId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
                  >
                    {playersDirectory.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.apellidos
                          ? `${u.nombre} ${u.apellidos}`.trim()
                          : u.email}{' '}
                        ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">Vehículo</label>
                <select
                  value={editVehicleId}
                  onChange={(e) => setEditVehicleId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg"
                >
                  {(overview?.vehicles || [])
                    .filter((u) => canManageCourse(u.courseSlug))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code}
                        {u.brand ? ` · ${u.brand}` : ''} · {u.courseName} ·{' '}
                        {u.type === 'buggy' ? 'Buggy' : 'Carro eléctrico'}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Fecha</label>
                  <EuropeanDateInput
                    ariaLabel="Fecha de reserva de vehículo"
                    required
                    value={editDate}
                    onChange={(nextDate) => setEditDate(nextDate)}
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">
                    Hora de inicio
                  </label>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-hours font-medium bg-white border border-[#E2E5EB] rounded-lg"
                  >
                    {TEE_TIME_SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">Estado</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
                >
                  <option value="reserved">Reservado</option>
                  <option value="in_use">En uso</option>
                  <option value="returned">Devuelto</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">Nota</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingRes(null)}
                  className="px-4 py-2 text-xs font-medium text-[#555C68] hover:text-[#111827]"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg"
                >
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
