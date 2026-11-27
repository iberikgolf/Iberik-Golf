import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type {
  AcademyBookingRow,
  FleetOverviewResponse,
  FleetVehicleItem,
  TeeTimeReservationRow,
  UserProfile,
  VehicleReservationRow,
} from '../types/golf';
import {
  TEE_TIME_SLOTS,
  formatEuropeanDate,
  getTodayIsoDate,
} from '../lib/golf-schedule';
import { TeeTimeEditModal } from './TeeTimeEditModal';
import { TeeTimeMoveModal } from './TeeTimeMoveModal';
import { AcademyEditModal } from './AcademyEditModal';
import { EuropeanDateInput } from './EuropeanDateInput';

interface PlayersAndReceptionViewProps {
  onBookForPlayer?: (tab: 'tee-times' | 'academia' | 'flota', userId: string) => void;
}

export const PlayersAndReceptionView: React.FC<PlayersAndReceptionViewProps> = ({
  onBookForPlayer,
}) => {
  const {
    firebaseUser,
    profile,
    isStaff,
    canManageAcademy,
    managedCourseSlugs,
    canManageCourse,
    signInWithGoogle,
    refreshProfile,
    authFetch,
  } = useAuth();
  const isInstructorOnly = !isStaff && canManageAcademy;
  const scopeSummary =
    managedCourseSlugs.length === 1
      ? managedCourseSlugs[0] === 'aguas-santas'
        ? 'Gestión Aguas Santas · Solo consulta Guitiriz'
        : 'Gestión Guitiriz · Solo consulta Aguas Santas'
      : 'Acceso integral Guitiriz & Aguas Santas';

  // Personal Profile State
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [licencia, setLicencia] = useState('');
  const [poblacion, setPoblacion] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Reservations & Reception State
  const [teeTimes, setTeeTimes] = useState<TeeTimeReservationRow[]>([]);
  const [academyBookings, setAcademyBookings] = useState<AcademyBookingRow[]>([]);
  const [vehicleReservations, setVehicleReservations] = useState<VehicleReservationRow[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleItem[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Staff filters & sub-tabs
  const [subTab, setSubTab] = useState<'reservations' | 'directory' | 'profile'>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayIsoDate());
  const [dateScope, setDateScope] = useState<'day' | 'all'>(() => (isStaff ? 'day' : 'all'));
  const [courseFilter, setCourseFilter] = useState<'all' | 'guitiriz' | 'aguas-santas'>('all');
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  useEffect(() => {
    if (isStaff) {
      setDateScope('day');
    }
  }, [isStaff]);

  // Staff Player Modal
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<UserProfile | null>(null);
  const [pEmail, setPEmail] = useState('');
  const [pNombre, setPNombre] = useState('');
  const [pApellidos, setPApellidos] = useState('');
  const [pTelefono, setPTelefono] = useState('');
  const [pLicencia, setPLicencia] = useState('');
  const [pPoblacion, setPPoblacion] = useState('');
  const [pRole, setPRole] = useState('player');
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [playerFormError, setPlayerFormError] = useState<string | null>(null);

  // Staff Edit Tee Time Modal
  const [editingTeeTime, setEditingTeeTime] = useState<TeeTimeReservationRow | null>(null);
  const [movingTeeTime, setMovingTeeTime] = useState<TeeTimeReservationRow | null>(null);

  // Staff / Instructor Edit Academy Modal
  const [editingAcademy, setEditingAcademy] = useState<AcademyBookingRow | null>(null);
  const [confirmCancelAcademyId, setConfirmCancelAcademyId] = useState<number | null>(null);

  // Staff Edit Vehicle Reservation Modal
  const [editingVehicleRes, setEditingVehicleRes] = useState<VehicleReservationRow | null>(null);
  const [vrUserId, setVrUserId] = useState('');
  const [vrVehicleId, setVrVehicleId] = useState('');
  const [vrDate, setVrDate] = useState('');
  const [vrStartTime, setVrStartTime] = useState('');
  const [vrStatus, setVrStatus] = useState('reserved');
  const [vrNotes, setVrNotes] = useState('');
  const [savingVehicleRes, setSavingVehicleRes] = useState(false);
  const [vehicleResModalError, setVehicleResModalError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setNombre(profile.nombre || '');
      setApellidos(profile.apellidos || '');
      setTelefono(profile.telefono || '');
      setLicencia(profile.licencia || '');
      setPoblacion(profile.poblacion || '');
    }
  }, [profile]);

  const loadWorkspaceData = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingData(true);
    setDataError(null);
    try {
      if (isInstructorOnly) {
        const res = await authFetch('/api/academy/bookings');
        if (res.ok) {
          setAcademyBookings(await res.json());
        }
        setTeeTimes([]);
        setVehicleReservations([]);
      } else {
        const requests: Promise<Response>[] = [
          authFetch('/api/tee-times'),
          authFetch('/api/academy/bookings'),
          authFetch('/api/fleet/reservations'),
        ];
        if (isStaff) {
          requests.push(authFetch('/api/users'));
          requests.push(authFetch('/api/fleet'));
        }
        const responses = await Promise.all(requests);
        if (responses[0].ok) {
          const rows: TeeTimeReservationRow[] = await responses[0].json();
          setTeeTimes(rows);
        }
        if (responses[1].ok) {
          setAcademyBookings(await responses[1].json());
        }
        if (responses[2].ok) {
          setVehicleReservations(await responses[2].json());
        }
        if (isStaff && responses[3] && responses[3].ok) {
          setUsersList(await responses[3].json());
        }
        if (isStaff && responses[4] && responses[4].ok) {
          const fleetData: FleetOverviewResponse = await responses[4].json();
          setFleetVehicles(fleetData.vehicles || []);
        }
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al cargar los registros');
    } finally {
      setLoadingData(false);
    }
  }, [firebaseUser, isStaff, isInstructorOnly, authFetch]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSavedMsg(null);
    setProfileError(null);
    try {
      const res = await authFetch('/api/me', {
        method: 'PUT',
        body: JSON.stringify({ nombre, apellidos, telefono, licencia, poblacion }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo guardar tu ficha.');
      }
      await refreshProfile();
      setProfileSavedMsg('Ficha de jugador actualizada correctamente.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Error al guardar perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdateTeeTime = async (
    id: number,
    patch: {
      status?: string;
      mewsStatus?: string;
      userId?: number;
      date?: string;
      slotTime?: string;
      holes?: number;
      playersCount?: number;
      playerNames?: string;
      isComplete?: boolean;
      notes?: string;
    }
  ) => {
    try {
      const res = await authFetch(`/api/tee-times/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la reserva.');
      }
      await loadWorkspaceData();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  const handleUpdateAcademy = async (
    id: number,
    patch: {
      status?: string;
      mewsStatus?: string;
      userId?: number;
      date?: string;
      slotTime?: string;
      studentsCount?: number;
      studentName?: string;
      studentPhone?: string;
      isComplete?: boolean;
      level?: string;
      notes?: string;
    }
  ) => {
    try {
      const res = await authFetch(`/api/academy/bookings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la clase.');
      }
      setConfirmCancelAcademyId(null);
      await loadWorkspaceData();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  const handleUpdateVehicleReservation = async (
    id: number,
    patch: {
      status?: string;
      mewsStatus?: string;
      userId?: number;
      vehicleId?: number;
      date?: string;
      startTime?: string;
      notes?: string;
    }
  ) => {
    try {
      const res = await authFetch(`/api/fleet/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo actualizar la reserva del vehículo.');
      }
      await loadWorkspaceData();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  const handleDeleteCancelled = async (
    kind: 'tee-time' | 'academy' | 'vehicle',
    id: number
  ) => {
    const url =
      kind === 'tee-time'
        ? `/api/tee-times/${id}`
        : kind === 'academy'
        ? `/api/academy/bookings/${id}`
        : `/api/fleet/reservations/${id}`;
    try {
      setDataError(null);
      const res = await authFetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo borrar la reserva cancelada.');
      }
      setConfirmDeleteKey(null);
      await loadWorkspaceData();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Error al borrar la reserva cancelada');
    }
  };


  const openVehicleResEditModal = (v: VehicleReservationRow) => {
    setEditingVehicleRes(v);
    setVrUserId(String(v.userId));
    setVrVehicleId(String(v.vehicleId));
    setVrDate(v.date);
    setVrStartTime(v.startTime);
    setVrStatus(v.status || 'reserved');
    setVrNotes(v.notes || '');
    setVehicleResModalError(null);
  };

  const handleSaveVehicleResModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicleRes) return;
    setSavingVehicleRes(true);
    setVehicleResModalError(null);
    try {
      const res = await authFetch(`/api/fleet/reservations/${editingVehicleRes.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          userId: Number(vrUserId),
          vehicleId: Number(vrVehicleId),
          date: vrDate,
          startTime: vrStartTime,
          status: vrStatus,
          notes: vrNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo guardar la reserva del vehículo.');
      }
      setEditingVehicleRes(null);
      await loadWorkspaceData();
    } catch (err) {
      setVehicleResModalError(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSavingVehicleRes(false);
    }
  };

  const openPlayerModal = (existing: UserProfile | null) => {
    setEditingPlayer(existing);
    setPEmail(existing?.email || '');
    setPNombre(existing?.nombre || '');
    setPApellidos(existing?.apellidos || '');
    setPTelefono(existing?.telefono || '');
    setPLicencia(existing?.licencia || '');
    setPPoblacion(existing?.poblacion || '');
    setPRole(existing?.role || 'player');
    setPlayerFormError(null);
    setPlayerModalOpen(true);
  };

  const handleSavePlayerRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPlayer(true);
    setPlayerFormError(null);
    try {
      const endpoint = editingPlayer ? `/api/users/${editingPlayer.id}` : '/api/users';
      const method = editingPlayer ? 'PUT' : 'POST';
      const res = await authFetch(endpoint, {
        method,
        body: JSON.stringify({
          email: pEmail,
          nombre: pNombre,
          apellidos: pApellidos,
          telefono: pTelefono,
          licencia: pLicencia,
          poblacion: pPoblacion,
          role: pRole,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo guardar el jugador.');
      }
      setPlayerModalOpen(false);
      await loadWorkspaceData();
    } catch (err) {
      setPlayerFormError(err instanceof Error ? err.message : 'Error al guardar jugador');
    } finally {
      setSavingPlayer(false);
    }
  };

  const filteredTeeTimes = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return teeTimes.filter((r) => {
      if (dateScope === 'day' && selectedDate && r.date !== selectedDate) return false;
      if (courseFilter !== 'all' && r.courseSlug !== courseFilter) return false;
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
        r.courseName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [teeTimes, dateScope, selectedDate, courseFilter, ledgerSearch]);

  const filteredAcademyBookings = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return academyBookings.filter((b) => {
      if (dateScope === 'day' && selectedDate && b.date !== selectedDate) return false;
      if (!q) return true;
      return [
        b.studentName,
        b.studentPhone,
        b.userNombre,
        b.userApellidos,
        b.userEmail,
        b.userLicencia,
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
  }, [academyBookings, dateScope, selectedDate, ledgerSearch]);

  const filteredVehicleReservations = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return vehicleReservations.filter((v) => {
      if (dateScope === 'day' && selectedDate && v.date !== selectedDate) return false;
      if (courseFilter !== 'all' && v.courseSlug !== courseFilter) return false;
      if (!q) return true;
      return [
        v.userNombre,
        v.userApellidos,
        v.userEmail,
        v.userLicencia,
        v.userTelefono,
        v.vehicleCode,
        v.vehicleBrand,
        v.vehicleLabel,
        v.courseName,
        v.date,
        formatEuropeanDate(v.date),
        v.startTime,
        v.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [vehicleReservations, dateScope, selectedDate, courseFilter, ledgerSearch]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return usersList;
    return usersList.filter((u) =>
      [u.nombre, u.apellidos, u.email, u.licencia, u.telefono, u.poblacion]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [usersList, searchQuery]);

  const adminStats = useMemo(() => {
    const matchesScope = (d: string) => (dateScope === 'day' && selectedDate ? d === selectedDate : true);
    const activeTeeTimes = teeTimes.filter((r) => r.status !== 'cancelled' && matchesScope(r.date));
    const activePlayers = activeTeeTimes.reduce((sum, r) => sum + r.playersCount, 0);
    const activeAcademy = academyBookings.filter((b) => b.status !== 'cancelled' && matchesScope(b.date));
    const activeStudents = activeAcademy.reduce((sum, b) => sum + b.studentsCount, 0);
    const activeVehicles = vehicleReservations.filter((v) => v.status !== 'cancelled' && matchesScope(v.date));
    return {
      teeTimesCount: activeTeeTimes.length,
      playersCount: activePlayers,
      academyCount: activeAcademy.length,
      studentsCount: activeStudents,
      vehiclesCount: activeVehicles.length,
    };
  }, [teeTimes, academyBookings, vehicleReservations, dateScope, selectedDate]);

  if (!firebaseUser) {
    return (
      <div className="max-w-[920px] mx-auto px-6 lg:px-10 py-16">
        <div className="bg-white border border-[#E2E5EB] rounded-xl p-10 text-center space-y-5">
          <p className="text-xs font-medium text-[#555C68]">
            Área personal de jugadores y recepción
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#111827]">
            Inicia sesión para gestionar tu ficha y tus reservas
          </h1>
          <p className="text-sm text-[#404854] max-w-lg mx-auto">
            Accede con tu cuenta de Google para completar tu licencia federativa, teléfono y
            población, consultar tus salidas y gestionar reservas en Guitiriz y Aguas Santas.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-6 py-3 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors"
            >
              Acceder con Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 space-y-8">
      {/* Distinct Admin Superuser Console Header vs Standard Player Header */}
      {isStaff ? (
        <>
          <div className="bg-[#0B1B3B] text-white rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <p className="text-xs text-white/75 tracking-wide">
                Consola de Superusuario · {profile?.email} · {scopeSummary}
              </p>
              <h1 className="mt-1.5 font-display text-3xl lg:text-4xl font-semibold text-white">
                Panel de Administración y Reservas
              </h1>
            </div>

            <div className="inline-flex flex-wrap items-center p-1 bg-white/10 rounded-lg border border-white/15 self-start lg:self-auto">
              <button
                type="button"
                onClick={() => setSubTab('reservations')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === 'reservations'
                    ? 'bg-white text-[#0B1B3B]'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                Reservas globales
              </button>
              <button
                type="button"
                onClick={() => setSubTab('directory')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === 'directory'
                    ? 'bg-white text-[#0B1B3B]'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                Todos los jugadores ({usersList.length})
              </button>
              <button
                type="button"
                onClick={() => setSubTab('profile')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === 'profile'
                    ? 'bg-white text-[#0B1B3B]'
                    : 'text-white/85 hover:text-white'
                }`}
              >
                Mi ficha
              </button>
            </div>
          </div>

          {/* Superuser Operational Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E2E5EB] rounded-xl p-5">
              <p className="text-xs font-medium text-[#555C68]">Salidas Tee Time activas</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
                {adminStats.teeTimesCount}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-[#404854]">
                {adminStats.playersCount} jugadores inscritos
              </p>
            </div>
            <div className="bg-white border border-[#E2E5EB] rounded-xl p-5">
              <p className="text-xs font-medium text-[#555C68]">Clases de golf activas</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
                {adminStats.academyCount}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-[#404854]">
                {adminStats.studentsCount} alumnos con Víctor López
              </p>
            </div>
            <div className="bg-white border border-[#E2E5EB] rounded-xl p-5">
              <p className="text-xs font-medium text-[#555C68]">Vehículos reservados</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#111827]">
                {adminStats.vehiclesCount}
              </p>
              <p className="mt-1 text-xs text-[#404854]">Buggies y carros eléctricos</p>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('directory')}
              className="bg-white border border-[#E2E5EB] hover:border-[#003087] rounded-xl p-5 text-left transition-colors"
            >
              <p className="text-xs font-medium text-[#555C68]">Jugadores registrados</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#003087]">
                {usersList.length}
              </p>
              <p className="mt-1 text-xs font-medium text-[#003087]">Consultar directorio</p>
            </button>
          </div>
        </>
      ) : isInstructorOnly ? (
        <div className="bg-[#0B1B3B] text-white rounded-xl p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/75 tracking-wide">
              Panel del Profesor · {profile?.email} · Academia Guitiriz
            </p>
            <h1 className="mt-1.5 font-display text-3xl lg:text-4xl font-semibold text-white">
              Panel del Profesor · Todas las clases con Víctor López
            </h1>
          </div>
          <p className="text-xs text-white/80 max-w-sm">
            Consulta todos los alumnos inscritos, marca franjas como completas, edita horarios o
            cancela clases directamente.
          </p>
        </div>
      ) : (
        <div className="pb-6 border-b border-[#E2E5EB]">
          <p className="text-xs font-medium text-[#555C68]">
            Área personal del jugador · {profile?.email}
          </p>
          <h1 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
            Mi Ficha y Mis Reservas
          </h1>
        </div>
      )}

      {/* Personal Player Card: Always visible for normal players; dedicated tab for Admins */}
      {(!isStaff || subTab === 'profile') && (
        <section className="bg-white border border-[#E2E5EB] rounded-xl p-6 lg:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#EBEEF3]">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#111827]">
                Mi ficha de jugador
              </h2>
              <p className="text-xs text-[#555C68]">
                Correo vinculado: <span className="font-mono text-[#111827]">{profile?.email}</span>
                {' · '}Perfil: <span className="font-medium text-[#111827]">{profile?.role}</span>
              </p>
            </div>
          </div>

          {profileSavedMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{profileSavedMsg}</span>
            </div>
          )}
          {profileError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label htmlFor="my-nombre" className="block text-xs font-medium text-[#404854] mb-1">
                Nombre
              </label>
              <input
                id="my-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="my-apellidos" className="block text-xs font-medium text-[#404854] mb-1">
                Apellidos
              </label>
              <input
                id="my-apellidos"
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="my-telefono" className="block text-xs font-medium text-[#404854] mb-1">
                Teléfono
              </label>
              <input
                id="my-telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="600 000 000"
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="my-licencia" className="block text-xs font-medium text-[#404854] mb-1">
                Licencia federativa
              </label>
              <input
                id="my-licencia"
                type="text"
                value={licencia}
                onChange={(e) => setLicencia(e.target.value)}
                placeholder="GA00123456"
                className="w-full px-3 py-2 text-xs font-mono uppercase bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="my-poblacion" className="block text-xs font-medium text-[#404854] mb-1">
                Población
              </label>
              <input
                id="my-poblacion"
                type="text"
                value={poblacion}
                onChange={(e) => setPoblacion(e.target.value)}
                placeholder="Guitiriz / Lugo"
                className="w-full px-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {savingProfile ? 'Guardando...' : 'Guardar ficha'}
              </button>
            </div>
          </form>
        </section>
      )}

      {dataError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{dataError}</span>
        </div>
      )}

      {/* Staff Directory Sub-Tab vs Reservations Ledger */}
      {isStaff && subTab === 'directory' ? (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, correo, licencia, teléfono o población..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>

            <button
              type="button"
              onClick={() => openPlayerModal(null)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo jugador</span>
            </button>
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
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEEF3] text-xs">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-[#555C68]">
                        No se encontraron jugadores con ese criterio.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 px-4 font-medium text-[#111827] whitespace-nowrap">
                          {u.nombre || u.apellidos
                            ? `${u.nombre} ${u.apellidos}`.trim()
                            : 'Sin nombre'}
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
                          <div className="inline-flex items-center gap-1.5">
                            {onBookForPlayer && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onBookForPlayer('tee-times', String(u.id))}
                                  className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md transition-colors"
                                >
                                  Tee Time
                                </button>
                                {canManageAcademy && (
                                  <button
                                    type="button"
                                    onClick={() => onBookForPlayer('academia', String(u.id))}
                                    className="px-2.5 py-1 text-[11px] font-medium text-[#003087] border border-[#003087]/30 rounded-md hover:bg-[#003087]/5 transition-colors"
                                  >
                                    Clase
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onBookForPlayer('flota', String(u.id))}
                                  className="px-2.5 py-1 text-[11px] font-medium text-[#003087] border border-[#003087]/30 rounded-md hover:bg-[#003087]/5 transition-colors"
                                >
                                  Vehículo
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => openPlayerModal(u)}
                              className="px-3 py-1 text-xs font-medium border border-[#E2E5EB] rounded-md hover:bg-[#EBEEF3]"
                            >
                              Editar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : isStaff && subTab === 'profile' ? null : (
        /* Reservations & Reception Ledger */
        <div className="space-y-8">
          {/* Shared Ledger Filter Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white border border-[#E2E5EB] rounded-xl p-4">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-[#7A828E] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                placeholder={
                  isInstructorOnly
                    ? 'Buscar por alumno, teléfono, titular, fecha, nivel o nota...'
                    : 'Buscar por jugador, acompañante, licencia, fecha o vehículo...'
                }
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E5EB] rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Calendar Date Filter (Defaults to Today for Admin) */}
              <div className="flex flex-wrap items-center gap-2">
                <EuropeanDateInput
                  ariaLabel="Seleccionar día en el calendario"
                  value={selectedDate}
                  onChange={(nextDate) => {
                    setSelectedDate(nextDate);
                    setDateScope('day');
                  }}
                  className={`px-3 py-1.5 text-xs font-mono bg-white border rounded-lg text-[#111827] ${
                    dateScope === 'day' ? 'border-[#003087] ring-1 ring-[#003087]/20' : 'border-[#E2E5EB]'
                  }`}
                />
                <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(getTodayIsoDate());
                      setDateScope('day');
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      dateScope === 'day' && selectedDate === getTodayIsoDate()
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateScope('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      dateScope === 'all'
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    Todas las fechas
                  </button>
                </div>
              </div>

              {!isInstructorOnly && (
                <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                  {[
                    { id: 'all', label: 'Todos los campos' },
                    { id: 'guitiriz', label: 'Guitiriz' },
                    { id: 'aguas-santas', label: 'Aguas Santas' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCourseFilter(f.id as 'all' | 'guitiriz' | 'aguas-santas')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        courseFilter === f.id
                          ? 'bg-white text-[#111827] shadow-xs'
                          : 'text-[#555C68] hover:text-[#111827]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tee Times Table */}
          {!isInstructorOnly && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-[#111827]">
                {isStaff ? 'Salidas de Tee Time y Cobros en Recepción' : 'Mis salidas de Tee Time'}
              </h2>
              <span className="text-xs font-mono text-[#555C68]">
                {filteredTeeTimes.length} {filteredTeeTimes.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                      <th className="py-3 px-4">Fecha y Hora</th>
                      <th className="py-3 px-4">Campo</th>
                      <th className="py-3 px-4">Jugadores</th>
                      <th className="py-3 px-4">Partida y Vehículos</th>
                      <th className="py-3 px-4">Cobro en recepción</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEEF3] text-xs">
                    {loadingData ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-[#555C68]">
                          Cargando reservas...
                        </td>
                      </tr>
                    ) : filteredTeeTimes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-[#555C68]">
                          No hay reservas de tee time que coincidan con el filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredTeeTimes.map((r) => {
                        const isCancelled = r.status === 'cancelled';
                        const isBilled = r.mewsStatus === 'BILLED_MEWS';
                        const explicitPlayers = r.playerNames?.trim() || '';
                        const fallbackHolder =
                          `${r.userNombre} ${r.userApellidos}`.trim() || r.userEmail;
                        const sameSlotOthers = teeTimes.filter(
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
                              <span className="font-hours text-[#003087] font-semibold">{r.slotTime}</span>
                            </td>
                            <td className="py-3 px-4 text-[#111827] whitespace-nowrap">
                              {r.courseName} ({r.courseHoles}h)
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
                                  Partida completa (cierra franja)
                                </p>
                              )}
                              {r.assignedVehicles && r.assignedVehicles.length > 0 && (
                                <p className="text-[11px] text-[#003087] mt-0.5">
                                  {r.assignedVehicles
                                    .map(
                                      (v) =>
                                        `${v.code}${v.brand ? ` · ${v.brand}` : ''} (${v.startTime}–${v.endTime})`
                                    )
                                    .join(', ')}
                                </p>
                              )}
                              {r.notes && (
                                <p className="font-sans text-[11px] text-[#555C68] mt-0.5">
                                  {r.notes}
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
                              {isStaff && !canManageCourse(r.courseSlug) ? (
                                <span className="text-[11px] font-medium text-[#555C68]">
                                  Solo consulta
                                </span>
                              ) : (
                                <>
                                  {isStaff && !isCancelled && canToggleComplete && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateTeeTime(r.id, { isComplete: !r.isComplete })
                                      }
                                      className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                    >
                                      {r.isComplete ? 'Reabrir' : 'Marcar completa'}
                                    </button>
                                  )}
                                  {isStaff && !isCancelled && !isBilled && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateTeeTime(r.id, {
                                          status: 'checked_in',
                                          mewsStatus: 'BILLED_MEWS',
                                        })
                                      }
                                      className="px-3 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                    >
                                      Marcar cobrado
                                    </button>
                                  )}
                                  {!isCancelled && (isStaff || !isBilled) && (
                                    <button
                                      type="button"
                                      onClick={() => setMovingTeeTime(r)}
                                      className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                    >
                                      Mover hora
                                    </button>
                                  )}
                                  {isStaff && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingTeeTime(r)}
                                      className="px-3 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {!isCancelled && (
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateTeeTime(r.id, { status: 'cancelled' })}
                                      className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                  {isStaff && isCancelled &&
                                    (confirmDeleteKey === `tt:${r.id}` ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteCancelled('tee-time', r.id)}
                                          className="px-3 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                        >
                                          Sí, borrar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteKey(null)}
                                          className="px-2.5 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteKey(`tt:${r.id}`)}
                                        className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                      >
                                        Borrar
                                      </button>
                                    ))}
                                </>
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

          {/* Academy Bookings Table */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold text-[#111827]">
                {canManageAcademy
                  ? 'Clases de Golf con Víctor López (Guitiriz)'
                  : isStaff
                  ? 'Clases de Golf con Víctor López (Solo consulta · Guitiriz)'
                  : 'Mis clases con Víctor López'}
              </h2>
              <span className="text-xs font-mono text-[#555C68]">
                {filteredAcademyBookings.length}{' '}
                {filteredAcademyBookings.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E5EB] bg-[#F8FAFC] text-[11px] font-semibold text-[#555C68]">
                      <th className="py-3 px-4">Miércoles y Hora</th>
                      <th className="py-3 px-4">Alumno</th>
                      <th className="py-3 px-4">Plazas / Enfoque</th>
                      <th className="py-3 px-4">Cobro en recepción</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEEF3] text-xs">
                    {loadingData ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-[#555C68]">
                          Cargando clases...
                        </td>
                      </tr>
                    ) : filteredAcademyBookings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-[#555C68]">
                          No hay clases registradas que coincidan con el filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredAcademyBookings.map((b) => {
                        const isCancelled = b.status === 'cancelled';
                        const isBilled = b.mewsStatus === 'BILLED_MEWS';
                        const sameSlotOthers = academyBookings.filter(
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
                              <span className="font-semibold text-[#111827]">
                                {formatEuropeanDate(b.date)}
                              </span>
                              <span className="mx-1.5 text-[#7A828E]">·</span>
                              <span className="font-hours text-[#003087] font-semibold">{b.slotTime}</span>
                            </td>
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#111827]">
                                {b.studentName ||
                                  `${b.userNombre} ${b.userApellidos}`.trim() ||
                                  b.userEmail}
                              </p>
                              <p className="font-mono text-[11px] text-[#555C68]">
                                {b.studentPhone || b.userTelefono || b.userEmail}
                                {b.userLicencia ? ` · ${b.userLicencia}` : ''}
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
                                  Clase completa (cierra franja)
                                </p>
                              )}
                              {b.notes && (
                                <p className="text-[11px] text-[#555C68] mt-0.5">{b.notes}</p>
                              )}
                            </td>
                            <td
                              className={`py-3 px-4 font-medium ${
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
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                              {isStaff && !canManageAcademy ? (
                                <span className="text-[11px] font-medium text-[#555C68]">
                                  Solo consulta
                                </span>
                              ) : (
                                <>
                                  {canManageAcademy && !isCancelled && canToggleComplete && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateAcademy(b.id, { isComplete: !b.isComplete })
                                      }
                                      className="px-3 py-1 text-xs font-medium text-[#003087] border border-[#003087]/30 hover:bg-[#003087]/5 rounded-md"
                                    >
                                      {b.isComplete ? 'Reabrir' : 'Marcar completa'}
                                    </button>
                                  )}
                                  {canManageAcademy && !isCancelled && !isBilled && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateAcademy(b.id, {
                                          status: 'completed',
                                          mewsStatus: 'BILLED_MEWS',
                                        })
                                      }
                                      className="px-3 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                    >
                                      Marcar cobrado
                                    </button>
                                  )}
                                  {canManageAcademy && (
                                    <button
                                      type="button"
                                      onClick={() => setEditingAcademy(b)}
                                      className="px-3 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {!isCancelled && (
                                    confirmCancelAcademyId === b.id ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateAcademy(b.id, { status: 'cancelled' })
                                          }
                                          className="px-3 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                        >
                                          Sí, cancelar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmCancelAcademyId(null)}
                                          className="px-2.5 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                        >
                                          No
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmCancelAcademyId(b.id)}
                                        className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                      >
                                        Cancelar
                                      </button>
                                    )
                                  )}
                                  {canManageAcademy && isCancelled &&
                                    (confirmDeleteKey === `ac:${b.id}` ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteCancelled('academy', b.id)}
                                          className="px-3 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                        >
                                          Sí, borrar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteKey(null)}
                                          className="px-2.5 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteKey(`ac:${b.id}`)}
                                        className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                      >
                                        Borrar
                                      </button>
                                    ))}
                                </>
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

          {/* Vehicle Reservations Table */}
          {!isInstructorOnly && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-2xl font-semibold text-[#111827]">
                  {isStaff
                    ? 'Reservas de Vehículos (Buggies y Carros)'
                    : 'Mis reservas de vehículos'}
                </h2>
                <span className="text-xs font-mono text-[#555C68]">
                  {filteredVehicleReservations.length}{' '}
                  {filteredVehicleReservations.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <EuropeanDateInput
                  ariaLabel="Filtrar reservas de vehículos por calendario"
                  value={selectedDate}
                  onChange={(nextDate) => {
                    setSelectedDate(nextDate);
                    setDateScope('day');
                  }}
                  className={`px-3 py-1.5 text-xs font-mono bg-white border rounded-lg text-[#111827] ${
                    dateScope === 'day'
                      ? 'border-[#003087] ring-1 ring-[#003087]/20'
                      : 'border-[#E2E5EB]'
                  }`}
                />
                <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDate(getTodayIsoDate());
                      setDateScope('day');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      dateScope === 'day' && selectedDate === getTodayIsoDate()
                        ? 'bg-white text-[#111827] shadow-xs'
                        : 'text-[#555C68] hover:text-[#111827]'
                    }`}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateScope('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      dateScope === 'all'
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
                      <th className="py-3 px-4">Fecha y Horario</th>
                      <th className="py-3 px-4">Vehículo y Campo</th>
                      <th className="py-3 px-4">Titular / Jugador</th>
                      <th className="py-3 px-4">Estado y Notas</th>
                      <th className="py-3 px-4">Cobro en recepción</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEEF3] text-xs">
                    {loadingData ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-[#555C68]">
                          Cargando reservas de vehículos...
                        </td>
                      </tr>
                    ) : filteredVehicleReservations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-[#555C68]">
                          No hay reservas de vehículos que coincidan con el filtro.
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
                              className={`py-3 px-4 font-medium ${
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
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                              {isStaff && !canManageCourse(v.courseSlug) ? (
                                <span className="text-[11px] font-medium text-[#555C68]">
                                  Solo consulta
                                </span>
                              ) : (
                                <>
                                  {isStaff && !isCancelled && !isBilled && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateVehicleReservation(v.id, {
                                          mewsStatus: 'BILLED_MEWS',
                                        })
                                      }
                                      className="px-3 py-1 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-md"
                                    >
                                      Marcar cobrado
                                    </button>
                                  )}
                                  {isStaff && (
                                    <button
                                      type="button"
                                      onClick={() => openVehicleResEditModal(v)}
                                      className="px-3 py-1 text-xs font-medium text-[#111827] border border-[#E2E5EB] hover:bg-[#EBEEF3] rounded-md"
                                    >
                                      Editar
                                    </button>
                                  )}
                                  {!isCancelled && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleUpdateVehicleReservation(v.id, { status: 'cancelled' })
                                      }
                                      className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                  {isStaff && isCancelled &&
                                    (confirmDeleteKey === `vr:${v.id}` ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteCancelled('vehicle', v.id)}
                                          className="px-3 py-1 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-red-800 rounded-md"
                                        >
                                          Sí, borrar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteKey(null)}
                                          className="px-2.5 py-1 text-xs text-[#555C68] border border-[#E2E5EB] rounded-md"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteKey(`vr:${v.id}`)}
                                        className="px-3 py-1 text-xs font-medium text-[#B91C1C] border border-red-200 hover:bg-red-50 rounded-md"
                                      >
                                        Borrar
                                      </button>
                                    ))}
                                </>
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
        </div>
      )}

      {/* Modal for Editing Tee Time Reservation (Staff Only) */}
      <TeeTimeEditModal
        reservation={editingTeeTime}
        users={usersList}
        authFetch={authFetch}
        onClose={() => setEditingTeeTime(null)}
        onSaved={loadWorkspaceData}
      />

      {/* Modal for Moving Tee Time Reservation to Available Slot */}
      <TeeTimeMoveModal
        reservation={movingTeeTime}
        isStaff={isStaff}
        authFetch={authFetch}
        onClose={() => setMovingTeeTime(null)}
        onMoved={async () => {
          await loadWorkspaceData();
        }}
      />

      {/* Modal for Editing Academy Booking (Staff & Instructor) */}
      <AcademyEditModal
        booking={editingAcademy}
        users={isStaff ? usersList : []}
        authFetch={authFetch}
        onClose={() => setEditingAcademy(null)}
        onSaved={loadWorkspaceData}
      />

      {/* Modal for Editing Vehicle Reservation (Staff Only) */}
      {editingVehicleRes && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Editar reserva de vehículo"
        >
          <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#EBEEF3]">
              <div>
                <h3 className="font-display text-2xl font-semibold text-[#111827]">
                  Editar vehículo #{editingVehicleRes.id}
                </h3>
                <p className="text-xs text-[#555C68]">
                  {editingVehicleRes.vehicleCode}
                  {editingVehicleRes.vehicleBrand ? ` · ${editingVehicleRes.vehicleBrand}` : ''} ·{' '}
                  {editingVehicleRes.courseName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingVehicleRes(null)}
                className="p-1.5 rounded-lg text-[#555C68] hover:bg-[#EBEEF3]"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {vehicleResModalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {vehicleResModalError}
              </div>
            )}

            <form onSubmit={handleSaveVehicleResModal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">
                  Jugador titular
                </label>
                <select
                  value={vrUserId}
                  onChange={(e) => setVrUserId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {`${u.nombre} ${u.apellidos}`.trim() || u.email} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">
                  Vehículo asignado
                </label>
                <select
                  value={vrVehicleId}
                  onChange={(e) => setVrVehicleId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
                >
                  {fleetVehicles
                    .filter((fv) => canManageCourse(fv.courseSlug))
                    .map((fv) => (
                    <option key={fv.id} value={String(fv.id)}>
                      {fv.code}
                      {fv.brand ? ` · ${fv.brand}` : ''} · {fv.courseName} (
                      {fv.type === 'buggy' ? 'Buggy' : 'Carro eléctrico'})
                      {fv.status === 'maintenance' ? ' [Mantenimiento]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Fecha</label>
                  <EuropeanDateInput
                    ariaLabel="Fecha de reserva de vehículo"
                    required
                    value={vrDate}
                    onChange={(nextDate) => setVrDate(nextDate)}
                    className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">
                    Hora inicio
                  </label>
                  <select
                    value={vrStartTime}
                    onChange={(e) => setVrStartTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-hours border border-[#E2E5EB] rounded-lg bg-white"
                  >
                    {TEE_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Estado</label>
                  <select
                    value={vrStatus}
                    onChange={(e) => setVrStatus(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
                  >
                    <option value="reserved">Reservado</option>
                    <option value="in_use">En uso</option>
                    <option value="returned">Devuelto</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">Notas</label>
                <input
                  type="text"
                  value={vrNotes}
                  onChange={(e) => setVrNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingVehicleRes(null)}
                  className="px-4 py-2 text-xs font-medium text-[#555C68] hover:text-[#111827]"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={savingVehicleRes}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg"
                >
                  {savingVehicleRes ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Creating / Editing Player Record (Staff Only) */}
      {playerModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ficha de jugador"
        >
          <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#EBEEF3]">
              <h3 className="font-display text-2xl font-semibold text-[#111827]">
                {editingPlayer ? 'Editar jugador' : 'Alta de nuevo jugador'}
              </h3>
              <button
                type="button"
                onClick={() => setPlayerModalOpen(false)}
                className="p-1.5 rounded-lg text-[#555C68] hover:bg-[#EBEEF3]"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {playerFormError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                {playerFormError}
              </div>
            )}

            <form onSubmit={handleSavePlayerRecord} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    value={pNombre}
                    onChange={(e) => setPNombre(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    value={pApellidos}
                    onChange={(e) => setPApellidos(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#404854] mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={pEmail}
                  onChange={(e) => setPEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#E2E5EB] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={pTelefono}
                    onChange={(e) => setPTelefono(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-[#E2E5EB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">
                    Licencia federativa
                  </label>
                  <input
                    type="text"
                    value={pLicencia}
                    onChange={(e) => setPLicencia(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono uppercase border border-[#E2E5EB] rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Población</label>
                  <input
                    type="text"
                    value={pPoblacion}
                    onChange={(e) => setPPoblacion(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#404854] mb-1">Rol</label>
                  <select
                    value={pRole}
                    onChange={(e) => setPRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
                  >
                    <option value="player">Jugador</option>
                    <option value="instructor">Profesor (Academia)</option>
                    <option value="reception">Recepción Hotel</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPlayerModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#555C68] hover:text-[#111827]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPlayer}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg"
                >
                  {savingPlayer ? 'Guardando...' : 'Guardar jugador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
