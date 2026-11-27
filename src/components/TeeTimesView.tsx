import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  CourseAvailabilityResponse,
  TeeTimeReservationRow,
  TeeTimeSlotAvailability,
  UserProfile,
} from '../types/golf';
import {
  formatEuropeanDate,
  formatEuropeanDateTime,
  getTodayIsoDate,
  timeToMinutes,
} from '../lib/golf-schedule';
import { AdminPlayerSelector } from './AdminPlayerSelector';
import { TeeTimeEditModal } from './TeeTimeEditModal';
import { TeeTimeMoveModal } from './TeeTimeMoveModal';
import { EuropeanDateInput } from './EuropeanDateInput';

interface TeeTimesViewProps {
  initialCourseSlug?: string;
  initialTargetUserId?: string;
}

export const TeeTimesView: React.FC<TeeTimesViewProps> = ({
  initialCourseSlug = 'guitiriz',
  initialTargetUserId = '',
}) => {
  const {
    firebaseUser,
    profile,
    isStaff,
    managedCourseSlugs,
    canManageCourse,
    signInWithGoogle,
    authFetch,
  } = useAuth();
  const [courseSlug, setCourseSlug] = useState<string>(initialCourseSlug);
  const canManageCurrentCourse = isStaff && canManageCourse(courseSlug);
  const managedCoursesLabel = managedCourseSlugs
    .map((slug) => (slug === 'aguas-santas' ? 'Golf Aguas Santas' : 'Golf Guitiriz'))
    .join(' y ');
  const [date, setDate] = useState<string>(getTodayIsoDate());
  const [sessionFilter, setSessionFilter] = useState<'all' | 'morning' | 'afternoon'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const [data, setData] = useState<CourseAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<TeeTimeSlotAvailability | null>(null);
  const [roundHoles, setRoundHoles] = useState<9 | 18>(18);
  const [playersCount, setPlayersCount] = useState(2);
  const [playerEntries, setPlayerEntries] = useState<[string, string, string, string]>([
    '',
    '',
    '',
    '',
  ]);
  const [isComplete, setIsComplete] = useState(false);
  const [buggiesRequested, setBuggiesRequested] = useState(0);
  const [trolleysRequested, setTrolleysRequested] = useState(0);
  const [notes, setNotes] = useState('');
  const [staffTargetUserId, setStaffTargetUserId] = useState<string>(initialTargetUserId);
  const [playersDirectory, setPlayersDirectory] = useState<UserProfile[]>([]);

  // Staff / Superuser live ledger & inspection state
  const [staffReservations, setStaffReservations] = useState<TeeTimeReservationRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffActionError, setStaffActionError] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showCancelledInSlot, setShowCancelledInSlot] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<'reservations' | 'players'>('reservations');
  const [adminDateScope, setAdminDateScope] = useState<'selected' | 'all'>('selected');
  const [adminSearch, setAdminSearch] = useState('');
  const [adminPlayerSearch, setAdminPlayerSearch] = useState('');
  const [editingTeeTime, setEditingTeeTime] = useState<TeeTimeReservationRow | null>(null);
  const [movingTeeTime, setMovingTeeTime] = useState<TeeTimeReservationRow | null>(null);
  const desiredSlotTimeRef = useRef<string | null>(null);
  const sidePanelRef = useRef<HTMLElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    slotTime: string;
    courseName: string;
    holes: number;
    vehicles: string[];
    playersLabel?: string;
  } | null>(null);

  useEffect(() => {
    if (initialCourseSlug) {
      setCourseSlug(initialCourseSlug);
    }
  }, [initialCourseSlug]);

  useEffect(() => {
    if (initialTargetUserId !== undefined) {
      setStaffTargetUserId(initialTargetUserId);
    }
  }, [initialTargetUserId]);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/availability?course=${encodeURIComponent(courseSlug)}&date=${encodeURIComponent(date)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'No se pudo cargar la parrilla de salidas.');
      }
      const payload: CourseAvailabilityResponse = await res.json();
      setData(payload);
      setSelectedSlot((prev) => {
        const targetTime = desiredSlotTimeRef.current;
        if (targetTime) {
          desiredSlotTimeRef.current = null;
          const matched = payload.slots.find((s) => s.slotTime === targetTime);
          if (matched) return matched;
        }
        if (!prev) {
          return payload.slots.find((s) => s.remainingPlayers > 0) || payload.slots[0] || null;
        }
        return payload.slots.find((s) => s.slotTime === prev.slotTime) || payload.slots[0] || null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [courseSlug, date]);

  const fetchStaffData = useCallback(async () => {
    if (!firebaseUser) {
      setStaffReservations([]);
      setPlayersDirectory([]);
      setStaffLoading(false);
      return;
    }
    setStaffLoading(true);
    try {
      const [resReservations, resUsers] = await Promise.all([
        authFetch('/api/tee-times'),
        isStaff ? authFetch('/api/users') : Promise.resolve(null),
      ]);
      if (resReservations.ok) {
        setStaffReservations(await resReservations.json());
      }
      if (resUsers && resUsers.ok) {
        setPlayersDirectory(await resUsers.json());
      } else if (!isStaff) {
        setPlayersDirectory([]);
      }
    } catch {
      // ignore transient background error
    } finally {
      setStaffLoading(false);
    }
  }, [isStaff, firebaseUser, authFetch]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  useEffect(() => {
    fetchStaffData();
  }, [fetchStaffData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAvailability(), fetchStaffData()]);
  }, [fetchAvailability, fetchStaffData]);

  const handleStaffPatchTeeTime = async (
    id: number,
    patch: { status?: string; mewsStatus?: string; isComplete?: boolean }
  ) => {
    setStaffActionError(null);
    try {
      const res = await authFetch(`/api/tee-times/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la reserva.');
      }
      await refreshAll();
    } catch (err) {
      setStaffActionError(err instanceof Error ? err.message : 'Error al actualizar reserva');
    }
  };

  const handleStaffDeleteCancelledTeeTime = async (id: number) => {
    setStaffActionError(null);
    try {
      const res = await authFetch(`/api/tee-times/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo borrar la reserva cancelada.');
      }
      setConfirmDeleteId(null);
      await refreshAll();
    } catch (err) {
      setStaffActionError(err instanceof Error ? err.message : 'Error al borrar la reserva cancelada');
    }
  };

  const daySlotReservationsMap = useMemo(() => {
    const map = new Map<string, TeeTimeReservationRow[]>();
    if (!firebaseUser) return map;
    for (const r of staffReservations) {
      if (r.courseSlug !== courseSlug || r.date !== date || r.status === 'cancelled') continue;
      const list = map.get(r.slotTime) || [];
      list.push(r);
      map.set(r.slotTime, list);
    }
    return map;
  }, [firebaseUser, staffReservations, courseSlug, date]);

  const daySlotCancelledCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!firebaseUser) return map;
    for (const r of staffReservations) {
      if (r.courseSlug !== courseSlug || r.date !== date || r.status !== 'cancelled') continue;
      map.set(r.slotTime, (map.get(r.slotTime) || 0) + 1);
    }
    return map;
  }, [firebaseUser, staffReservations, courseSlug, date]);

  const playerDailyActiveReservation = useMemo(() => {
    if (isStaff || !firebaseUser) return null;
    return staffReservations.find((r) => r.date === date && r.status !== 'cancelled') || null;
  }, [isStaff, firebaseUser, staffReservations, date]);

  const dayActiveSummary = useMemo(() => {
    let reservations = 0;
    let players = 0;
    daySlotReservationsMap.forEach((list) => {
      reservations += list.length;
      list.forEach((r) => {
        players += r.playersCount;
      });
    });
    return { reservations, players };
  }, [daySlotReservationsMap]);

  const selectedSlotReservations = useMemo(() => {
    if (!firebaseUser || !selectedSlot) return [];
    return daySlotReservationsMap.get(selectedSlot.slotTime) || [];
  }, [firebaseUser, selectedSlot, daySlotReservationsMap]);

  const selectedSlotCancelledReservations = useMemo(() => {
    if (!firebaseUser || !selectedSlot) return [];
    return staffReservations.filter(
      (r) =>
        r.courseSlug === courseSlug &&
        r.date === date &&
        r.slotTime === selectedSlot.slotTime &&
        r.status === 'cancelled'
    );
  }, [firebaseUser, selectedSlot, staffReservations, courseSlug, date]);

  const filteredStaffReservations = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return staffReservations.filter((r) => {
      if (r.courseSlug !== courseSlug) return false;
      if (adminDateScope === 'selected' && r.date !== date) return false;
      if (!q) return true;
      return [
        r.userNombre,
        r.userApellidos,
        r.userEmail,
        r.userLicencia,
        r.userTelefono,
        r.playerNames,
        r.date,
        formatEuropeanDate(r.date),
        r.slotTime,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [staffReservations, courseSlug, adminDateScope, date, adminSearch]);

  const filteredStaffPlayers = useMemo(() => {
    const q = adminPlayerSearch.trim().toLowerCase();
    if (!q) return playersDirectory;
    return playersDirectory.filter((u) =>
      [u.nombre, u.apellidos, u.email, u.licencia, u.telefono, u.poblacion]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [playersDirectory, adminPlayerSearch]);

  const filteredSlots = useMemo(() => {
    if (!data) return [];
    return data.slots.filter((slot) => {
      const mins = timeToMinutes(slot.slotTime);
      if (sessionFilter === 'morning' && mins >= 14 * 60) return false;
      if (sessionFilter === 'afternoon' && mins < 14 * 60) return false;
      if (onlyAvailable && slot.remainingPlayers === 0) return false;
      return true;
    });
  }, [data, sessionFilter, onlyAvailable]);

  const handleSelectSlot = (slot: TeeTimeSlotAvailability) => {
    setSelectedSlot(slot);
    setConfirmation(null);
    setSubmitError(null);
    setStaffActionError(null);
    setConfirmCancelId(null);
    setShowCancelledInSlot(false);
    setIsComplete(false);
    const nextHoles: 9 | 18 =
      slot.canBook18Holes === false ? 9 : roundHoles;
    if (nextHoles !== roundHoles) {
      setRoundHoles(nextHoles);
    }
    const maxBuggies =
      nextHoles === 9
        ? slot.availableBuggies9 ?? slot.availableBuggies
        : slot.availableBuggies;
    const maxTrolleys =
      nextHoles === 9
        ? slot.availableTrolleys9 ?? slot.availableTrolleys
        : slot.availableTrolleys;
    setPlayersCount((prev) => Math.max(1, Math.min(prev, slot.remainingPlayers || 1)));
    setBuggiesRequested((prev) => Math.min(prev, maxBuggies));
    setTrolleysRequested((prev) => Math.min(prev, maxTrolleys));
  };

  const handleInspectReservationInPanel = (reservation: TeeTimeReservationRow) => {
    setConfirmation(null);
    setSubmitError(null);
    setStaffActionError(null);
    setConfirmCancelId(null);
    setShowCancelledInSlot(reservation.status === 'cancelled');
    setOnlyAvailable(false);
    setSessionFilter('all');

    if (reservation.courseSlug === courseSlug && reservation.date === date && data) {
      const targetSlot = data.slots.find((s) => s.slotTime === reservation.slotTime);
      if (targetSlot) {
        setSelectedSlot(targetSlot);
      }
    } else {
      desiredSlotTimeRef.current = reservation.slotTime;
      setCourseSlug(reservation.courseSlug);
      setDate(reservation.date);
    }

    if (sidePanelRef.current) {
      sidePanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCurrentCourse || !selectedSlot || !data) return;
    setSubmitError(null);
    setConfirmation(null);

    if (!firebaseUser) {
      await signInWithGoogle();
      return;
    }

    const effectiveHoles: 9 | 18 =
      selectedSlot.canBook18Holes === false ? 9 : roundHoles;
    const maxBuggiesForHoles =
      effectiveHoles === 9
        ? selectedSlot.availableBuggies9 ?? selectedSlot.availableBuggies
        : selectedSlot.availableBuggies;
    const maxTrolleysForHoles =
      effectiveHoles === 9
        ? selectedSlot.availableTrolleys9 ?? selectedSlot.availableTrolleys
        : selectedSlot.availableTrolleys;
    const effectiveBuggies = Math.min(buggiesRequested, maxBuggiesForHoles);
    const effectiveTrolleys = Math.min(trolleysRequested, maxTrolleysForHoles);
    const willMarkComplete = selectedSlot.bookedPlayers === 0 && isComplete;
    const serializedPlayerNames = playerEntries
      .slice(0, playersCount)
      .map((name) => name.trim())
      .filter(Boolean)
      .join(', ');

    setSubmitting(true);
    try {
      const res = await authFetch('/api/tee-times', {
        method: 'POST',
        body: JSON.stringify({
          courseSlug,
          date,
          slotTime: selectedSlot.slotTime,
          holes: effectiveHoles,
          playersCount,
          playerNames: serializedPlayerNames,
          isComplete: willMarkComplete,
          buggiesRequested: effectiveBuggies,
          trolleysRequested: effectiveTrolleys,
          notes,
          ...(isStaff && staffTargetUserId ? { targetUserId: Number(staffTargetUserId) } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo completar la reserva.');
      }

      const assignedCodes: string[] = Array.isArray(body.assignedVehicles)
        ? body.assignedVehicles.map((v: { code: string; brand?: string }) =>
            v.brand ? `${v.code} (${v.brand})` : v.code
          )
        : [];
      const titularName = body.titular
        ? `${body.titular.nombre || ''} ${body.titular.apellidos || ''}`.trim() || body.titular.email
        : undefined;
      const playersLabel = serializedPlayerNames || titularName;

      setConfirmation({
        slotTime: selectedSlot.slotTime,
        courseName: data.course.name,
        holes: effectiveHoles,
        vehicles: assignedCodes,
        playersLabel,
      });
      setPlayerEntries(['', '', '', '']);
      setBuggiesRequested(0);
      setTrolleysRequested(0);
      setIsComplete(false);
      setNotes('');
      await refreshAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al procesar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-[#E2E5EB]">
        <div>
          <p className="text-xs font-medium text-[#555C68]">
            Parrilla en tiempo real · Salidas de 08:30 a 19:00 cada 10 minutos · Modalidades de 9 y 18 hoyos
          </p>
          <h1 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
            Reservas de Tee Time
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Course Segmented Selector */}
          <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg border border-[#E2E5EB]">
            <button
              type="button"
              onClick={() => {
                setCourseSlug('guitiriz');
                setConfirmation(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                courseSlug === 'guitiriz'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#555C68] hover:text-[#111827]'
              }`}
            >
              Guitiriz · 9 hoyos
            </button>
            <button
              type="button"
              onClick={() => {
                setCourseSlug('aguas-santas');
                setConfirmation(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                courseSlug === 'aguas-santas'
                  ? 'bg-white text-[#111827] shadow-xs'
                  : 'text-[#555C68] hover:text-[#111827]'
              }`}
            >
              Aguas Santas · 18 hoyos
            </button>
          </div>

          <EuropeanDateInput
            ariaLabel="Fecha de reserva"
            value={date}
            onChange={(nextDate) => {
              setDate(nextDate);
              setConfirmation(null);
            }}
            className="px-3.5 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827] focus-within:outline-2 focus-within:outline-[#003087]"
          />

          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-[#E2E5EB] rounded-lg text-[#111827] hover:bg-[#F4F6F9] transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Superuser Mode Banner */}
      {isStaff && (
        <div className="bg-[#0B1B3B] text-white rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/75">
              Modo Superusuario · {profile?.email}
              {!canManageCurrentCourse ? ' · Solo consulta en este campo' : ''}
            </p>
            <p className="text-sm font-semibold mt-0.5">
              {canManageCurrentCourse
                ? 'Titulares visibles en parrilla, edición directa de reservas y consulta completa de jugadores'
                : `Modo solo consulta en ${data?.course.name || courseSlug} · Gestión habilitada en ${managedCoursesLabel}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums shrink-0">
            <span>
              {dayActiveSummary.reservations}{' '}
              {dayActiveSummary.reservations === 1 ? 'reserva' : 'reservas'} ·{' '}
              {dayActiveSummary.players} jug. ({formatEuropeanDate(date)})
            </span>
            <a
              href="#admin-tee-times-panel"
              className="px-3.5 py-2 font-sans font-semibold text-[#0B1B3B] bg-white hover:bg-[#EEF1F6] rounded-lg transition-colors whitespace-nowrap"
            >
              Gestionar reservas y jugadores
            </a>
          </div>
        </div>
      )}

      {/* Player Active Daily Booking Banner */}
      {!isStaff && firebaseUser && playerDailyActiveReservation && (
        <div className="bg-white border border-[#003087]/30 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#003087]">
              Tu reserva asignada · {formatEuropeanDate(date)}
            </p>
            <p className="text-sm font-semibold text-[#111827] mt-0.5">
              {playerDailyActiveReservation.courseName} a las{' '}
              <span className="font-hours text-[#003087]">
                {playerDailyActiveReservation.slotTime}
              </span>{' '}
              ({playerDailyActiveReservation.holes || 18} hoyos ·{' '}
              {playerDailyActiveReservation.playersCount}{' '}
              {playerDailyActiveReservation.playersCount === 1 ? 'jugador' : 'jugadores'})
            </p>
            <p className="text-xs text-[#555C68] mt-0.5">
              Puedes consultar los datos de tu salida en su tee time correspondiente. Para nuevas
              reservas o cambios, contacta con recepción del campo de golf.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleInspectReservationInPanel(playerDailyActiveReservation)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Ver mi reserva ({playerDailyActiveReservation.slotTime})
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
            {[
              { id: 'all', label: 'Toda la jornada (64)' },
              { id: 'morning', label: 'Mañana · 08:30–13:50' },
              { id: 'afternoon', label: 'Tarde · 14:00–19:00' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSessionFilter(item.id as 'all' | 'morning' | 'afternoon')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sessionFilter === item.id
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#555C68] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#404854] cursor-pointer select-none px-2">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
            />
            <span>Ocultar salidas completas</span>
          </label>
        </div>

        {data && (
          <div className="text-xs text-[#555C68] font-mono tabular-nums">
            <span>{formatEuropeanDate(data.date)}</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>
              Vehículos operativos: {data.fleetTotals.buggiesOperational}/{data.fleetTotals.buggiesTotal}{' '}
              buggies · {data.fleetTotals.trolleysOperational}/{data.fleetTotals.trolleysTotal}{' '}
              carros
            </span>
          </div>
        )}
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* Main Two-Column Grid: Tee Sheet + Booking Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Tee Sheet Grid */}
        <div className="lg:col-span-7 xl:col-span-8">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 16 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 rounded-xl bg-white border border-[#E2E5EB] animate-pulse"
                />
              ))}
            </div>
          ) : filteredSlots.length === 0 ? (
            <div className="p-10 bg-white border border-[#E2E5EB] rounded-xl text-center space-y-3">
              <p className="text-sm font-medium text-[#111827]">
                No hay salidas disponibles con el filtro actual.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSessionFilter('all');
                  setOnlyAvailable(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-[#EBEEF3] text-[#111827] rounded-lg hover:bg-[#E2E5EB]"
              >
                Mostrar todas las franjas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredSlots.map((slot) => {
                const isCrossover = Boolean(slot.isCrossoverBlocked);
                const isClosedComplete = Boolean(slot.isClosedComplete);
                const isFull = slot.remainingPlayers === 0;
                const isSelected = selectedSlot?.slotTime === slot.slotTime;
                const isPartial = !isFull && slot.remainingPlayers < 4;
                const slotBookings = daySlotReservationsMap.get(slot.slotTime) || [];
                const cancelledCount = daySlotCancelledCountMap.get(slot.slotTime) || 0;
                const playersSummary = slotBookings
                  .map(
                    (b) =>
                      b.playerNames?.trim() ||
                      `${b.userNombre} ${b.userApellidos}`.trim() ||
                      b.userEmail
                  )
                  .join(', ');

                return (
                  <button
                    key={slot.slotTime}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`text-left p-3.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#003087] text-white border-[#003087]'
                        : isCrossover
                        ? 'bg-[#FEF3C7]/45 text-[#78350F] border-[#F59E0B]/40 hover:border-[#D97706]'
                        : isFull
                        ? 'bg-[#EEF1F6] text-[#7A828E] border-[#E2E5EB] hover:border-[#C9CBC2]'
                        : 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-hours text-base font-semibold tabular-nums">
                        {slot.slotTime}
                      </span>
                      <span
                        className={`text-[11px] font-medium whitespace-nowrap ${
                          isSelected
                            ? 'text-white/90'
                            : isCrossover
                            ? 'text-[#B45309]'
                            : isFull
                            ? 'text-[#B91C1C]'
                            : isPartial
                            ? 'text-[#B45309]'
                            : 'text-[#15803D]'
                        }`}
                      >
                        {isCrossover
                          ? 'Cruce'
                          : isClosedComplete
                          ? `Completa (${slot.bookedPlayers})`
                          : isFull
                          ? 'Completo'
                          : `${slot.remainingPlayers}/4 libres`}
                      </span>
                    </div>

                    {isCrossover && slot.crossoverSourceSlot && (
                      <p
                        className={`mt-1.5 text-[11px] font-medium truncate ${
                          isSelected ? 'text-white/90' : 'text-[#92400E]'
                        }`}
                      >
                        Paso hoyo 9 (18h) · {slot.crossoverSourceSlot}
                      </p>
                    )}

                    {!isCrossover && !isFull && slot.canBook18Holes === false && slot.outgoingCrossoverSlot && (
                      <p
                        className={`mt-1.5 text-[11px] font-medium truncate ${
                          isSelected ? 'text-white/90' : 'text-[#B45309]'
                        }`}
                      >
                        Solo 9 hoyos (cruce {slot.outgoingCrossoverSlot})
                      </p>
                    )}

                    {isStaff && playersSummary && (
                      <p
                        className={`mt-1.5 text-[11px] font-medium truncate ${
                          isSelected ? 'text-white/95' : 'text-[#003087]'
                        }`}
                        title={playersSummary}
                      >
                        {playersSummary}
                      </p>
                    )}

                    {!isStaff && slotBookings.length > 0 && (
                      <p
                        className={`mt-1.5 text-[11px] font-semibold truncate ${
                          isSelected ? 'text-white/95' : 'text-[#003087]'
                        }`}
                        title={playersSummary}
                      >
                        {slotBookings[0].playerNames?.trim() ||
                          `Tu reserva · ${slotBookings[0].playersCount} jug.`}
                      </p>
                    )}

                    {firebaseUser &&
                      (isStaff ? !playersSummary : slotBookings.length === 0) &&
                      cancelledCount > 0 && (
                        <p
                          className={`mt-1.5 text-[11px] truncate ${
                            isSelected ? 'text-white/85' : 'text-[#6B7280]'
                          }`}
                        >
                          {isStaff
                            ? `${cancelledCount} ${
                                cancelledCount === 1 ? 'cancelada' : 'canceladas'
                              }`
                            : 'Tu reserva cancelada'}
                        </p>
                      )}

                    <div
                      className={`mt-2.5 pt-2 border-t text-[11px] font-mono tabular-nums flex items-center justify-between ${
                        isSelected
                          ? 'border-white/20 text-white/85'
                          : 'border-[#EBEEF3] text-[#555C68]'
                      }`}
                    >
                      <span>{slot.availableBuggies} bug.</span>
                      <span>{slot.availableTrolleys} car.</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Reservation Panel */}
        <aside
          ref={sidePanelRef}
          className="lg:col-span-5 xl:col-span-4 bg-white border border-[#E2E5EB] rounded-xl p-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto space-y-5"
        >
          {selectedSlot && data ? (
            <>
              <div className="pb-4 border-b border-[#EBEEF3]">
                <div className="flex items-center justify-between gap-2 text-xs text-[#555C68]">
                  <span>
                    {data.course.name} · {data.course.holes} hoyos
                  </span>
                  <span
                    className={`font-semibold ${
                      selectedSlot.isCrossoverBlocked
                        ? 'text-[#B45309]'
                        : selectedSlot.remainingPlayers === 0
                        ? 'text-[#B91C1C]'
                        : 'text-[#15803D]'
                    }`}
                  >
                    {selectedSlot.isCrossoverBlocked
                      ? 'Bloqueado por cruce'
                      : selectedSlot.isClosedComplete
                      ? 'Partida completa (cerrada)'
                      : selectedSlot.remainingPlayers === 0
                      ? 'Completo (4/4)'
                      : `${selectedSlot.bookedPlayers}/4 ocupadas`}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold text-[#111827]">
                    Salida <span className="font-hours font-semibold tabular-nums">{selectedSlot.slotTime}</span>
                  </h2>
                  <span className="text-xs font-mono tabular-nums text-[#555C68]">
                    {formatEuropeanDate(date)}
                  </span>
                </div>
              </div>

              {confirmation && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Reserva confirmada en {confirmation.courseName} ({confirmation.holes} hoyos) a las{' '}
                      <span className="font-hours font-semibold">{confirmation.slotTime}</span>
                    </span>
                  </div>
                  {confirmation.playersLabel && (
                    <p className="text-[11px] font-medium text-emerald-900">
                      Jugadores: {confirmation.playersLabel}
                    </p>
                  )}
                  {confirmation.vehicles.length > 0 && (
                    <p className="font-mono text-[11px]">
                      Equipo asignado: {confirmation.vehicles.join(', ')}
                    </p>
                  )}
                  <p className="text-emerald-800">
                    Pendiente de pago en recepción del campo de golf.
                  </p>
                </div>
              )}

              {submitError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Selected Slot Reservation Details (All reservations for Admins, Own reservation for Players) */}
              {firebaseUser &&
                (staffLoading && selectedSlotReservations.length === 0 && isStaff && selectedSlot.bookedPlayers > 0 ? (
                  <div className="p-4 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-xs text-[#555C68]">
                    Cargando información detallada de las reservas...
                  </div>
                ) : selectedSlotReservations.length > 0 || selectedSlotCancelledReservations.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[#111827]">
                        {isStaff
                          ? `Información de reservas en las ${selectedSlot.slotTime} (${selectedSlotReservations.length})`
                          : `Datos de tu reserva en las ${selectedSlot.slotTime}`}
                      </p>
                      {selectedSlotCancelledReservations.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowCancelledInSlot((prev) => !prev)}
                          className="text-[11px] font-medium text-[#003087] hover:underline"
                        >
                          {showCancelledInSlot
                            ? 'Ocultar canceladas'
                            : `Ver canceladas (${selectedSlotCancelledReservations.length})`}
                        </button>
                      )}
                    </div>

                    {staffActionError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{staffActionError}</span>
                      </div>
                    )}

                    <div className="space-y-3">
                      {(showCancelledInSlot
                        ? [...selectedSlotReservations, ...selectedSlotCancelledReservations]
                        : selectedSlotReservations
                      ).map((sr) => {
                        const holder =
                          `${sr.userNombre} ${sr.userApellidos}`.trim() || sr.userEmail;
                        const explicitPlayers = sr.playerNames?.trim() || '';
                        const playersHeading = explicitPlayers || holder;
                        const isCancelled = sr.status === 'cancelled';
                        const isBilled = sr.mewsStatus === 'BILLED_MEWS';
                        const statusLabel = isCancelled
                          ? 'Cancelada'
                          : sr.status === 'checked_in'
                          ? 'Check-in / Cobrado'
                          : 'Confirmada';
                        const billingLabel = isCancelled
                          ? 'Cancelada'
                          : isBilled
                          ? 'Pagado en recepción'
                          : 'Pendiente en recepción';
                        const vehiclesList = (sr.assignedVehicles || []).filter(
                          (v) => v.status !== 'cancelled' || isCancelled
                        );
                        const createdLabel = sr.createdAt
                          ? formatEuropeanDateTime(sr.createdAt)
                          : '';
                        const canToggleComplete = sr.isComplete || selectedSlotReservations.length === 1;

                        return (
                          <div
                            key={sr.id}
                            className={`p-3.5 rounded-lg border space-y-3 ${
                              isCancelled
                                ? 'bg-[#F8FAFC] border-[#E2E5EB] opacity-85'
                                : 'bg-[#F8FAFC] border-[#D5DCE6]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#E2E5EB]">
                              <div className="min-w-0">
                                <p className="text-[11px] font-mono text-[#555C68]">
                                  Reserva #{sr.id} · {formatEuropeanDate(sr.date)} ·{' '}
                                  <span className="font-hours font-semibold text-[#003087]">
                                    {sr.slotTime}
                                  </span>
                                </p>
                                <p className="text-sm font-semibold text-[#111827] mt-0.5 break-words">
                                  {playersHeading}
                                </p>
                              </div>
                              <span
                                className={`text-[11px] font-semibold whitespace-nowrap ${
                                  isCancelled
                                    ? 'text-[#B91C1C]'
                                    : isBilled
                                    ? 'text-[#15803D]'
                                    : 'text-[#B45309]'
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>

                            <dl className="grid grid-cols-1 gap-1.5 text-[11px]">
                              <div>
                                <dt className="text-[#555C68]">Jugadores</dt>
                                <dd className="text-[#111827] mt-0.5 break-words">
                                  {explicitPlayers || holder}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt className="text-[#555C68] shrink-0">Recorrido y plazas</dt>
                                <dd className="font-mono font-medium text-[#111827] text-right">
                                  {sr.holes || 18} hoyos · {sr.playersCount}{' '}
                                  {sr.playersCount === 1 ? 'jugador' : 'jugadores'}
                                  {sr.isComplete && !isCancelled ? ' · Partida completa (cerrada)' : ''}
                                </dd>
                              </div>
                              {!explicitPlayers && (
                                <>
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-[#555C68] shrink-0">Email</dt>
                                    <dd className="font-mono text-[#111827] text-right break-all">
                                      {sr.userEmail}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-[#555C68] shrink-0">Teléfono</dt>
                                    <dd className="font-mono text-[#111827] text-right">
                                      {sr.userTelefono || 'No registrado'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-[#555C68] shrink-0">Licencia</dt>
                                    <dd className="font-mono text-[#111827] text-right">
                                      {sr.userLicencia || 'Sin licencia'}
                                    </dd>
                                  </div>
                                </>
                              )}
                              <div>
                                <dt className="text-[#555C68]">Vehículos y horario</dt>
                                <dd className="font-mono text-[#111827] mt-0.5">
                                  {sr.buggiesRequested} bug. · {sr.trolleysRequested} car.
                                  {vehiclesList.length > 0 && (
                                    <span className="block text-[#003087] mt-0.5">
                                      {vehiclesList
                                        .map(
                                          (v) =>
                                            `${v.code}${v.brand ? ` · ${v.brand}` : ''} (${v.startTime}–${v.endTime})`
                                        )
                                        .join(', ')}
                                    </span>
                                  )}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-3">
                                <dt className="text-[#555C68] shrink-0">Cobro recepción</dt>
                                <dd
                                  className={`font-medium text-right ${
                                    isCancelled
                                      ? 'text-[#B91C1C]'
                                      : isBilled
                                      ? 'text-[#15803D]'
                                      : 'text-[#B45309]'
                                  }`}
                                >
                                  {billingLabel}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[#555C68]">Observaciones</dt>
                                <dd className="text-[#111827] mt-0.5 break-words">
                                  {sr.notes || 'Sin observaciones'}
                                </dd>
                              </div>
                              {createdLabel && (
                                <div className="flex justify-between gap-3">
                                  <dt className="text-[#555C68] shrink-0">Registrada</dt>
                                  <dd className="font-mono text-[#555C68] text-right">
                                    {createdLabel}
                                  </dd>
                                </div>
                              )}
                            </dl>

                            {(canManageCourse(sr.courseSlug) || (!isStaff && !isCancelled && !isBilled)) && (
                              <div className="pt-2.5 border-t border-[#E2E5EB] flex flex-wrap items-center justify-end gap-2">
                                {isStaff && canManageCourse(sr.courseSlug) && !isCancelled && canToggleComplete && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStaffPatchTeeTime(sr.id, { isComplete: !sr.isComplete })
                                    }
                                    className="px-2.5 py-1.5 text-[11px] font-medium text-[#003087] bg-white border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                  >
                                    {sr.isComplete ? 'Reabrir' : 'Marcar completa'}
                                  </button>
                                )}
                                {isStaff && canManageCourse(sr.courseSlug) && !isCancelled && !isBilled && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStaffPatchTeeTime(sr.id, {
                                        status: 'checked_in',
                                        mewsStatus: 'BILLED_MEWS',
                                      })
                                    }
                                    className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                  >
                                    Marcar cobrado
                                  </button>
                                )}
                                {!isCancelled && (isStaff ? canManageCourse(sr.courseSlug) : !isBilled) && (
                                  <button
                                    type="button"
                                    onClick={() => setMovingTeeTime(sr)}
                                    className="px-2.5 py-1.5 text-[11px] font-medium text-[#003087] bg-white border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                  >
                                    Mover hora
                                  </button>
                                )}
                                {isStaff && canManageCourse(sr.courseSlug) && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingTeeTime(sr)}
                                    className="px-2.5 py-1.5 text-[11px] font-semibold text-[#111827] bg-white border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                  >
                                    Editar
                                  </button>
                                )}
                                {!isCancelled &&
                                  (isStaff ? canManageCourse(sr.courseSlug) : !isBilled) &&
                                  (confirmCancelId === sr.id ? (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          await handleStaffPatchTeeTime(sr.id, {
                                            status: 'cancelled',
                                          });
                                          setConfirmCancelId(null);
                                        }}
                                        className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                      >
                                        Sí, cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelId(null)}
                                        className="px-2 py-1.5 text-[11px] font-medium text-[#555C68] bg-white border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(sr.id)}
                                      className="px-2.5 py-1.5 text-[11px] font-semibold text-[#B91C1C] bg-white border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      {isStaff ? 'Cancelar' : 'Cancelar mi reserva'}
                                    </button>
                                  ))}
                                {isStaff && canManageCourse(sr.courseSlug) && isCancelled &&
                                  (confirmDeleteId === sr.id ? (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleStaffDeleteCancelledTeeTime(sr.id)}
                                        className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                      >
                                        Sí, borrar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-2 py-1.5 text-[11px] font-medium text-[#555C68] bg-white border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(sr.id)}
                                      className="px-2.5 py-1.5 text-[11px] font-semibold text-[#B91C1C] bg-white border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      Borrar
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null)}

              {selectedSlot.remainingPlayers === 0 ? (
                <div className="py-5 px-4 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-center space-y-2.5">
                  {selectedSlot.isCrossoverBlocked ? (
                    <>
                      <p className="text-sm font-semibold text-[#B45309]">
                        Franja bloqueada por cruce de hoyo 9
                      </p>
                      <p className="text-xs text-[#555C68]">
                        La partida que salió a las {selectedSlot.crossoverSourceSlot} pasa por el
                        hoyo 9 dos horas después ({selectedSlot.slotTime}) para completar los 18
                        hoyos.
                      </p>
                      {selectedSlot.crossoverSourceSlot && (
                        <button
                          type="button"
                          onClick={() => {
                            const target = data.slots.find(
                              (s) => s.slotTime === selectedSlot.crossoverSourceSlot
                            );
                            if (target) handleSelectSlot(target);
                          }}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-[#003087] border border-[#003087]/30 rounded-md hover:bg-[#003087]/5"
                        >
                          Ver salida de las {selectedSlot.crossoverSourceSlot}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-[#B91C1C]">
                        {selectedSlot.isClosedComplete
                          ? 'Esta salida ha sido marcada como partida completa y cerrada para nuevas reservas.'
                          : 'Esta franja de salida ya tiene las 4 plazas completas.'}
                      </p>
                      <p className="text-xs text-[#555C68]">
                        {canManageCurrentCourse
                          ? 'Puedes editar, reabrir o cancelar cualquiera de las reservas mostradas arriba desde este mismo panel.'
                          : isStaff
                          ? 'Modo solo consulta: puedes revisar los datos de estas reservas, pero no editarlas ni cancelarlas en este campo.'
                          : 'Elige otro intervalo de 10 minutos en la parrilla.'}
                      </p>
                    </>
                  )}
                </div>
              ) : !canManageCurrentCourse ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#555C68]">Plazas disponibles</span>
                      <span className="font-mono font-semibold text-[#15803D]">
                        {selectedSlot.remainingPlayers} de 4 libres
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#555C68]">Buggies disponibles</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {selectedSlot.availableBuggies}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#555C68]">Carros eléctricos disp.</span>
                      <span className="font-mono font-medium text-[#111827]">
                        {selectedSlot.availableTrolleys}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854] space-y-1">
                    <p className="font-semibold text-[#111827]">
                      {isStaff
                        ? `Solo consulta en ${data.course.name}`
                        : 'Solo consulta de disponibilidad'}
                    </p>
                    <p className="text-[#555C68] leading-relaxed">
                      {isStaff
                        ? `Tu usuario tiene permisos de consulta en ${data.course.name}. Las nuevas reservas, ediciones y cancelaciones están habilitadas únicamente en ${managedCoursesLabel}.`
                        : 'Los usuarios player no tienen permisos para realizar reservas de tee time directamente. Para confirmar tu salida en este horario, contacta con recepción del campo de golf.'}
                    </p>
                  </div>

                  {playerDailyActiveReservation &&
                    (playerDailyActiveReservation.courseSlug !== courseSlug ||
                      playerDailyActiveReservation.slotTime !== selectedSlot.slotTime) && (
                      <button
                        type="button"
                        onClick={() => handleInspectReservationInPanel(playerDailyActiveReservation)}
                        className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors"
                      >
                        Ver tu reserva ({playerDailyActiveReservation.slotTime} ·{' '}
                        {playerDailyActiveReservation.courseName})
                      </button>
                    )}
                </div>
              ) : (
                <form onSubmit={handleReserve} className="space-y-4">
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
                      Modalidad del recorrido
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([9, 18] as const).map((holesOption) => {
                        const effectiveHoles: 9 | 18 =
                          selectedSlot.canBook18Holes === false ? 9 : roundHoles;
                        const disabled18 =
                          holesOption === 18 && selectedSlot.canBook18Holes === false;
                        const isActiveHoles = effectiveHoles === holesOption;
                        const nextMaxBuggies =
                          holesOption === 9
                            ? selectedSlot.availableBuggies9 ?? selectedSlot.availableBuggies
                            : selectedSlot.availableBuggies;
                        const nextMaxTrolleys =
                          holesOption === 9
                            ? selectedSlot.availableTrolleys9 ?? selectedSlot.availableTrolleys
                            : selectedSlot.availableTrolleys;
                        return (
                          <button
                            key={holesOption}
                            type="button"
                            disabled={disabled18}
                            onClick={() => {
                              setRoundHoles(holesOption);
                              setBuggiesRequested((prev) => Math.min(prev, nextMaxBuggies));
                              setTrolleysRequested((prev) => Math.min(prev, nextMaxTrolleys));
                            }}
                            className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors text-left ${
                              isActiveHoles
                                ? 'bg-[#003087] text-white border-[#003087]'
                                : disabled18
                                ? 'bg-[#EEF1F6] text-[#A2AAA4] border-[#E2E5EB] cursor-not-allowed'
                                : 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                            }`}
                          >
                            <span className="block font-semibold">{holesOption} hoyos</span>
                            <span
                              className={`block text-[10px] font-mono ${
                                isActiveHoles ? 'text-white/80' : 'text-[#555C68]'
                              }`}
                            >
                              {holesOption === 9
                                ? 'Sin cruce · 2 h'
                                : disabled18 && selectedSlot.outgoingCrossoverSlot
                                ? `Cruce ${selectedSlot.outgoingCrossoverSlot} ocupado`
                                : data.course.holes === 9
                                ? 'Con cruce 2 h · 4 h'
                                : 'Recorrido completo · 4 h'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#404854] mb-1.5">
                      Jugadores en la partida (máx. {selectedSlot.remainingPlayers} disponibles)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((n) => {
                        const disabled = n > selectedSlot.remainingPlayers;
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={disabled}
                            onClick={() => setPlayersCount(n)}
                            className={`py-2 text-xs font-mono font-medium rounded-lg border transition-colors ${
                              playersCount === n
                                ? 'bg-[#003087] text-white border-[#003087]'
                                : disabled
                                ? 'bg-[#EEF1F6] text-[#A2AAA4] border-[#E2E5EB] cursor-not-allowed'
                                : 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                            }`}
                          >
                            {n} {n === 1 ? 'jug.' : 'jug.'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#404854]">
                        Jugadores / Licencias (opcional)
                      </span>
                      <span className="text-[11px] font-mono text-[#555C68]">
                        {playersCount} {playersCount === 1 ? 'jugador' : 'jugadores'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {Array.from({ length: playersCount }, (_, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-1"
                        >
                          <label
                            htmlFor={`player-name-${idx + 1}`}
                            className="flex items-center justify-between text-[11px] font-medium text-[#404854]"
                          >
                            <span>Jugador {idx + 1}</span>
                            <span className="text-[#7A828E] font-normal">Opcional</span>
                          </label>
                          <input
                            id={`player-name-${idx + 1}`}
                            type="text"
                            value={playerEntries[idx] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPlayerEntries((prev) => {
                                const next: [string, string, string, string] = [...prev] as [
                                  string,
                                  string,
                                  string,
                                  string,
                                ];
                                next[idx] = value;
                                return next;
                              });
                            }}
                            placeholder={`Nombre o licencia del jugador ${idx + 1}`}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md text-[#111827] focus-visible:outline-2 focus-visible:outline-[#003087]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vehicle Allocation */}
                  {(() => {
                    const effectiveHoles: 9 | 18 =
                      selectedSlot.canBook18Holes === false ? 9 : roundHoles;
                    const availableBuggiesForHoles =
                      effectiveHoles === 9
                        ? selectedSlot.availableBuggies9 ?? selectedSlot.availableBuggies
                        : selectedSlot.availableBuggies;
                    const availableTrolleysForHoles =
                      effectiveHoles === 9
                        ? selectedSlot.availableTrolleys9 ?? selectedSlot.availableTrolleys
                        : selectedSlot.availableTrolleys;
                    return (
                      <div className="pt-3 border-t border-[#EBEEF3] space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-[#111827]">
                            Reserva de vehículos para esta salida
                          </p>
                          <span className="text-[11px] font-mono text-[#555C68]">
                            {effectiveHoles === 9 ? 'Uso aprox. 2 h (120 min)' : 'Uso aprox. 4 h (240 min)'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="buggies-select"
                              className="block text-[11px] text-[#555C68] mb-1"
                            >
                              Buggies ({availableBuggiesForHoles} disp.)
                            </label>
                            <select
                              id="buggies-select"
                              value={Math.min(buggiesRequested, availableBuggiesForHoles)}
                              onChange={(e) => setBuggiesRequested(Number(e.target.value))}
                              className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                            >
                              {Array.from({
                                length: Math.min(2, availableBuggiesForHoles) + 1,
                              }).map((_, idx) => (
                                <option key={idx} value={idx}>
                                  {idx} {idx === 1 ? 'buggy' : 'buggies'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="trolleys-select"
                              className="block text-[11px] text-[#555C68] mb-1"
                            >
                              Carros eléct. ({availableTrolleysForHoles} disp.)
                            </label>
                            <select
                              id="trolleys-select"
                              value={Math.min(trolleysRequested, availableTrolleysForHoles)}
                              onChange={(e) => setTrolleysRequested(Number(e.target.value))}
                              className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                            >
                              {Array.from({
                                length: Math.min(4, availableTrolleysForHoles) + 1,
                              }).map((_, idx) => (
                                <option key={idx} value={idx}>
                                  {idx} {idx === 1 ? 'carro' : 'carros'}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label
                      htmlFor="tee-notes"
                      className="block text-xs font-medium text-[#404854] mb-1.5"
                    >
                      Observaciones
                    </label>
                    <input
                      id="tee-notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Alquiler de palos, etc."
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                    />
                  </div>

                  <label
                    className={`flex items-start gap-2.5 p-3 border border-[#E2E5EB] rounded-lg select-none ${
                      selectedSlot.bookedPlayers > 0
                        ? 'bg-[#F4F6F9] opacity-65 cursor-not-allowed'
                        : 'bg-[#F8FAFC] cursor-pointer hover:border-[#003087]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={selectedSlot.bookedPlayers > 0}
                      checked={selectedSlot.bookedPlayers === 0 && isComplete}
                      onChange={(e) => setIsComplete(e.target.checked)}
                      className="mt-0.5 rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
                    />
                    <span className="text-xs text-[#111827]">
                      <strong className="block font-semibold">
                        Marcar partida como completa (cierra la franja)
                      </strong>
                      <span className="text-[11px] text-[#555C68]">
                        {selectedSlot.bookedPlayers > 0
                          ? 'Ya hay otros jugadores inscritos en este horario.'
                          : 'Cierra la salida para otros jugadores aunque haya menos de 4 plazas.'}
                      </span>
                    </span>
                  </label>

                  <div className="p-3.5 bg-[#F4F6F9] border border-[#E2E5EB] rounded-lg text-xs text-[#404854]">
                    Pago en recepción del campo de golf.
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {!firebaseUser
                      ? 'Acceder con Google para confirmar'
                      : submitting
                      ? 'Confirmando reserva...'
                      : (
                        <>
                          Confirmar salida a las{' '}
                          <span className="font-hours tabular-nums">{selectedSlot.slotTime}</span>
                        </>
                      )}
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="text-xs text-[#555C68]">Cargando detalles de la salida...</p>
          )}
        </aside>
      </div>

      {/* Superuser Management Panel inside Tee Times */}
      {isStaff && (
        <section id="admin-tee-times-panel" className="pt-8 border-t border-[#E2E5EB] space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#555C68]">
                Panel de Superusuario · {data?.course.name || courseSlug}
              </p>
              <h2 className="mt-0.5 font-display text-2xl font-semibold text-[#111827]">
                Reservas y Consulta de Jugadores
              </h2>
            </div>

            <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg border border-[#E2E5EB] self-start md:self-auto">
              <button
                type="button"
                onClick={() => setAdminSubTab('reservations')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  adminSubTab === 'reservations'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#555C68] hover:text-[#111827]'
                }`}
              >
                Reservas de Tee Time ({filteredStaffReservations.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminSubTab('players')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  adminSubTab === 'players'
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#555C68] hover:text-[#111827]'
                }`}
              >
                Todos los jugadores ({playersDirectory.length})
              </button>
            </div>
          </div>

          {staffActionError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{staffActionError}</span>
            </div>
          )}

          {adminSubTab === 'reservations' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#E2E5EB] rounded-xl p-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    placeholder="Buscar por titular, acompañante, licencia o correo..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
                  <EuropeanDateInput
                    ariaLabel="Seleccionar fecha en panel de administración"
                    value={date}
                    onChange={(nextDate) => {
                      setDate(nextDate);
                      setAdminDateScope('selected');
                    }}
                    className="px-3 py-1.5 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                  />
                  <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setDate(getTodayIsoDate());
                        setAdminDateScope('selected');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        adminDateScope === 'selected' && date === getTodayIsoDate()
                          ? 'bg-white text-[#111827] shadow-xs'
                          : 'text-[#555C68] hover:text-[#111827]'
                      }`}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminDateScope('selected')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        adminDateScope === 'selected' && date !== getTodayIsoDate()
                          ? 'bg-white text-[#111827] shadow-xs'
                          : 'text-[#555C68] hover:text-[#111827]'
                      }`}
                    >
                      {formatEuropeanDate(date)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminDateScope('all')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        adminDateScope === 'all'
                          ? 'bg-white text-[#111827] shadow-xs'
                          : 'text-[#555C68] hover:text-[#111827]'
                      }`}
                    >
                      Todas las fechas
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                        <th className="py-3 px-4">Fecha y Hora</th>
                        <th className="py-3 px-4">Jugadores</th>
                        <th className="py-3 px-4">Partida y Vehículos</th>
                        <th className="py-3 px-4">Estado y Cobro</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EBEEF3] text-xs">
                      {filteredStaffReservations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-[#555C68]">
                            No hay reservas de tee time que coincidan con el filtro actual.
                          </td>
                        </tr>
                      ) : (
                        filteredStaffReservations.map((r) => {
                          const isCancelled = r.status === 'cancelled';
                          const isBilled = r.mewsStatus === 'BILLED_MEWS';
                          const explicitPlayers = r.playerNames?.trim() || '';
                          const fallbackHolder =
                            `${r.userNombre} ${r.userApellidos}`.trim() || r.userEmail;
                          const sameSlotOthers = staffReservations.filter(
                            (other) =>
                              other.id !== r.id &&
                              other.courseSlug === r.courseSlug &&
                              other.date === r.date &&
                              other.slotTime === r.slotTime &&
                              other.status !== 'cancelled'
                          );
                          const canToggleComplete = r.isComplete || sameSlotOthers.length === 0;
                          return (
                            <tr key={r.id} className="hover:bg-[#F8FAFC]">
                              <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                                <span className="font-semibold text-[#111827]">
                                  {formatEuropeanDate(r.date)}
                                </span>
                                <span className="mx-1.5 text-[#7A828E]">·</span>
                                <span className="font-hours text-[#003087] font-semibold">
                                  {r.slotTime}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <p className="font-medium text-[#111827]">
                                  {explicitPlayers || fallbackHolder}
                                </p>
                                <p className="font-mono text-[11px] text-[#555C68]">
                                  {explicitPlayers
                                    ? `${r.playersCount} ${
                                        r.playersCount === 1 ? 'jugador' : 'jugadores'
                                      }`
                                    : `${r.userLicencia || 'Sin licencia'} · ${
                                        r.userTelefono || r.userEmail
                                      }`}
                                </p>
                              </td>
                              <td className="py-3 px-4 font-mono tabular-nums text-[#404854]">
                                <p>
                                  {r.holes || 18}h · {r.playersCount} jug. · {r.buggiesRequested} bug. ·{' '}
                                  {r.trolleysRequested} car.
                                </p>
                                {r.isComplete && !isCancelled && (
                                  <p className="font-sans text-[11px] font-semibold text-[#003087] mt-0.5">
                                    Partida completa · franja cerrada
                                  </p>
                                )}
                                {r.assignedVehicles && r.assignedVehicles.length > 0 && (
                                  <p className="text-[11px] text-[#003087] mt-0.5">
                                    {r.assignedVehicles
                                      .map((v) => (v.brand ? `${v.code} (${v.brand})` : v.code))
                                      .join(', ')}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`font-medium ${
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
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                                <button
                                  type="button"
                                  onClick={() => handleInspectReservationInPanel(r)}
                                  className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                >
                                  Ver en panel
                                </button>
                                {canManageCourse(r.courseSlug) && !isCancelled && canToggleComplete && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStaffPatchTeeTime(r.id, { isComplete: !r.isComplete })
                                    }
                                    className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                  >
                                    {r.isComplete ? 'Reabrir' : 'Marcar completa'}
                                  </button>
                                )}
                                {canManageCourse(r.courseSlug) && !isCancelled && !isBilled && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStaffPatchTeeTime(r.id, {
                                        status: 'checked_in',
                                        mewsStatus: 'BILLED_MEWS',
                                      })
                                    }
                                    className="px-3 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                  >
                                    Marcar cobrado
                                  </button>
                                )}
                                {canManageCourse(r.courseSlug) && !isCancelled && (
                                  <button
                                    type="button"
                                    onClick={() => setMovingTeeTime(r)}
                                    className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                  >
                                    Mover hora
                                  </button>
                                )}
                                {canManageCourse(r.courseSlug) && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingTeeTime(r)}
                                    className="px-3 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                  >
                                    Editar
                                  </button>
                                )}
                                {canManageCourse(r.courseSlug) && !isCancelled && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleStaffPatchTeeTime(r.id, { status: 'cancelled' })
                                    }
                                    className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                  >
                                    Cancelar
                                  </button>
                                )}
                                {canManageCourse(r.courseSlug) && isCancelled &&
                                  (confirmDeleteId === r.id ? (
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleStaffDeleteCancelledTeeTime(r.id)}
                                        className="px-3 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                      >
                                        Sí, borrar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-2.5 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(r.id)}
                                      className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      Borrar
                                    </button>
                                  ))}
                                {!canManageCourse(r.courseSlug) && (
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
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white border border-[#E2E5EB] rounded-xl p-4">
                <div className="relative max-w-md">
                  <Search className="w-4 h-4 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={adminPlayerSearch}
                    onChange={(e) => setAdminPlayerSearch(e.target.value)}
                    placeholder="Consultar jugador por nombre, licencia, teléfono, correo o población..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
                  />
                </div>
              </div>

              <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                        <th className="py-3 px-4">Nombre y Apellidos</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Teléfono</th>
                        <th className="py-3 px-4">Licencia</th>
                        <th className="py-3 px-4">Población</th>
                        <th className="py-3 px-4">Rol</th>
                        <th className="py-3 px-4 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EBEEF3] text-xs">
                      {filteredStaffPlayers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-[#555C68]">
                            No hay jugadores que coincidan con la búsqueda.
                          </td>
                        </tr>
                      ) : (
                        filteredStaffPlayers.map((u) => (
                          <tr key={u.id} className="hover:bg-[#F8FAFC]">
                            <td className="py-3 px-4 font-medium text-[#111827] whitespace-nowrap">
                              {`${u.nombre} ${u.apellidos}`.trim() || 'Sin nombre'}
                            </td>
                            <td className="py-3 px-4 font-mono text-[#404854] whitespace-nowrap">
                              {u.email}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-[#404854] whitespace-nowrap">
                              {u.telefono || '—'}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-[#111827] whitespace-nowrap">
                              {u.licencia || '—'}
                            </td>
                            <td className="py-3 px-4 text-[#404854] whitespace-nowrap">
                              {u.poblacion || '—'}
                            </td>
                            <td className="py-3 px-4 text-[#555C68] whitespace-nowrap">{u.role}</td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setStaffTargetUserId(String(u.id));
                                  if (!canManageCourse(courseSlug) && managedCourseSlugs.length > 0) {
                                    setCourseSlug(managedCourseSlugs[0]);
                                  }
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="px-3 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                              >
                                {canManageCourse(courseSlug) || managedCourseSlugs.length === 0
                                  ? 'Reservar para jugador'
                                  : `Reservar en ${managedCoursesLabel}`}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <TeeTimeEditModal
        reservation={editingTeeTime}
        users={playersDirectory}
        authFetch={authFetch}
        onClose={() => setEditingTeeTime(null)}
        onSaved={refreshAll}
      />

      <TeeTimeMoveModal
        reservation={movingTeeTime}
        isStaff={isStaff}
        authFetch={authFetch}
        onClose={() => setMovingTeeTime(null)}
        onMoved={async (newDate, newSlotTime) => {
          desiredSlotTimeRef.current = newSlotTime;
          if (newDate !== date) {
            setDate(newDate);
          } else {
            await refreshAll();
          }
        }}
      />
    </div>
  );
};
