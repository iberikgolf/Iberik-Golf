import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  AcademyAvailabilityResponse,
  AcademyBookingRow,
  AcademySlotAvailability,
  UserProfile,
} from '../types/golf';
import {
  formatEuropeanDate,
  getNextWednesdayIsoDate,
  getPastWednesdays,
  getTodayIsoDate,
  getUpcomingWednesdays,
  isWednesdayIsoDate,
  shiftWednesdayIsoDate,
} from '../lib/golf-schedule';
import { AdminPlayerSelector } from './AdminPlayerSelector';
import { AcademyEditModal } from './AcademyEditModal';
import { EuropeanDateInput } from './EuropeanDateInput';

interface AcademyViewProps {
  initialTargetUserId?: string;
}

export const AcademyView: React.FC<AcademyViewProps> = ({ initialTargetUserId = '' }) => {
  const {
    firebaseUser,
    profile,
    isStaff,
    canManageAcademy,
    signInWithGoogle,
    authFetch,
  } = useAuth();
  const todayIso = getTodayIsoDate();
  const upcomingWednesdays = useMemo(() => getUpcomingWednesdays(6, todayIso), [todayIso]);

  const [date, setDate] = useState<string>(upcomingWednesdays[0]);
  const [data, setData] = useState<AcademyAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<AcademySlotAvailability | null>(null);
  const [studentsCount, setStudentsCount] = useState(1);
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [level, setLevel] = useState('Perfeccionamiento');
  const [notes, setNotes] = useState('');
  const [staffTargetUserId, setStaffTargetUserId] = useState(initialTargetUserId);
  const [playersDirectory, setPlayersDirectory] = useState<UserProfile[]>([]);

  // Instructor / Superuser academy bookings management state
  const [manageBookings, setManageBookings] = useState<AcademyBookingRow[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [manageSearch, setManageSearch] = useState('');
  const [manageDateScope, setManageDateScope] = useState<'selected' | 'pending' | 'all'>('selected');
  const [editingBooking, setEditingBooking] = useState<AcademyBookingRow | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  useEffect(() => {
    if (initialTargetUserId !== undefined) {
      setStaffTargetUserId(initialTargetUserId);
    }
  }, [initialTargetUserId]);

  useEffect(() => {
    const selectedTarget =
      isStaff && staffTargetUserId
        ? playersDirectory.find((u) => String(u.id) === staffTargetUserId)
        : profile;
    if (selectedTarget) {
      const fullName = `${selectedTarget.nombre || ''} ${selectedTarget.apellidos || ''}`.trim();
      if (fullName) {
        setStudentName(fullName);
      }
      setStudentPhone(selectedTarget.telefono || '');
    }
  }, [isStaff, staffTargetUserId, playersDirectory, profile]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedMsg, setConfirmedMsg] = useState<string | null>(null);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/academy/availability?date=${encodeURIComponent(date)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo consultar la agenda de Víctor López.');
      }
      const payload: AcademyAvailabilityResponse = await res.json();
      setData(payload);
      setSelectedSlot((prev) => {
        if (!payload.isWednesday) return null;
        if (!prev) {
          return payload.slots.find((s) => s.remainingSpots > 0) || payload.slots[0] || null;
        }
        return payload.slots.find((s) => s.slotTime === prev.slotTime) || payload.slots[0] || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchManageBookings = useCallback(async () => {
    if ((!isStaff && !canManageAcademy) || !firebaseUser) {
      setManageBookings([]);
      setManageLoading(false);
      return;
    }
    setManageLoading(true);
    setManageError(null);
    try {
      const res = await authFetch('/api/academy/bookings');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudieron cargar las reservas de clases.');
      }
      const rows: AcademyBookingRow[] = await res.json();
      setManageBookings(rows);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Error al cargar reservas');
    } finally {
      setManageLoading(false);
    }
  }, [isStaff, canManageAcademy, firebaseUser, authFetch]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  useEffect(() => {
    fetchManageBookings();
  }, [fetchManageBookings]);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAvailability(), fetchManageBookings()]);
  }, [fetchAvailability, fetchManageBookings]);

  const handlePatchBooking = async (
    id: number,
    patch: {
      status?: string;
      mewsStatus?: string;
      isComplete?: boolean;
    }
  ) => {
    setManageError(null);
    try {
      const res = await authFetch(`/api/academy/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la clase.');
      }
      setConfirmCancelId(null);
      await refreshAll();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Error al actualizar la clase');
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAcademy || !selectedSlot || !data?.isWednesday) return;
    setSubmitError(null);
    setConfirmedMsg(null);

    if (!firebaseUser) {
      await signInWithGoogle();
      return;
    }

    const trimmedStudentName = studentName.trim();
    if (!trimmedStudentName) {
      setSubmitError('Debes indicar al menos un nombre de alumno para reservar la clase.');
      return;
    }

    const willMarkComplete = selectedSlot.bookedStudents === 0 && isComplete;

    setSubmitting(true);
    try {
      const res = await authFetch('/api/academy/bookings', {
        method: 'POST',
        body: JSON.stringify({
          date,
          slotTime: selectedSlot.slotTime,
          studentsCount,
          studentName: trimmedStudentName,
          studentPhone: studentPhone.trim(),
          isComplete: willMarkComplete,
          level,
          notes,
          ...(isStaff && staffTargetUserId ? { targetUserId: Number(staffTargetUserId) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo confirmar la plaza en clase.');
      }

      const titularName = body.titular
        ? `${body.titular.nombre || ''} ${body.titular.apellidos || ''}`.trim() || body.titular.email
        : '';

      setConfirmedMsg(
        `Clase reservada con Víctor López en Guitiriz el ${formatEuropeanDate(date)} a las ${selectedSlot.slotTime} (${studentsCount} ${
          studentsCount === 1 ? 'alumno' : 'alumnos'
        }: ${trimmedStudentName})${willMarkComplete ? ' · Marcada como clase completa (franja cerrada)' : ''}${
          titularName ? ` · Titular: ${titularName}` : ''
        }. Pago en recepción del campo de golf.`
      );
      setNotes('');
      setIsComplete(false);
      await refreshAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al reservar la clase');
    } finally {
      setSubmitting(false);
    }
  };

  const bookingsBySlotForSelectedDate = useMemo(() => {
    const map = new Map<string, AcademyBookingRow[]>();
    for (const row of manageBookings) {
      if (row.date !== date || row.status === 'cancelled') continue;
      const list = map.get(row.slotTime) || [];
      list.push(row);
      map.set(row.slotTime, list);
    }
    return map;
  }, [manageBookings, date]);

  const selectedSlotBookings = useMemo(() => {
    if (!selectedSlot) return [];
    return manageBookings.filter(
      (b) => b.date === date && b.slotTime === selectedSlot.slotTime && b.status !== 'cancelled'
    );
  }, [manageBookings, date, selectedSlot]);

  const pastWednesdays = useMemo(() => {
    const base = getPastWednesdays(6, todayIso);
    if (!isStaff && !canManageAcademy) {
      return base;
    }
    const merged = new Set<string>(base);
    for (const b of manageBookings) {
      if (b.date < todayIso && isWednesdayIsoDate(b.date)) {
        merged.add(b.date);
      }
    }
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [todayIso, isStaff, canManageAcademy, manageBookings]);

  const bookingCountsByDate = useMemo(() => {
    const map = new Map<string, { total: number; pending: number; billed: number }>();
    for (const b of manageBookings) {
      if (b.status === 'cancelled') continue;
      const current = map.get(b.date) || { total: 0, pending: 0, billed: 0 };
      current.total += 1;
      if (b.mewsStatus === 'BILLED_MEWS') {
        current.billed += 1;
      } else {
        current.pending += 1;
      }
      map.set(b.date, current);
    }
    return map;
  }, [manageBookings]);

  const isPastSelectedDate = date < todayIso;

  const filteredManageBookings = useMemo(() => {
    const q = manageSearch.trim().toLowerCase();
    return manageBookings.filter((b) => {
      if (manageDateScope === 'selected' && b.date !== date) return false;
      if (
        manageDateScope === 'pending' &&
        (b.status === 'cancelled' || b.mewsStatus === 'BILLED_MEWS')
      ) {
        return false;
      }
      if (!q) return true;
      return [
        b.studentName,
        b.studentPhone,
        b.userNombre,
        b.userApellidos,
        b.userEmail,
        b.userTelefono,
        b.date,
        formatEuropeanDate(b.date),
        b.slotTime,
        b.level,
        b.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [manageBookings, manageDateScope, date, manageSearch]);

  const ledgerSummary = useMemo(() => {
    let billed = 0;
    let pending = 0;
    for (const b of filteredManageBookings) {
      if (b.status === 'cancelled') continue;
      if (b.mewsStatus === 'BILLED_MEWS') {
        billed += 1;
      } else {
        pending += 1;
      }
    }
    return { billed, pending };
  }, [filteredManageBookings]);

  const morningSlots = data?.slots.filter((s) => s.session === 'morning') || [];
  const afternoonSlots = data?.slots.filter((s) => s.session === 'afternoon') || [];

  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E2E5EB]">
        <div>
          <p className="text-xs font-medium text-[#555C68]">
            Golf Guitiriz · Profesor Víctor López · Miércoles · 30 minutos · Máx. 4 alumnos
          </p>
          <h1 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
            Academia de Golf en Guitiriz
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setDate((prev) => shiftWednesdayIsoDate(prev, -1));
                setConfirmedMsg(null);
              }}
              aria-label="Miércoles anterior"
              title="Miércoles anterior"
              className="p-2 bg-white border border-[#E2E5EB] rounded-lg text-[#111827] hover:bg-[#F4F6F9]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <EuropeanDateInput
              ariaLabel="Fecha de clase"
              value={date}
              onChange={(nextDate) => {
                setDate(nextDate);
                setConfirmedMsg(null);
              }}
              className="px-3.5 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
            />
            <button
              type="button"
              onClick={() => {
                setDate((prev) => shiftWednesdayIsoDate(prev, 1));
                setConfirmedMsg(null);
              }}
              aria-label="Miércoles siguiente"
              title="Miércoles siguiente"
              className="p-2 bg-white border border-[#E2E5EB] rounded-lg text-[#111827] hover:bg-[#F4F6F9]"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={fetchAvailability}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#E2E5EB] rounded-lg text-[#111827] hover:bg-[#F4F6F9] whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Past & Upcoming Wednesdays Quick Tabs */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#555C68] mr-1 min-w-[132px]">
            Miércoles pasados:
          </span>
          {pastWednesdays.map((wed) => {
            const counts = bookingCountsByDate.get(wed);
            const isSelected = date === wed;
            return (
              <button
                key={wed}
                type="button"
                onClick={() => {
                  setDate(wed);
                  setConfirmedMsg(null);
                }}
                className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-[#003087] text-white border-[#003087]'
                    : 'bg-[#F8FAFC] text-[#404854] border-[#E2E5EB] hover:border-[#003087]'
                }`}
              >
                <span>{formatEuropeanDate(wed)}</span>
                {(isStaff || canManageAcademy) && counts && counts.pending > 0 && (
                  <span
                    className={`ml-1.5 font-sans text-[11px] font-semibold ${
                      isSelected ? 'text-amber-200' : 'text-[#B45309]'
                    }`}
                  >
                    · {counts.pending} pend.
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#555C68] mr-1 min-w-[132px]">
            Próximos miércoles:
          </span>
          {upcomingWednesdays.map((wed) => {
            const counts = bookingCountsByDate.get(wed);
            const isSelected = date === wed;
            return (
              <button
                key={wed}
                type="button"
                onClick={() => {
                  setDate(wed);
                  setConfirmedMsg(null);
                }}
                className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-[#003087] text-white border-[#003087]'
                    : 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                }`}
              >
                <span>{formatEuropeanDate(wed)}</span>
                {(isStaff || canManageAcademy) && counts && counts.pending > 0 && (
                  <span
                    className={`ml-1.5 font-sans text-[11px] font-semibold ${
                      isSelected ? 'text-amber-200' : 'text-[#B45309]'
                    }`}
                  >
                    · {counts.pending} pend.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && !data.isWednesday ? (
        <div className="p-8 bg-white border border-[#E2E5EB] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-[#111827]">
              La fecha seleccionada ({formatEuropeanDate(date)}) no es miércoles.
            </p>
            <p className="text-sm text-[#555C68]">
              Víctor López imparte sus clases en Guitiriz exclusivamente los miércoles de 11:00 a
              14:00 y de 16:00 a 18:00.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDate(getNextWednesdayIsoDate(date))}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg whitespace-nowrap shrink-0"
          >
            Ir al próximo miércoles
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Slots List */}
          <div className="lg:col-span-7 space-y-6">
            {/* Morning */}
            <div className="bg-white border border-[#E2E5EB] rounded-xl p-6 space-y-4">
              <div className="flex items-baseline justify-between border-b border-[#EBEEF3] pb-3">
                <h2 className="font-display text-2xl font-semibold text-[#111827]">
                  Turno de mañana
                </h2>
                <span className="text-xs font-hours font-medium tabular-nums text-[#555C68]">
                  11:00 – 14:00 · 6 sesiones de 30 min
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {morningSlots.map((slot) => {
                  const isFull = slot.remainingSpots === 0;
                  const isSelected = selectedSlot?.slotTime === slot.slotTime;
                  const slotBookings = bookingsBySlotForSelectedDate.get(slot.slotTime) || [];
                  const namesPreview = slotBookings
                    .map(
                      (b) =>
                        b.studentName ||
                        `${b.userNombre} ${b.userApellidos}`.trim() ||
                        b.userEmail
                    )
                    .join(', ');
                  return (
                    <button
                      key={slot.slotTime}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStudentsCount((prev) =>
                          Math.max(1, Math.min(prev, slot.remainingSpots || 1))
                        );
                        setIsComplete(false);
                        setSubmitError(null);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-colors ${
                        isSelected
                          ? 'bg-[#003087] text-white border-[#003087]'
                          : isFull
                          ? 'bg-[#EEF1F6] text-[#7A828E] border-[#E2E5EB] hover:border-[#003087]'
                          : 'bg-[#F8FAFC] text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                      }`}
                    >
                      <p className="font-hours text-sm font-semibold tabular-nums">
                        {slot.slotTime} – {slot.endTime}
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          isSelected
                            ? 'text-white/85'
                            : isFull
                            ? 'text-[#B91C1C]'
                            : 'text-[#15803D]'
                        }`}
                      >
                        {slot.isClosedComplete
                          ? `Completa (${slot.bookedStudents} alum. · cerrada)`
                          : isFull
                          ? 'Grupo completo (4/4)'
                          : `${slot.remainingSpots}/4 plazas libres`}
                      </p>
                      {(isStaff || canManageAcademy) && namesPreview && (
                        <p
                          className={`mt-1 text-[11px] truncate ${
                            isSelected ? 'text-white/80' : 'text-[#404854]'
                          }`}
                        >
                          {namesPreview}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Afternoon */}
            <div className="bg-white border border-[#E2E5EB] rounded-xl p-6 space-y-4">
              <div className="flex items-baseline justify-between border-b border-[#EBEEF3] pb-3">
                <h2 className="font-display text-2xl font-semibold text-[#111827]">
                  Turno de tarde
                </h2>
                <span className="text-xs font-hours font-medium tabular-nums text-[#555C68]">
                  16:00 – 18:00 · 4 sesiones de 30 min
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {afternoonSlots.map((slot) => {
                  const isFull = slot.remainingSpots === 0;
                  const isSelected = selectedSlot?.slotTime === slot.slotTime;
                  const slotBookings = bookingsBySlotForSelectedDate.get(slot.slotTime) || [];
                  const namesPreview = slotBookings
                    .map(
                      (b) =>
                        b.studentName ||
                        `${b.userNombre} ${b.userApellidos}`.trim() ||
                        b.userEmail
                    )
                    .join(', ');
                  return (
                    <button
                      key={slot.slotTime}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setStudentsCount((prev) =>
                          Math.max(1, Math.min(prev, slot.remainingSpots || 1))
                        );
                        setIsComplete(false);
                        setSubmitError(null);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition-colors ${
                        isSelected
                          ? 'bg-[#003087] text-white border-[#003087]'
                          : isFull
                          ? 'bg-[#EEF1F6] text-[#7A828E] border-[#E2E5EB] hover:border-[#003087]'
                          : 'bg-[#F8FAFC] text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                      }`}
                    >
                      <p className="font-hours text-sm font-semibold tabular-nums">
                        {slot.slotTime} – {slot.endTime}
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          isSelected
                            ? 'text-white/85'
                            : isFull
                            ? 'text-[#B91C1C]'
                            : 'text-[#15803D]'
                        }`}
                      >
                        {slot.isClosedComplete
                          ? `Completa (${slot.bookedStudents} alum. · cerrada)`
                          : isFull
                          ? 'Grupo completo (4/4)'
                          : `${slot.remainingSpots}/4 plazas libres`}
                      </p>
                      {(isStaff || canManageAcademy) && namesPreview && (
                        <p
                          className={`mt-1 text-[11px] truncate ${
                            isSelected ? 'text-white/80' : 'text-[#404854]'
                          }`}
                        >
                          {namesPreview}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Booking Form & Instructor/Superuser Slot Details */}
          <aside className="lg:col-span-5 bg-white border border-[#E2E5EB] rounded-xl p-6 space-y-5">
            {selectedSlot ? (
              <>
                <div className="pb-4 border-b border-[#EBEEF3]">
                  <p className="text-xs text-[#555C68]">
                    Guitiriz · Profesor Víctor López
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-[#111827]">
                    Clase{' '}
                    <span className="font-hours font-semibold tabular-nums">
                      {selectedSlot.slotTime} – {selectedSlot.endTime}
                    </span>
                  </h2>
                  <p className="mt-1 text-xs font-mono tabular-nums text-[#555C68]">
                    {formatEuropeanDate(date)}
                    {isPastSelectedDate && (
                      <span className="ml-2 font-sans font-medium text-[#B45309]">
                        · Miércoles pasado (revisión de cobros)
                      </span>
                    )}
                  </p>
                </div>

                {confirmedMsg && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <span>{confirmedMsg}</span>
                  </div>
                )}

                {submitError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                {(isStaff || canManageAcademy) && selectedSlotBookings.length > 0 && (
                  <div className="space-y-3 pb-4 border-b border-[#EBEEF3]">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#0B1B3B]">
                        Reservas en esta franja ({selectedSlotBookings.length})
                      </p>
                      <span className="text-[11px] font-mono text-[#555C68]">
                        {selectedSlot.bookedStudents}/4 alumnos
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {selectedSlotBookings.map((b) => {
                        const isBilled = b.mewsStatus === 'BILLED_MEWS';
                        const canToggleComplete = b.isComplete || selectedSlotBookings.length === 1;
                        return (
                          <div
                            key={b.id}
                            className="p-3 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[#111827] truncate">
                                  {b.studentName ||
                                    `${b.userNombre} ${b.userApellidos}`.trim() ||
                                    b.userEmail}
                                </p>
                                <p className="text-[11px] font-mono text-[#555C68] truncate">
                                  {b.studentPhone || b.userTelefono || b.userEmail}
                                </p>
                              </div>
                              <span
                                className={`text-[11px] font-semibold whitespace-nowrap ${
                                  b.isComplete ? 'text-[#003087]' : 'text-[#555C68]'
                                }`}
                              >
                                {b.isComplete
                                  ? `Completa (${b.studentsCount})`
                                  : `${b.studentsCount} ${
                                      b.studentsCount === 1 ? 'alumno' : 'alumnos'
                                    }`}
                              </span>
                            </div>

                            <p className="text-[11px] text-[#404854]">
                              {b.level}
                              {b.notes ? ` · ${b.notes}` : ''}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span
                                className={`text-[11px] font-medium ${
                                  isBilled ? 'text-[#15803D]' : 'text-[#B45309]'
                                }`}
                              >
                                {isBilled ? 'Pagado en recepción' : 'Pendiente en recepción'}
                              </span>

                              {canManageAcademy ? (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {canToggleComplete && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePatchBooking(b.id, { isComplete: !b.isComplete })
                                      }
                                      className="px-2 py-1 text-[11px] font-medium text-[#003087] border border-[#003087]/30 bg-white hover:bg-[#003087]/5 rounded"
                                    >
                                      {b.isComplete ? 'Reabrir' : 'Marcar completa'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setEditingBooking(b)}
                                    className="px-2 py-1 text-[11px] font-medium text-[#111827] border border-[#E2E5EB] bg-white hover:bg-[#EBEEF3] rounded"
                                  >
                                    Editar
                                  </button>
                                  {!isBilled && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePatchBooking(b.id, {
                                          status: 'completed',
                                          mewsStatus: 'BILLED_MEWS',
                                        })
                                      }
                                      className="px-2 py-1 text-[11px] font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded"
                                    >
                                      Cobrado
                                    </button>
                                  )}
                                  {confirmCancelId === b.id ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handlePatchBooking(b.id, { status: 'cancelled' })
                                        }
                                        className="px-2 py-1 text-[11px] font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded"
                                      >
                                        Sí, cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        className="px-2 py-1 text-[11px] text-[#555C68] border border-[#E2E5EB] bg-white rounded"
                                      >
                                        No
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(b.id)}
                                      className="px-2 py-1 text-[11px] font-medium text-[#B91C1C] border border-red-200 bg-white hover:bg-red-50 rounded"
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] font-medium text-[#555C68]">
                                  Solo consulta
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!canManageAcademy ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#555C68]">Estado de la franja</span>
                        <span
                          className={`font-semibold ${
                            selectedSlot.remainingSpots === 0
                              ? 'text-[#B91C1C]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {selectedSlot.isClosedComplete
                            ? 'Clase completa (cerrada)'
                            : selectedSlot.remainingSpots === 0
                            ? 'Grupo completo (4/4)'
                            : `${selectedSlot.remainingSpots} de 4 plazas libres`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#555C68]">Turno</span>
                        <span className="font-medium text-[#111827]">
                          {selectedSlot.session === 'morning' ? 'Mañana' : 'Tarde'} · 30 min
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#555C68]">Profesor</span>
                        <span className="font-medium text-[#111827]">Víctor López · Guitiriz</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854] space-y-1">
                      <p className="font-semibold text-[#111827]">
                        {isStaff ? 'Solo consulta en Golf Guitiriz' : 'Solo consulta de disponibilidad'}
                      </p>
                      <p className="text-[#555C68] leading-relaxed">
                        {isStaff
                          ? 'Tu cuenta tiene permisos de edición únicamente en Golf Aguas Santas. Aquí puedes consultar la agenda de clases de Guitiriz en modo lectura.'
                          : 'Los usuarios player no tienen permisos para reservar clases directamente. Para confirmar una plaza en este horario, contacta con recepción del campo de golf o con el profesor Víctor López.'}
                      </p>
                    </div>
                  </div>
                ) : selectedSlot.remainingSpots === 0 ? (
                  <p className="text-sm text-[#B91C1C] py-2">
                    {selectedSlot.isClosedComplete
                      ? 'Esta franja ha sido marcada como clase completa y cerrada para nuevas inscripciones.'
                      : 'Este turno ya alcanzó el máximo de 4 alumnos. Selecciona otro horario de 30 minutos.'}
                  </p>
                ) : (
                  <form onSubmit={handleBook} className="space-y-4">
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
                      <label className="block text-xs font-medium text-[#404854] mb-1.5">
                        Plazas a reservar (máx. {selectedSlot.remainingSpots} libres)
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map((n) => {
                          const disabled = n > selectedSlot.remainingSpots;
                          return (
                            <button
                              key={n}
                              type="button"
                              disabled={disabled}
                              onClick={() => setStudentsCount(n)}
                              className={`py-2 text-xs font-mono font-medium rounded-lg border transition-colors ${
                                studentsCount === n
                                  ? 'bg-[#003087] text-white border-[#003087]'
                                  : disabled
                                  ? 'bg-[#EEF1F6] text-[#A2AAA4] border-[#E2E5EB] cursor-not-allowed'
                                  : 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                              }`}
                            >
                              {n} {n === 1 ? 'alum.' : 'alum.'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="academy-student-name"
                        className="block text-xs font-medium text-[#404854] mb-1.5"
                      >
                        Nombre del alumno *
                      </label>
                      <input
                        id="academy-student-name"
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder={
                          studentsCount > 1
                            ? 'Ej. Carlos García, Laura Pérez'
                            : 'Nombre y apellidos del alumno'
                        }
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="academy-student-phone"
                        className="block text-xs font-medium text-[#404854] mb-1.5"
                      >
                        Teléfono de contacto (opcional)
                      </label>
                      <input
                        id="academy-student-phone"
                        type="tel"
                        value={studentPhone}
                        onChange={(e) => setStudentPhone(e.target.value)}
                        placeholder="600 000 000"
                        className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="academy-level"
                        className="block text-xs font-medium text-[#404854] mb-1.5"
                      >
                        Enfoque de la sesión
                      </label>
                      <select
                        id="academy-level"
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                      >
                        <option value="Iniciación">Iniciación (toma de contacto)</option>
                        <option value="Perfeccionamiento">Perfeccionamiento de swing</option>
                        <option value="Juego corto y putt">Juego corto, approach y putt</option>
                        <option value="Salida al campo">Estrategia y salida a 9 hoyos</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="academy-notes"
                        className="block text-xs font-medium text-[#404854] mb-1.5"
                      >
                        Notas para Víctor López
                      </label>
                      <input
                        id="academy-notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Hándicap actual, préstamo de palos..."
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                      />
                    </div>

                    <label
                      className={`flex items-start gap-2.5 p-3 border border-[#E2E5EB] rounded-lg select-none ${
                        selectedSlot.bookedStudents > 0
                          ? 'bg-[#F4F6F9] opacity-65 cursor-not-allowed'
                          : 'bg-[#F8FAFC] cursor-pointer hover:border-[#003087]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={selectedSlot.bookedStudents > 0}
                        checked={selectedSlot.bookedStudents === 0 && isComplete}
                        onChange={(e) => setIsComplete(e.target.checked)}
                        className="mt-0.5 rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
                      />
                      <span className="text-xs text-[#111827]">
                        <strong className="block font-semibold">
                          Marcar clase como completa (cierra la franja)
                        </strong>
                        <span className="text-[11px] text-[#555C68]">
                          {selectedSlot.bookedStudents > 0
                            ? 'Ya hay otros alumnos inscritos en este horario.'
                            : 'Cierra el turno para otros alumnos aunque solo haya 1 alumno inscrito.'}
                        </span>
                      </span>
                    </label>

                    <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854]">
                      Pago en recepción del campo de golf.
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-lg transition-colors"
                    >
                      {!firebaseUser
                        ? 'Acceder con Google para reservar clase'
                        : submitting
                        ? 'Reservando plaza...'
                        : (
                          <>
                            Reservar clase de las{' '}
                            <span className="font-hours tabular-nums">{selectedSlot.slotTime}</span>
                          </>
                        )}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <p className="text-xs text-[#555C68]">
                Selecciona una sesión de miércoles para ver los detalles.
              </p>
            )}
          </aside>
        </div>
      )}

      {/* Full Instructor / Superuser Academy Management Ledger */}
      {(isStaff || canManageAcademy) && (
        <section className="space-y-4 pt-4 border-t border-[#E2E5EB]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#003087]">
                {isStaff
                  ? canManageAcademy
                    ? 'Gestión Superusuario'
                    : 'Solo consulta Superusuario'
                  : 'Panel del Profesor'}{' '}
                · Víctor López (Guitiriz)
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#111827]">
                Todas las reservas de clases
              </h2>
              <p className="mt-1 text-xs font-mono tabular-nums text-[#555C68]">
                {ledgerSummary.billed} {ledgerSummary.billed === 1 ? 'cobrada' : 'cobradas'}
                {' · '}
                <span className={ledgerSummary.pending > 0 ? 'font-semibold text-[#B45309]' : ''}>
                  {ledgerSummary.pending}{' '}
                  {ledgerSummary.pending === 1 ? 'pendiente de cobro' : 'pendientes de cobro'}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  placeholder="Buscar alumno, teléfono, fecha..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-lg"
                />
              </div>

              <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                <button
                  type="button"
                  onClick={() => setManageDateScope('selected')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    manageDateScope === 'selected'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  Solo {formatEuropeanDate(date)}
                </button>
                <button
                  type="button"
                  onClick={() => setManageDateScope('pending')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    manageDateScope === 'pending'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  Pendientes de cobro
                </button>
                <button
                  type="button"
                  onClick={() => setManageDateScope('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    manageDateScope === 'all'
                      ? 'bg-white text-[#111827] shadow-xs'
                      : 'text-[#555C68] hover:text-[#111827]'
                  }`}
                >
                  Todas las fechas
                </button>
              </div>
            </div>
          </div>

          {manageError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{manageError}</span>
            </div>
          )}

          <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                    <th className="py-3 px-4">Miércoles y Hora</th>
                    <th className="py-3 px-4">Alumno y Contacto</th>
                    <th className="py-3 px-4">Plazas / Franja</th>
                    <th className="py-3 px-4">Cobro</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEEF3] text-xs">
                  {manageLoading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#555C68]">
                        Cargando agenda de clases...
                      </td>
                    </tr>
                  ) : filteredManageBookings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#555C68]">
                        No hay clases registradas para este filtro.
                      </td>
                    </tr>
                  ) : (
                    filteredManageBookings.map((b) => {
                      const isCancelled = b.status === 'cancelled';
                      const isBilled = b.mewsStatus === 'BILLED_MEWS';
                      const sameSlotOthers = manageBookings.filter(
                        (other) =>
                          other.id !== b.id &&
                          other.date === b.date &&
                          other.slotTime === b.slotTime &&
                          other.status !== 'cancelled'
                      );
                      const canToggleComplete = b.isComplete || sameSlotOthers.length === 0;
                      return (
                        <tr key={b.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setDate(b.date);
                                setManageDateScope('selected');
                              }}
                              className="font-semibold text-[#111827] hover:text-[#003087] hover:underline text-left"
                            >
                              {formatEuropeanDate(b.date)}
                            </button>
                            <span className="mx-1.5 text-[#7A828E]">·</span>
                            <span className="font-hours text-[#003087] font-semibold">
                              {b.slotTime}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#111827]">
                              {b.studentName ||
                                `${b.userNombre} ${b.userApellidos}`.trim() ||
                                b.userEmail}
                            </p>
                            <p className="font-mono text-[11px] text-[#555C68]">
                              {b.studentPhone || b.userTelefono || b.userEmail}
                            </p>
                            {b.studentName && (
                              <p className="text-[11px] text-[#555C68]">
                                Titular: {`${b.userNombre} ${b.userApellidos}`.trim() || b.userEmail}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[#404854]">
                            <p>
                              {b.studentsCount} {b.studentsCount === 1 ? 'alumno' : 'alumnos'} ·{' '}
                              {b.level}
                            </p>
                            {b.isComplete && !isCancelled && (
                              <p className="text-[11px] font-semibold text-[#003087] mt-0.5">
                                Clase completa · franja cerrada
                              </p>
                            )}
                            {b.notes && (
                              <p className="text-[11px] text-[#555C68] mt-0.5">{b.notes}</p>
                            )}
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
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {canManageAcademy ? (
                              <div className="inline-flex items-center gap-1.5">
                                {!isCancelled && canToggleComplete && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePatchBooking(b.id, { isComplete: !b.isComplete })
                                    }
                                    className="px-2.5 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                  >
                                    {b.isComplete ? 'Reabrir' : 'Marcar completa'}
                                  </button>
                                )}
                                {!isCancelled && !isBilled && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handlePatchBooking(b.id, {
                                        status: 'completed',
                                        mewsStatus: 'BILLED_MEWS',
                                      })
                                    }
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                  >
                                    Marcar cobrado
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingBooking(b)}
                                  className="px-2.5 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                >
                                  Editar
                                </button>
                                {!isCancelled && (
                                  confirmCancelId === b.id ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handlePatchBooking(b.id, { status: 'cancelled' })
                                        }
                                        className="px-2.5 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                      >
                                        Sí, cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        className="px-2 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                      >
                                        No
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(b.id)}
                                      className="px-2.5 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      Cancelar
                                    </button>
                                  )
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-[#555C68]">
                                Solo consulta
                              </span>
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

      <AcademyEditModal
        booking={editingBooking}
        users={isStaff ? playersDirectory : []}
        authFetch={authFetch}
        onClose={() => setEditingBooking(null)}
        onSaved={refreshAll}
      />
    </div>
  );
};
