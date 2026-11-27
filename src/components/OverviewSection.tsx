import React, { useEffect, useState } from 'react';
import { ArrowRight, Calendar, Clock, MapPin } from 'lucide-react';
import { ResilientImage } from './ResilientImage';
import type { Course, CourseAvailabilityResponse } from '../types/golf';
import {
  ROUND_9_HOLES_DURATION_MINUTES,
  VEHICLE_ROUND_DURATION_MINUTES,
  getCourseCurrentMinutes,
  getTodayIsoDate,
  timeToMinutes,
} from '../lib/golf-schedule';

export type ActiveTab = 'inicio' | 'tee-times' | 'academia' | 'flota' | 'jugadores';

interface OverviewSectionProps {
  courses: Course[];
  onNavigate: (tab: ActiveTab, courseSlug?: string) => void;
}

function getCoursePlayerStats(summary: CourseAvailabilityResponse | null, nowMinutes: number) {
  if (!summary) {
    return { onCourseNow: 0, totalToday: 0 };
  }
  const duration18 = Math.max(
    summary.course.roundDurationMinutes || 0,
    VEHICLE_ROUND_DURATION_MINUTES
  );
  const duration9 = ROUND_9_HOLES_DURATION_MINUTES;
  let onCourseNow = 0;
  let totalToday = 0;
  for (const slot of summary.slots) {
    const booked = slot.bookedPlayers || 0;
    if (booked <= 0) continue;
    totalToday += booked;
    const slotMins = timeToMinutes(slot.slotTime);
    if (nowMinutes < 0 || slotMins < 0 || nowMinutes < slotMins) continue;

    if (slot.bookedPlayers9 !== undefined || slot.bookedPlayers18 !== undefined) {
      const p9 = slot.bookedPlayers9 || 0;
      const p18 = slot.bookedPlayers18 || 0;
      if (p9 > 0 && nowMinutes < slotMins + duration9) {
        onCourseNow += p9;
      }
      if (p18 > 0 && nowMinutes < slotMins + duration18) {
        onCourseNow += p18;
      }
    } else if (nowMinutes < slotMins + duration18) {
      onCourseNow += booked;
    }
  }
  return { onCourseNow, totalToday };
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({ courses, onNavigate }) => {
  const [guitirizSummary, setGuitirizSummary] = useState<CourseAvailabilityResponse | null>(null);
  const [aguasSummary, setAguasSummary] = useState<CourseAvailabilityResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [nowMinutes, setNowMinutes] = useState<number>(() => getCourseCurrentMinutes());

  useEffect(() => {
    let cancelled = false;
    let isInitial = true;

    async function load() {
      const today = getTodayIsoDate();
      if (isInitial) {
        setLoadingSummary(true);
      }
      try {
        const [gRes, aRes] = await Promise.all([
          fetch(`/api/availability?course=guitiriz&date=${today}`),
          fetch(`/api/availability?course=aguas-santas&date=${today}`),
        ]);
        if (!cancelled) {
          if (gRes.ok) setGuitirizSummary(await gRes.json());
          if (aRes.ok) setAguasSummary(await aRes.json());
          setNowMinutes(getCourseCurrentMinutes());
        }
      } catch (err) {
        console.error('Error loading course summaries:', err);
      } finally {
        if (!cancelled && isInitial) {
          setLoadingSummary(false);
          isInitial = false;
        }
      }
    }

    load();
    const intervalId = window.setInterval(load, 30_000);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        load();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, []);

  const guitiriz = courses.find((c) => c.slug === 'guitiriz');
  const aguasSantas = courses.find((c) => c.slug === 'aguas-santas');

  const countOpenSlots = (summary: CourseAvailabilityResponse | null) =>
    summary ? summary.slots.filter((s) => s.remainingPlayers > 0).length : 64;

  const guitirizStats = getCoursePlayerStats(guitirizSummary, nowMinutes);
  const aguasStats = getCoursePlayerStats(aguasSummary, nowMinutes);

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Split */}
      <section className="border-b border-[#E2E5EB] bg-white">
        <div className="max-w-[1320px] mx-auto px-6 lg:px-10 py-10 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div className="space-y-6">
                <p className="text-xs font-medium tracking-wide text-[#555C68]">
                  Lugo, Galicia · Guitiriz 9 hoyos y Aguas Santas 18 hoyos
                </p>
                <h1
                  className="font-display text-[clamp(2.4rem,4.2vw,3.85rem)] leading-[1.06] font-semibold tracking-tight text-[#111827]"
                  style={{ textWrap: 'balance' }}
                >
                  Reserva en Guitiriz &amp; Aguas Santas
                </h1>
                <p className="text-base leading-relaxed text-[#404854] max-w-[54ch]">
                  Consulta salidas cada 10 minutos entre las 08:30 y las 19:00, comprueba la
                  disponibilidad de clases los miércoles con Víctor López en Guitiriz y coordina de
                  forma centralizada los vehículos de ambos campos con pago en recepción del campo de
                  golf.
                </p>
              </div>

              <div className="pt-8 flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  onClick={() => onNavigate('tee-times', 'guitiriz')}
                  className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003087]"
                >
                  <span>Consultar Tee Times</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('flota')}
                  className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#111827] hover:text-[#003087] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Ver vehículos centralizados</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 min-h-[320px] lg:min-h-[440px]">
              <div className="relative h-full w-full overflow-hidden rounded-xl border border-[#E2E5EB]">
                <ResilientImage
                  src="/assets/aistudio/_MG_9026_112a0ee5.jpg"
                  alt="Green, buggy y arbolado del campo de golf Iberik bajo el cielo gallego"
                  fallbackTitle="Guitiriz & Aguas Santas Golf"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-6 text-white">
                  <p className="text-xs font-medium text-white/85">
                    Pago exclusivo en recepción del campo de golf
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3-Column Operational Summary Strip */}
        <div className="border-t border-[#E2E5EB] bg-[#F8FAFC]">
          <div className="max-w-[1320px] mx-auto px-6 lg:px-10 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E2E5EB]">
            <div className="py-5 md:pr-6">
              <p className="font-hours text-lg font-semibold tabular-nums text-[#111827]">
                08:30 – 19:00
              </p>
              <p className="mt-1 text-xs text-[#555C68]">
                Salidas cada 10 minutos · 64 franjas diarias
              </p>
            </div>
            <div className="py-5 md:px-6">
              <p className="text-xs font-medium text-[#555C68]">
                Jugadores ahora en tiempo real
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-lg font-semibold tabular-nums text-[#111827]">
                <span>
                  {loadingSummary ? '—' : guitirizStats.onCourseNow}{' '}
                  <span className="text-xs font-sans font-medium text-[#555C68]">Guitiriz</span>
                </span>
                <span>
                  {loadingSummary ? '—' : aguasStats.onCourseNow}{' '}
                  <span className="text-xs font-sans font-medium text-[#555C68]">Aguas Santas</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-[#555C68] font-mono tabular-nums">
                {loadingSummary
                  ? 'Consultando hoy...'
                  : `Total hoy: ${guitirizStats.totalToday} Guitiriz · ${aguasStats.totalToday} Aguas Santas`}
              </p>
            </div>
            <div className="py-5 md:pl-6">
              <p className="font-mono text-lg font-medium text-[#111827]">
                Pago en recepción
              </p>
              <p className="mt-1 text-xs text-[#555C68]">
                Sin pasarela online · Recepción del campo de golf
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Two Courses Showcase */}
      <section className="max-w-[1320px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E2E5EB]">
          <div>
            <p className="text-xs font-medium text-[#555C68]">01. Nuestros campos</p>
            <h2 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
              Dos campos un abono
            </h2>
          </div>
          <p className="text-sm text-[#555C68] max-w-md">
            Selecciona cualquiera de los campos para consultar salidas disponibles hoy y asignar
            buggies o carros eléctricos en la misma operación.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Guitiriz */}
          <article className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] w-full overflow-hidden border-b border-[#E2E5EB]">
              <ResilientImage
                src="/assets/aistudio/_MG_9018_d4e698db.jpg"
                alt="Calle y green del Campo de Golf Guitiriz rodeado de pinos y robles"
                fallbackTitle="Golf Guitiriz · 9 Hoyos"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 lg:p-8 flex-1 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#555C68]">
                  <span>9 hoyos</span>
                  <span aria-hidden="true">·</span>
                  <span>Par {guitiriz?.par ?? 35}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Guitiriz, Lugo
                  </span>
                </div>
                <h3 className="font-display text-2xl font-semibold text-[#111827]">
                  Campo de Golf Guitiriz
                </h3>
                <p className="text-sm leading-relaxed text-[#404854]">
                  Recorrido parkland técnico de 9 hoyos junto al Hotel Balneario de Guitiriz. Sede
                  de la escuela de golf de Víctor López los miércoles y equipado con 2 buggies
                  YAMAHA y 6 carros eléctricos propios.
                </p>
              </div>

              <div className="pt-4 border-t border-[#EBEEF3] flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-[#555C68] font-mono tabular-nums">
                  <p>
                    Jugadores ahora:{' '}
                    <span className="text-[#111827] font-semibold">
                      {loadingSummary
                        ? 'Cargando...'
                        : `${guitirizStats.onCourseNow} en campo (${guitirizStats.totalToday} hoy)`}
                    </span>
                  </p>
                  <p>
                    Hoy:{' '}
                    <span className="text-[#111827] font-medium">
                      {loadingSummary ? 'Cargando...' : `${countOpenSlots(guitirizSummary)}/64 salidas`}
                    </span>
                  </p>
                  <p>
                    Vehículos:{' '}
                    <span className="text-[#111827] font-medium">
                      {guitirizSummary?.fleetTotals.buggiesOperational ?? 2} buggies ·{' '}
                      {guitirizSummary?.fleetTotals.trolleysOperational ?? 6} carros eléctricos
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('tee-times', 'guitiriz')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Ver salidas Guitiriz
                </button>
              </div>
            </div>
          </article>

          {/* Aguas Santas */}
          <article className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] w-full overflow-hidden border-b border-[#E2E5EB]">
              <ResilientImage
                src="/assets/aistudio/_MG_9042_5cf7600f.jpg"
                alt="Buggy Yamaha en la calle del campo de golf entre arboleda otoñal"
                fallbackTitle="Golf Aguas Santas · 18 Hoyos"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-6 lg:p-8 flex-1 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#555C68]">
                  <span>18 hoyos</span>
                  <span aria-hidden="true">·</span>
                  <span>Par {aguasSantas?.par ?? 71}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    Pantón · Ribeira Sacra
                  </span>
                </div>
                <h3 className="font-display text-2xl font-semibold text-[#111827]">
                  Campo de Golf Aguas Santas
                </h3>
                <p className="text-sm leading-relaxed text-[#404854]">
                  Trazado completo de 18 hoyos rodeado de valles, lagos y búnkeres amplios en el
                  corazón de la Ribeira Sacra. Cuenta con 2 buggies YAMAHA, 8 buggies DEHOU y 6
                  carros eléctricos con control horario de ronda completa.
                </p>
              </div>

              <div className="pt-4 border-t border-[#EBEEF3] flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 text-xs text-[#555C68] font-mono tabular-nums">
                  <p>
                    Jugadores ahora:{' '}
                    <span className="text-[#111827] font-semibold">
                      {loadingSummary
                        ? 'Cargando...'
                        : `${aguasStats.onCourseNow} en campo (${aguasStats.totalToday} hoy)`}
                    </span>
                  </p>
                  <p>
                    Hoy:{' '}
                    <span className="text-[#111827] font-medium">
                      {loadingSummary ? 'Cargando...' : `${countOpenSlots(aguasSummary)}/64 salidas`}
                    </span>
                  </p>
                  <p>
                    Vehículos:{' '}
                    <span className="text-[#111827] font-medium">
                      {aguasSummary?.fleetTotals.buggiesOperational ?? 10} buggies ·{' '}
                      {aguasSummary?.fleetTotals.trolleysOperational ?? 6} carros eléctricos
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('tee-times', 'aguas-santas')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Ver salidas Aguas Santas
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Academy Feature Section */}
      <section className="max-w-[1320px] mx-auto px-6 lg:px-10">
        <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 min-h-[280px]">
            <ResilientImage
              src="/assets/aistudio/_MG_9080_8e74ed92.jpg"
              alt="Bolsa de palos en el green de prácticas junto a buggy y bandera Iberik"
              fallbackTitle="Academia Guitiriz · Víctor López"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <p className="text-xs font-medium text-[#555C68]">
                02. Academia en Guitiriz · Solo miércoles
              </p>
              <h2 className="font-display text-3xl font-semibold text-[#111827]">
                Clases de golf con Víctor López
              </h2>
              <p className="text-sm leading-relaxed text-[#404854] max-w-[58ch]">
                Sesiones prácticas de 30 minutos en grupos reducidos de un máximo de 4 alumnos en
                las instalaciones de Guitiriz. El pago se realiza en recepción del campo de golf tras
                la confirmación de plaza.
              </p>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#EBEEF3]">
                <div className="pt-3 flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-[#003087] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">Turno de mañana</p>
                    <p className="text-xs font-hours font-medium tabular-nums text-[#555C68]">
                      Miércoles · 11:00 a 14:00 (30 min)
                    </p>
                  </div>
                </div>
                <div className="pt-3 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#003087] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">Turno de tarde</p>
                    <p className="text-xs font-hours font-medium tabular-nums text-[#555C68]">
                      Miércoles · 16:00 a 18:00 (30 min)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => onNavigate('academia')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#003087] hover:bg-[#002266] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Consultar horarios de miércoles</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Club Original Photography Gallery */}
      <section className="max-w-[1320px] mx-auto px-6 lg:px-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E2E5EB]">
          <div>
            <p className="text-xs font-medium text-[#555C68]">03. Galería del club</p>
            <h2 className="mt-1 font-display text-3xl lg:text-4xl font-semibold text-[#111827]">
              Así es nuestro recorrido
            </h2>
          </div>
          <p className="text-sm text-[#555C68] max-w-md">
            Vistas reales de nuestros greens, banderas Iberik y zonas arboladas durante la jornada
            de golf.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-5">
          {[
            {
              src: '/assets/aistudio/_MG_9046_a0dbbfba.jpg',
              alt: 'Bandera Iberik Hotel en el green junto al obstáculo de agua y búnker',
              title: 'Bandera Iberik · Green y agua',
            },
            {
              src: '/assets/aistudio/_MG_9020_c2617b63.jpg',
              alt: 'Bandera Iberik Hoteles en el green frente a robles de otoño',
              title: 'Green entre robles',
            },
            {
              src: '/assets/aistudio/_MG_9074_37a044da.jpg',
              alt: 'Jugador caminando con carro manual bajo los pinos del recorrido',
              title: 'Recorrido entre pinos',
            },
            {
              src: '/assets/aistudio/_MG_9030_2206962d.jpg',
              alt: 'Bolsa de golf preparada en el buggy mirando hacia la calle al atardecer',
              title: 'Salida en buggy',
            },
            {
              src: '/assets/aistudio/_MG_9029_0200d5a2.jpg',
              alt: 'Buggy junto al green con luz de tarde y bosque de pinos',
              title: 'Última luz en el green',
            },
          ].map((photo) => (
            <figure
              key={photo.src}
              className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden"
            >
              <div className="aspect-[3/4] w-full overflow-hidden">
                <ResilientImage
                  src={photo.src}
                  alt={photo.alt}
                  fallbackTitle={photo.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
};
