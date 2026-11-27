import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { TeeTimeReservationRow, UserProfile } from '../types/golf';
import { TEE_TIME_SLOTS } from '../lib/golf-schedule';
import { EuropeanDateInput } from './EuropeanDateInput';

interface TeeTimeEditModalProps {
  reservation: TeeTimeReservationRow | null;
  users: UserProfile[];
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export const TeeTimeEditModal: React.FC<TeeTimeEditModalProps> = ({
  reservation,
  users,
  authFetch,
  onClose,
  onSaved,
}) => {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState('');
  const [slotTime, setSlotTime] = useState('');
  const [holes, setHoles] = useState<9 | 18>(18);
  const [playersCount, setPlayersCount] = useState(1);
  const [playerEntries, setPlayerEntries] = useState<[string, string, string, string]>([
    '',
    '',
    '',
    '',
  ]);
  const [isComplete, setIsComplete] = useState(false);
  const [mewsStatus, setMewsStatus] = useState('PENDING_RECEPTION');
  const [status, setStatus] = useState('confirmed');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reservation) return;
    setUserId(String(reservation.userId));
    setDate(reservation.date);
    setSlotTime(reservation.slotTime);
    setHoles(reservation.holes === 9 ? 9 : 18);
    setPlayersCount(reservation.playersCount);
    const parsed = (reservation.playerNames || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    setPlayerEntries([
      parsed[0] || '',
      parsed[1] || '',
      parsed[2] || '',
      parsed.length > 4 ? parsed.slice(3).join(', ') : parsed[3] || '',
    ]);
    setIsComplete(Boolean(reservation.isComplete));
    setMewsStatus(reservation.mewsStatus || 'PENDING_RECEPTION');
    setStatus(reservation.status || 'confirmed');
    setNotes(reservation.notes || '');
    setError(null);
  }, [reservation]);

  if (!reservation) return null;

  const selectedTitular = users.find((u) => String(u.id) === userId);
  const titularPhone = selectedTitular?.telefono ?? reservation.userTelefono;
  const titularLicense = selectedTitular?.licencia ?? reservation.userLicencia;
  const titularEmail = selectedTitular?.email ?? reservation.userEmail;
  const assignedVehicles = (reservation.assignedVehicles || []).filter(
    (v) => v.status !== 'cancelled' || reservation.status === 'cancelled'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const serializedPlayerNames = playerEntries
        .slice(0, Number(playersCount))
        .map((p) => p.trim())
        .filter(Boolean)
        .join(', ');
      const res = await authFetch(`/api/tee-times/${reservation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          userId: Number(userId),
          date,
          slotTime,
          holes: Number(holes),
          playersCount: Number(playersCount),
          playerNames: serializedPlayerNames,
          isComplete,
          mewsStatus: status === 'cancelled' ? 'CANCELLED' : mewsStatus,
          status,
          notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo guardar la modificación.');
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar reserva de Tee Time"
    >
      <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#EBEEF3]">
          <div>
            <h3 className="font-display text-2xl font-semibold text-[#111827]">
              Editar Tee Time #{reservation.id}
            </h3>
            <p className="text-xs text-[#555C68]">
              {reservation.courseName} ({reservation.courseHoles} hoyos)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#555C68] hover:bg-[#EBEEF3]"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-[11px] text-[#404854] space-y-1">
          <p className="font-mono">
            Titular: {titularEmail} · Tel: {titularPhone || '—'} · Lic: {titularLicense || '—'}
          </p>
          <p className="font-mono">
            Vehículos asignados:{' '}
            {assignedVehicles.length > 0
              ? assignedVehicles
                  .map((v) => `${v.code}${v.brand ? ` · ${v.brand}` : ''} (${v.startTime}–${v.endTime})`)
                  .join(', ')
              : `${reservation.buggiesRequested} bug. · ${reservation.trolleysRequested} car.`}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#404854] mb-1">
              Jugador titular
            </label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
            >
              {users.length === 0 ? (
                <option value={String(reservation.userId)}>
                  {`${reservation.userNombre} ${reservation.userApellidos}`.trim() ||
                    reservation.userEmail}
                </option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {`${u.nombre} ${u.apellidos}`.trim() || u.email} ({u.email})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Fecha</label>
              <EuropeanDateInput
                ariaLabel="Fecha de salida"
                required
                value={date}
                onChange={(nextDate) => setDate(nextDate)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Hora de salida
              </label>
              <select
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-hours border border-[#E2E5EB] rounded-lg bg-white"
              >
                {TEE_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Recorrido
              </label>
              <select
                value={holes}
                onChange={(e) => setHoles(Number(e.target.value) === 9 ? 9 : 18)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                <option value={9}>9 hoyos (sin cruce · 2 h)</option>
                <option value={18}>18 hoyos (con cruce si es 9h · 4 h)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Jugadores
              </label>
              <select
                value={playersCount}
                onChange={(e) => setPlayersCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'jugador' : 'jugadores'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                <option value="confirmed">Confirmada</option>
                <option value="checked_in">Check-in / Cobrado</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Cobro</label>
              <select
                value={status === 'cancelled' ? 'CANCELLED' : mewsStatus}
                disabled={status === 'cancelled'}
                onChange={(e) => setMewsStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white disabled:opacity-60"
              >
                <option value="PENDING_RECEPTION">Pendiente</option>
                <option value="BILLED_MEWS">Pagado</option>
                {status === 'cancelled' && <option value="CANCELLED">Cancelado</option>}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#404854]">
                Jugadores / licencias (opcional)
              </span>
              <span className="text-[11px] font-mono text-[#555C68]">
                {playersCount} {Number(playersCount) === 1 ? 'jugador' : 'jugadores'}
              </span>
            </div>
            <div className="space-y-2">
              {Array.from({ length: Number(playersCount) }, (_, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg space-y-1"
                >
                  <label
                    htmlFor={`edit-player-name-${idx + 1}`}
                    className="flex items-center justify-between text-[11px] font-medium text-[#404854]"
                  >
                    <span>Jugador {idx + 1}</span>
                    <span className="text-[#7A828E] font-normal">Opcional</span>
                  </label>
                  <input
                    id={`edit-player-name-${idx + 1}`}
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
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#E2E5EB] rounded-md text-[#111827]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#404854] mb-1">Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isComplete}
              onChange={(e) => setIsComplete(e.target.checked)}
              className="mt-0.5 rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
            />
            <span className="text-xs text-[#111827]">
              <strong className="block font-semibold">Marcar partida como completa</strong>
              <span className="text-[11px] text-[#555C68]">
                Cierra la franja horaria aunque haya menos de 4 jugadores inscritos.
              </span>
            </span>
          </label>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#555C68] hover:text-[#111827]"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-60 rounded-lg"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
