import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, X } from 'lucide-react';
import type {
  CourseAvailabilityResponse,
  TeeTimeReservationRow,
  TeeTimeSlotAvailability,
} from '../types/golf';
import { formatEuropeanDate, timeToMinutes } from '../lib/golf-schedule';
import { EuropeanDateInput } from './EuropeanDateInput';

interface TeeTimeMoveModalProps {
  reservation: TeeTimeReservationRow | null;
  isStaff: boolean;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onMoved: (newDate: string, newSlotTime: string) => Promise<void> | void;
}

export const TeeTimeMoveModal: React.FC<TeeTimeMoveModalProps> = ({
  reservation,
  isStaff,
  authFetch,
  onClose,
  onMoved,
}) => {
  const [targetDate, setTargetDate] = useState('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [availability, setAvailability] = useState<CourseAvailabilityResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'morning' | 'afternoon'>('all');
  const [onlyMovable, setOnlyMovable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reservation) return;
    setTargetDate(reservation.date);
    setSelectedSlotTime('');
    setSessionFilter('all');
    setOnlyMovable(true);
    setError(null);
  }, [reservation]);

  useEffect(() => {
    if (!reservation || !targetDate) return;
    let cancelled = false;
    setLoadingSlots(true);
    setError(null);

    fetch(
      `/api/availability?course=${encodeURIComponent(reservation.courseSlug)}&date=${encodeURIComponent(targetDate)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'No se pudo consultar la disponibilidad.');
        }
        return res.json();
      })
      .then((payload: CourseAvailabilityResponse) => {
        if (!cancelled) {
          setAvailability(payload);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar horarios disponibles');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reservation, targetDate]);

  const evaluatedSlots = useMemo(() => {
    if (!reservation || !availability) return [];
    const neededPlayers = reservation.playersCount;
    const neededHoles = reservation.holes || 18;
    const neededBuggies = reservation.buggiesRequested;
    const neededTrolleys = reservation.trolleysRequested;
    const isSameDay = targetDate === reservation.date;

    return availability.slots.map((slot) => {
      const isCurrent = isSameDay && slot.slotTime === reservation.slotTime;
      const availBuggies =
        neededHoles === 9 ? slot.availableBuggies9 ?? slot.availableBuggies : slot.availableBuggies;
      const availTrolleys =
        neededHoles === 9
          ? slot.availableTrolleys9 ?? slot.availableTrolleys
          : slot.availableTrolleys;

      let reason: string | null = null;
      if (isCurrent) {
        reason = 'Hora actual';
      } else if (slot.isCrossoverBlocked) {
        reason = slot.crossoverSourceSlot
          ? `Cruce ${slot.crossoverSourceSlot}`
          : 'Bloqueado por cruce';
      } else if (slot.isClosedComplete) {
        reason = 'Partida cerrada';
      } else if (slot.remainingPlayers < neededPlayers) {
        reason =
          slot.remainingPlayers === 0
            ? 'Completo'
            : `Solo ${slot.remainingPlayers} ${slot.remainingPlayers === 1 ? 'plaza' : 'plazas'}`;
      } else if (neededHoles === 18 && slot.canBook18Holes === false) {
        reason = slot.outgoingCrossoverSlot
          ? `Solo 9h (cruce ${slot.outgoingCrossoverSlot})`
          : 'Solo 9 hoyos';
      } else if (availBuggies < neededBuggies) {
        reason = `Sin buggies (${availBuggies}/${neededBuggies})`;
      } else if (availTrolleys < neededTrolleys) {
        reason = `Sin carros (${availTrolleys}/${neededTrolleys})`;
      }

      return {
        slot,
        isCurrent,
        canMove: reason === null,
        reason,
      };
    });
  }, [reservation, availability, targetDate]);

  const visibleSlots = useMemo(() => {
    return evaluatedSlots.filter(({ slot, isCurrent, canMove }) => {
      const mins = timeToMinutes(slot.slotTime);
      if (sessionFilter === 'morning' && mins >= 14 * 60) return false;
      if (sessionFilter === 'afternoon' && mins < 14 * 60) return false;
      if (onlyMovable && !canMove && !isCurrent) return false;
      return true;
    });
  }, [evaluatedSlots, sessionFilter, onlyMovable]);

  if (!reservation) return null;

  const movableCount = evaluatedSlots.filter((s) => s.canMove).length;
  const playersDisplay =
    reservation.playerNames?.trim() ||
    `${reservation.userNombre} ${reservation.userApellidos}`.trim() ||
    reservation.userEmail;

  const handleConfirmMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotTime) return;
    setSaving(true);
    setError(null);
    try {
      const payload: { slotTime: string; date?: string } = {
        slotTime: selectedSlotTime,
      };
      if (isStaff && targetDate !== reservation.date) {
        payload.date = targetDate;
      }
      const res = await authFetch(`/api/tee-times/${reservation.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo mover la reserva de hora.');
      }
      await onMoved(targetDate, selectedSlotTime);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al mover la reserva');
    } finally {
      setSaving(false);
    }
  };

  const renderSlotLabel = (entry: {
    slot: TeeTimeSlotAvailability;
    isCurrent: boolean;
    canMove: boolean;
    reason: string | null;
  }) => {
    if (entry.isCurrent) return 'Actual';
    if (entry.canMove) return `${entry.slot.remainingPlayers}/4 libres`;
    return entry.reason || 'Sin hueco';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mover reserva de hora"
    >
      <div className="bg-white border border-[#E2E5EB] rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#EBEEF3]">
          <div>
            <h3 className="font-display text-2xl font-semibold text-[#111827]">
              Mover reserva #{reservation.id} de hora
            </h3>
            <p className="text-xs text-[#555C68] mt-0.5">
              {reservation.courseName} · Actual:{' '}
              <span className="font-mono font-semibold text-[#111827]">
                {formatEuropeanDate(reservation.date)}
              </span>{' '}
              a las{' '}
              <span className="font-hours font-semibold text-[#003087]">{reservation.slotTime}</span>
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

        <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-xs text-[#404854] flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-[#111827]">{playersDisplay}</p>
            <p className="font-mono text-[11px] text-[#555C68] mt-0.5">
              {reservation.holes || 18} hoyos · {reservation.playersCount}{' '}
              {reservation.playersCount === 1 ? 'jugador' : 'jugadores'} ·{' '}
              {reservation.buggiesRequested} bug. · {reservation.trolleysRequested} car.
            </p>
          </div>
          {isStaff ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#555C68]">Fecha destino:</span>
              <EuropeanDateInput
                ariaLabel="Fecha destino para mover la reserva"
                value={targetDate}
                onChange={(nextDate) => {
                  setTargetDate(nextDate);
                  setSelectedSlotTime('');
                }}
                className="px-2.5 py-1.5 text-xs font-mono bg-white border border-[#E2E5EB] rounded-lg text-[#111827]"
              />
            </div>
          ) : (
            <span className="text-[11px] font-mono text-[#555C68]">
              Misma fecha ({formatEuropeanDate(reservation.date)})
            </span>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center p-1 bg-[#EBEEF3] rounded-lg">
            {[
              { id: 'all', label: 'Todo el día' },
              { id: 'morning', label: 'Mañana' },
              { id: 'afternoon', label: 'Tarde' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSessionFilter(item.id as 'all' | 'morning' | 'afternoon')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sessionFilter === item.id
                    ? 'bg-white text-[#111827] shadow-xs'
                    : 'text-[#555C68] hover:text-[#111827]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#404854] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyMovable}
              onChange={(e) => setOnlyMovable(e.target.checked)}
              className="rounded border-[#C8CCC4] text-[#003087] focus:ring-[#003087]"
            />
            <span>Solo franjas con hueco ({movableCount})</span>
          </label>
        </div>

        <form onSubmit={handleConfirmMove} className="space-y-4">
          {loadingSlots ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-16 rounded-lg bg-[#F4F6F9] border border-[#E2E5EB] animate-pulse"
                />
              ))}
            </div>
          ) : visibleSlots.length === 0 ? (
            <div className="p-6 bg-[#F8FAFC] border border-[#E2E5EB] rounded-lg text-center text-xs text-[#555C68]">
              No hay franjas horarias con hueco suficiente para esta partida en el filtro actual.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {visibleSlots.map((entry) => {
                const { slot, isCurrent, canMove } = entry;
                const isSelected = selectedSlotTime === slot.slotTime;
                return (
                  <button
                    key={slot.slotTime}
                    type="button"
                    disabled={!canMove}
                    onClick={() => setSelectedSlotTime(slot.slotTime)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'bg-[#003087] text-white border-[#003087]'
                        : isCurrent
                        ? 'bg-[#EEF1F6] text-[#404854] border-[#C8CCC4] cursor-not-allowed'
                        : canMove
                        ? 'bg-white text-[#111827] border-[#E2E5EB] hover:border-[#003087]'
                        : 'bg-[#F8FAFC] text-[#9CA3AF] border-[#E2E5EB] cursor-not-allowed opacity-75'
                    }`}
                  >
                    <p className="font-hours text-sm font-semibold tabular-nums">{slot.slotTime}</p>
                    <p
                      className={`mt-0.5 text-[10px] font-medium truncate ${
                        isSelected
                          ? 'text-white/90'
                          : isCurrent
                          ? 'text-[#003087]'
                          : canMove
                          ? 'text-[#15803D]'
                          : 'text-[#9CA3AF]'
                      }`}
                    >
                      {renderSlotLabel(entry)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-3 border-t border-[#EBEEF3] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#555C68] font-mono">
              {selectedSlotTime ? (
                <span className="inline-flex items-center gap-1.5 text-[#111827] font-semibold">
                  <span>{reservation.slotTime}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#003087]" />
                  <span className="text-[#003087]">
                    {selectedSlotTime} ({formatEuropeanDate(targetDate)})
                  </span>
                </span>
              ) : (
                <span>Selecciona una nueva hora disponible</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#555C68] hover:text-[#111827]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!selectedSlotTime || saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] disabled:opacity-50 rounded-lg"
              >
                {saving
                  ? 'Moviendo...'
                  : selectedSlotTime
                  ? `Mover a las ${selectedSlotTime}`
                  : 'Confirmar cambio de hora'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
