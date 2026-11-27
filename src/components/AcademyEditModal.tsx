import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AcademyBookingRow, UserProfile } from '../types/golf';
import { ACADEMY_ALL_SLOTS } from '../lib/golf-schedule';
import { EuropeanDateInput } from './EuropeanDateInput';

interface AcademyEditModalProps {
  booking: AcademyBookingRow | null;
  users: UserProfile[];
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export const AcademyEditModal: React.FC<AcademyEditModalProps> = ({
  booking,
  users,
  authFetch,
  onClose,
  onSaved,
}) => {
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState('');
  const [slotTime, setSlotTime] = useState('');
  const [studentsCount, setStudentsCount] = useState(1);
  const [studentName, setStudentName] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [level, setLevel] = useState('Perfeccionamiento');
  const [status, setStatus] = useState('confirmed');
  const [mewsStatus, setMewsStatus] = useState('PENDING_RECEPTION');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!booking) return;
    setUserId(String(booking.userId));
    setDate(booking.date);
    setSlotTime(booking.slotTime);
    setStudentsCount(booking.studentsCount);
    setStudentName(
      booking.studentName ||
        `${booking.userNombre} ${booking.userApellidos}`.trim() ||
        booking.userEmail
    );
    setStudentPhone(booking.studentPhone || '');
    setIsComplete(Boolean(booking.isComplete));
    setLevel(booking.level || 'Perfeccionamiento');
    setStatus(booking.status || 'confirmed');
    setMewsStatus(booking.mewsStatus || 'PENDING_RECEPTION');
    setNotes(booking.notes || '');
    setError(null);
  }, [booking]);

  if (!booking) return null;

  const titularLabel =
    `${booking.userNombre} ${booking.userApellidos}`.trim() || booking.userEmail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setError('Debes indicar al menos un nombre de alumno.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/academy/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(users.length > 0 && userId ? { userId: Number(userId) } : {}),
          date,
          slotTime,
          studentsCount: Number(studentsCount),
          studentName: studentName.trim(),
          studentPhone: studentPhone.trim(),
          isComplete,
          level,
          status,
          mewsStatus: status === 'cancelled' ? 'CANCELLED' : mewsStatus,
          notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo guardar la modificación de la clase.');
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
      aria-label="Editar reserva de clase"
    >
      <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#EBEEF3]">
          <div>
            <h3 className="font-display text-2xl font-semibold text-[#111827]">
              Editar clase #{booking.id}
            </h3>
            <p className="text-xs text-[#555C68]">
              Academia Víctor López · Guitiriz (solo miércoles)
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

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {users.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Usuario titular de la reserva
              </label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {`${u.nombre} ${u.apellidos}`.trim() || u.email} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-xs text-[#404854]">
              Titular: <span className="font-semibold text-[#111827]">{titularLabel}</span> (
              <span className="font-mono">{booking.userEmail}</span>)
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Nombre del alumno *
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Nombre del alumno o alumnos"
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Teléfono de contacto (opcional)
              </label>
              <input
                type="tel"
                value={studentPhone}
                onChange={(e) => setStudentPhone(e.target.value)}
                placeholder="600 000 000"
                className="w-full px-3 py-2 text-xs font-mono border border-[#E2E5EB] rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">
                Fecha (miércoles)
              </label>
              <EuropeanDateInput
                ariaLabel="Fecha de clase (miércoles)"
                required
                value={date}
                onChange={(nextDate) => setDate(nextDate)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Horario</label>
              <select
                value={slotTime}
                onChange={(e) => setSlotTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-hours border border-[#E2E5EB] rounded-lg bg-white"
              >
                {ACADEMY_ALL_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Alumnos</label>
              <select
                value={studentsCount}
                onChange={(e) => setStudentsCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                <option value="confirmed">Confirmada</option>
                <option value="completed">Completada / Cobrada</option>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#404854] mb-1">Enfoque</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#E2E5EB] rounded-lg bg-white"
              >
                <option value="Iniciación">Iniciación</option>
                <option value="Perfeccionamiento">Perfeccionamiento</option>
                <option value="Juego corto y putt">Juego corto, approach y putt</option>
                <option value="Juego corto / Putting">Juego corto / Putting</option>
                <option value="Salida al campo">Salida al campo</option>
              </select>
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
          </div>

          <label className="flex items-start gap-2.5 p-3 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isComplete}
              onChange={(e) => setIsComplete(e.target.checked)}
              className="mt-0.5 rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
            />
            <span className="text-xs text-[#111827]">
              <strong className="block font-semibold">Marcar clase como completa</strong>
              <span className="text-[11px] text-[#555C68]">
                Cierra la franja horaria aunque solo haya 1 alumno inscrito.
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
