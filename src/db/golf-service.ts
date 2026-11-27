import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  academyBookings,
  courses,
  teeTimeReservations,
  users,
  vehicleReservations,
  vehicles,
} from './schema.ts';
import {
  ACADEMY_ALL_SLOTS,
  ACADEMY_INSTRUCTOR,
  ACADEMY_MAX_STUDENTS,
  GUITIRIZ_CROSSOVER_OFFSET_MINUTES,
  MAX_PLAYERS_PER_FLIGHT,
  ROUND_9_HOLES_DURATION_MINUTES,
  TEE_TIME_SLOTS,
  VEHICLE_ROUND_DURATION_MINUTES,
  addMinutesToTime,
  formatEuropeanDate,
  getOffsetTeeTimeSlot,
  getRoundDurationMinutes,
  isValidIsoDate,
  isValidTeeTimeSlot,
  isWednesdayIsoDate,
  minutesToTime,
  timeToMinutes,
  timesOverlap,
} from '../lib/golf-schedule.ts';

function getEffectiveVehicleDuration(courseDuration?: number | null): number {
  return Math.max(courseDuration || 0, VEHICLE_ROUND_DURATION_MINUTES);
}

function getEffectiveVehicleBlockEnd(
  startTime: string,
  storedEndTime: string,
  fallbackDuration = VEHICLE_ROUND_DURATION_MINUTES
): string {
  const startMins = timeToMinutes(startTime);
  const storedEndMins = timeToMinutes(storedEndTime);
  if (startMins >= 0 && storedEndMins > startMins) {
    return storedEndTime;
  }
  return startMins >= 0 ? minutesToTime(startMins + fallbackDuration) : storedEndTime;
}

export class ConflictError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  constructor(message: string) {
    super(message);
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message: string) {
    super(message);
  }
}

export async function getCourses() {
  try {
    return await db.select().from(courses).orderBy(asc(courses.holes));
  } catch (error) {
    console.error('Error fetching courses:', error);
    throw new Error('Error al obtener los campos de golf', { cause: error });
  }
}

export async function getCourseAvailability(courseSlug: string, date: string) {
  if (!isValidIsoDate(date)) {
    throw new ValidationError('Fecha no válida. Usa formato YYYY-MM-DD.');
  }
  try {
    const courseList = await db
      .select()
      .from(courses)
      .where(eq(courses.slug, courseSlug))
      .limit(1);

    if (courseList.length === 0) {
      throw new NotFoundError('Campo de golf no encontrado.');
    }
    const course = courseList[0];

    const [dayTeeTimes, courseVehicles, dayVehicleRes] = await Promise.all([
      db
        .select({
          slotTime: teeTimeReservations.slotTime,
          holes: teeTimeReservations.holes,
          playersCount: teeTimeReservations.playersCount,
          isComplete: teeTimeReservations.isComplete,
        })
        .from(teeTimeReservations)
        .where(
          and(
            eq(teeTimeReservations.courseId, course.id),
            eq(teeTimeReservations.date, date),
            ne(teeTimeReservations.status, 'cancelled')
          )
        ),
      db
        .select()
        .from(vehicles)
        .where(eq(vehicles.courseId, course.id))
        .orderBy(asc(vehicles.code)),
      db
        .select()
        .from(vehicleReservations)
        .where(
          and(
            eq(vehicleReservations.courseId, course.id),
            eq(vehicleReservations.date, date),
            ne(vehicleReservations.status, 'cancelled')
          )
        ),
    ]);

    const playersBySlot = new Map<string, number>();
    const players9BySlot = new Map<string, number>();
    const players18BySlot = new Map<string, number>();
    const has18HolesBySlot = new Set<string>();
    const closedCompleteSlots = new Set<string>();
    for (const row of dayTeeTimes) {
      playersBySlot.set(row.slotTime, (playersBySlot.get(row.slotTime) || 0) + row.playersCount);
      if (row.holes === 9) {
        players9BySlot.set(row.slotTime, (players9BySlot.get(row.slotTime) || 0) + row.playersCount);
      } else {
        players18BySlot.set(row.slotTime, (players18BySlot.get(row.slotTime) || 0) + row.playersCount);
        has18HolesBySlot.add(row.slotTime);
      }
      if (row.isComplete) {
        closedCompleteSlots.add(row.slotTime);
      }
    }

    const operationalBuggies = courseVehicles.filter(
      (v) => v.type === 'buggy' && v.status === 'operational'
    );
    const operationalTrolleys = courseVehicles.filter(
      (v) => v.type === 'electric_trolley' && v.status === 'operational'
    );

    const vehicleDuration18 = getEffectiveVehicleDuration(course.roundDurationMinutes);
    const vehicleDuration9 = ROUND_9_HOLES_DURATION_MINUTES;

    const slots = TEE_TIME_SLOTS.map((slotTime) => {
      const bookedPlayers = playersBySlot.get(slotTime) || 0;
      const bookedPlayers9 = players9BySlot.get(slotTime) || 0;
      const bookedPlayers18 = players18BySlot.get(slotTime) || 0;
      const isClosedComplete = closedCompleteSlots.has(slotTime);
      const prevCrossoverSlot =
        course.holes === 9
          ? getOffsetTeeTimeSlot(slotTime, -GUITIRIZ_CROSSOVER_OFFSET_MINUTES)
          : null;
      const nextCrossoverSlot =
        course.holes === 9
          ? getOffsetTeeTimeSlot(slotTime, GUITIRIZ_CROSSOVER_OFFSET_MINUTES)
          : null;

      // Incoming crossover block: only 18-hole flights 2h earlier return to tee 1 at slotTime
      const isCrossoverBlocked = Boolean(
        prevCrossoverSlot && has18HolesBySlot.has(prevCrossoverSlot)
      );
      const crossoverType: 'incoming_crossover' | null = isCrossoverBlocked
        ? 'incoming_crossover'
        : null;
      const crossoverSourceSlot = isCrossoverBlocked ? prevCrossoverSlot : null;

      // Outgoing crossover check: an 18-hole round cannot start if slotTime + 2h already has bookings
      const nextSlotHasBookings = Boolean(
        nextCrossoverSlot &&
          ((playersBySlot.get(nextCrossoverSlot) || 0) > 0 ||
            closedCompleteSlots.has(nextCrossoverSlot))
      );
      const canBook18Holes = course.holes === 9 ? !nextSlotHasBookings : true;
      const outgoingCrossoverSlot = !canBook18Holes ? nextCrossoverSlot : null;

      const remainingPlayers =
        isCrossoverBlocked || isClosedComplete
          ? 0
          : Math.max(0, MAX_PLAYERS_PER_FLIGHT - bookedPlayers);
      const windowEnd18 = addMinutesToTime(slotTime, vehicleDuration18);
      const windowEnd9 = addMinutesToTime(slotTime, vehicleDuration9);

      const busyVehicleIds18 = new Set(
        dayVehicleRes
          .filter((r) =>
            timesOverlap(
              slotTime,
              windowEnd18,
              r.startTime,
              getEffectiveVehicleBlockEnd(r.startTime, r.endTime, vehicleDuration18)
            )
          )
          .map((r) => r.vehicleId)
      );
      const busyVehicleIds9 = new Set(
        dayVehicleRes
          .filter((r) =>
            timesOverlap(
              slotTime,
              windowEnd9,
              r.startTime,
              getEffectiveVehicleBlockEnd(r.startTime, r.endTime, vehicleDuration9)
            )
          )
          .map((r) => r.vehicleId)
      );

      const availableBuggies = operationalBuggies.filter((v) => !busyVehicleIds18.has(v.id)).length;
      const availableTrolleys = operationalTrolleys.filter(
        (v) => !busyVehicleIds18.has(v.id)
      ).length;
      const availableBuggies9 = operationalBuggies.filter((v) => !busyVehicleIds9.has(v.id)).length;
      const availableTrolleys9 = operationalTrolleys.filter(
        (v) => !busyVehicleIds9.has(v.id)
      ).length;

      return {
        slotTime,
        bookedPlayers,
        bookedPlayers9,
        bookedPlayers18,
        remainingPlayers,
        availableBuggies,
        availableTrolleys,
        availableBuggies9,
        availableTrolleys9,
        isClosedComplete,
        isCrossoverBlocked,
        crossoverSourceSlot,
        crossoverType,
        canBook18Holes,
        outgoingCrossoverSlot,
      };
    });

    return {
      course,
      date,
      fleetTotals: {
        buggiesOperational: operationalBuggies.length,
        buggiesTotal: course.buggiesCount,
        trolleysOperational: operationalTrolleys.length,
        trolleysTotal: course.trolleysCount,
      },
      slots,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
    console.error('Error fetching course availability:', error);
    throw new Error('Error al consultar la disponibilidad en tiempo real', { cause: error });
  }
}

export async function createTeeTimeReservation(input: {
  courseSlug: string;
  userId: number;
  date: string;
  slotTime: string;
  holes?: number;
  playersCount: number;
  playerNames?: string;
  isComplete?: boolean;
  buggiesRequested: number;
  trolleysRequested: number;
  notes?: string;
  enforceDailyLimit?: boolean;
}) {
  if (!isValidIsoDate(input.date)) {
    throw new ValidationError('Fecha no válida.');
  }
  if (!isValidTeeTimeSlot(input.slotTime)) {
    throw new ValidationError('Horario de salida fuera de rango (08:30 a 19:00 cada 10 minutos).');
  }
  const roundHoles = input.holes === undefined ? 18 : Number(input.holes);
  if (roundHoles !== 9 && roundHoles !== 18) {
    throw new ValidationError('La modalidad del tee time debe ser de 9 o 18 hoyos.');
  }
  if (!Number.isInteger(input.playersCount) || input.playersCount < 1 || input.playersCount > 4) {
    throw new ValidationError('El número de jugadores por salida debe estar entre 1 y 4.');
  }
  if (
    !Number.isInteger(input.buggiesRequested) ||
    input.buggiesRequested < 0 ||
    input.buggiesRequested > 2
  ) {
    throw new ValidationError('Cantidad de buggies solicitada no válida.');
  }
  if (
    !Number.isInteger(input.trolleysRequested) ||
    input.trolleysRequested < 0 ||
    input.trolleysRequested > 4
  ) {
    throw new ValidationError('Cantidad de carros eléctricos solicitada no válida.');
  }

  try {
    return await db.transaction(async (tx) => {
      const [courseRows, titularRows] = await Promise.all([
        tx.select().from(courses).where(eq(courses.slug, input.courseSlug)).limit(1),
        tx.select().from(users).where(eq(users.id, input.userId)).limit(1),
      ]);
      if (courseRows.length === 0) {
        throw new NotFoundError('Campo de golf no encontrado.');
      }
      if (titularRows.length === 0) {
        throw new NotFoundError('Usuario titular no encontrado.');
      }
      const course = courseRows[0];

      if (input.enforceDailyLimit) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`daily-tt:${input.userId}:${input.date}`}))`
        );
        const existingDaily = await tx
          .select({
            id: teeTimeReservations.id,
            slotTime: teeTimeReservations.slotTime,
            courseName: courses.name,
          })
          .from(teeTimeReservations)
          .innerJoin(courses, eq(teeTimeReservations.courseId, courses.id))
          .where(
            and(
              eq(teeTimeReservations.userId, input.userId),
              eq(teeTimeReservations.date, input.date),
              ne(teeTimeReservations.status, 'cancelled')
            )
          )
          .limit(1);

        if (existingDaily.length > 0) {
          const existingBooking = existingDaily[0];
          throw new ConflictError(
            `Ya tienes una reserva activa para el ${formatEuropeanDate(input.date)} (${existingBooking.slotTime} en ${existingBooking.courseName}). Los usuarios player solo pueden realizar una reserva diaria.`
          );
        }
      }

      const existingFlights = await tx
        .select()
        .from(teeTimeReservations)
        .where(
          and(
            eq(teeTimeReservations.courseId, course.id),
            eq(teeTimeReservations.date, input.date),
            eq(teeTimeReservations.slotTime, input.slotTime),
            ne(teeTimeReservations.status, 'cancelled')
          )
        );

      const currentPlayers = existingFlights.reduce((sum, f) => sum + f.playersCount, 0);

      if (course.holes === 9) {
        const prevCrossoverSlot = getOffsetTeeTimeSlot(
          input.slotTime,
          -GUITIRIZ_CROSSOVER_OFFSET_MINUTES
        );

        if (prevCrossoverSlot) {
          const incomingFlights = await tx
            .select({ id: teeTimeReservations.id })
            .from(teeTimeReservations)
            .where(
              and(
                eq(teeTimeReservations.courseId, course.id),
                eq(teeTimeReservations.date, input.date),
                eq(teeTimeReservations.slotTime, prevCrossoverSlot),
                eq(teeTimeReservations.holes, 18),
                ne(teeTimeReservations.status, 'cancelled')
              )
            )
            .limit(1);
          if (incomingFlights.length > 0) {
            throw new ConflictError(
              `La salida de las ${input.slotTime} en ${course.name} está bloqueada por el cruce de hoyo 9 (2 h después) de la partida de 18 hoyos de las ${prevCrossoverSlot}.`
            );
          }
        }

        if (roundHoles === 18) {
          const nextCrossoverSlot = getOffsetTeeTimeSlot(
            input.slotTime,
            GUITIRIZ_CROSSOVER_OFFSET_MINUTES
          );
          if (nextCrossoverSlot) {
            const outgoingClash = await tx
              .select({ id: teeTimeReservations.id })
              .from(teeTimeReservations)
              .where(
                and(
                  eq(teeTimeReservations.courseId, course.id),
                  eq(teeTimeReservations.date, input.date),
                  eq(teeTimeReservations.slotTime, nextCrossoverSlot),
                  ne(teeTimeReservations.status, 'cancelled')
                )
              )
              .limit(1);
            if (outgoingClash.length > 0) {
              throw new ConflictError(
                `No se puede reservar un recorrido de 18 hoyos a las ${input.slotTime} en ${course.name} porque a las ${nextCrossoverSlot} (cruce a las 2 h) ya hay una salida reservada. Selecciona 9 hoyos u otro horario.`
              );
            }
          }
        }
      }

      if (existingFlights.some((f) => f.isComplete)) {
        throw new ConflictError(
          `La salida de las ${input.slotTime} ya está marcada como partida completa y no admite más jugadores.`
        );
      }

      const wantComplete = Boolean(input.isComplete);
      if (wantComplete && existingFlights.length > 0) {
        throw new ConflictError(
          `Ya hay jugadores inscritos a las ${input.slotTime}; no se puede cerrar como partida completa exclusiva.`
        );
      }

      if (currentPlayers + input.playersCount > MAX_PLAYERS_PER_FLIGHT) {
        throw new ConflictError(
          `El tee time de las ${input.slotTime} solo dispone de ${Math.max(
            0,
            MAX_PLAYERS_PER_FLIGHT - currentPlayers
          )} plaza(s).`
        );
      }

      const vehicleDuration = getRoundDurationMinutes(roundHoles);
      const endTime = addMinutesToTime(input.slotTime, vehicleDuration);
      let chosenBuggies: (typeof vehicles.$inferSelect)[] = [];
      let chosenTrolleys: (typeof vehicles.$inferSelect)[] = [];

      if (input.buggiesRequested > 0 || input.trolleysRequested > 0) {
        const [courseVehicles, dayVehicleRes] = await Promise.all([
          tx
            .select()
            .from(vehicles)
            .where(and(eq(vehicles.courseId, course.id), eq(vehicles.status, 'operational')))
            .orderBy(asc(vehicles.code)),
          tx
            .select()
            .from(vehicleReservations)
            .where(
              and(
                eq(vehicleReservations.courseId, course.id),
                eq(vehicleReservations.date, input.date),
                ne(vehicleReservations.status, 'cancelled')
              )
            ),
        ]);

        const busyIds = new Set(
          dayVehicleRes
            .filter((r) =>
              timesOverlap(
                input.slotTime,
                endTime,
                r.startTime,
                getEffectiveVehicleBlockEnd(r.startTime, r.endTime, vehicleDuration)
              )
            )
            .map((r) => r.vehicleId)
        );

        const freeBuggies = courseVehicles.filter(
          (v) => v.type === 'buggy' && !busyIds.has(v.id)
        );
        const freeTrolleys = courseVehicles.filter(
          (v) => v.type === 'electric_trolley' && !busyIds.has(v.id)
        );

        if (freeBuggies.length < input.buggiesRequested) {
          throw new ConflictError(
            `Solo quedan ${freeBuggies.length} buggy(s) disponibles en ${course.name} para las ${input.slotTime}.`
          );
        }
        if (freeTrolleys.length < input.trolleysRequested) {
          throw new ConflictError(
            `Solo quedan ${freeTrolleys.length} carro(s) eléctrico(s) disponibles en ${course.name} para las ${input.slotTime}.`
          );
        }

        chosenBuggies = freeBuggies.slice(0, input.buggiesRequested);
        chosenTrolleys = freeTrolleys.slice(0, input.trolleysRequested);
      }

      const inserted = await tx
        .insert(teeTimeReservations)
        .values({
          courseId: course.id,
          userId: input.userId,
          date: input.date,
          slotTime: input.slotTime,
          holes: roundHoles,
          playersCount: input.playersCount,
          playerNames: (input.playerNames || '').trim(),
          isComplete: wantComplete,
          buggiesRequested: input.buggiesRequested,
          trolleysRequested: input.trolleysRequested,
          paymentMethod: 'RECEPTION_MEWS',
          mewsStatus: 'PENDING_RECEPTION',
          notes: (input.notes || '').trim(),
          status: 'confirmed',
        })
        .returning();

      const reservation = inserted[0];
      const assignedVehicles = [...chosenBuggies, ...chosenTrolleys];

      if (assignedVehicles.length > 0) {
        await tx.insert(vehicleReservations).values(
          assignedVehicles.map((v) => ({
            vehicleId: v.id,
            courseId: course.id,
            userId: input.userId,
            teeTimeReservationId: reservation.id,
            date: input.date,
            startTime: input.slotTime,
            endTime,
            mewsStatus: 'PENDING_RECEPTION',
            status: 'reserved',
            notes: `Asignado a salida ${input.slotTime}`,
          }))
        );
      }

      return {
        reservation,
        assignedVehicles,
      };
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    console.error('Error creating tee time reservation:', error);
    throw new Error('Error al registrar la reserva de tee time', { cause: error });
  }
}

export async function listTeeTimeReservations(filters: {
  date?: string;
  courseSlug?: string;
  userId?: number;
}) {
  try {
    const rows = await db
      .select({
        id: teeTimeReservations.id,
        date: teeTimeReservations.date,
        slotTime: teeTimeReservations.slotTime,
        holes: teeTimeReservations.holes,
        playersCount: teeTimeReservations.playersCount,
        playerNames: teeTimeReservations.playerNames,
        isComplete: teeTimeReservations.isComplete,
        buggiesRequested: teeTimeReservations.buggiesRequested,
        trolleysRequested: teeTimeReservations.trolleysRequested,
        paymentMethod: teeTimeReservations.paymentMethod,
        mewsStatus: teeTimeReservations.mewsStatus,
        notes: teeTimeReservations.notes,
        status: teeTimeReservations.status,
        createdAt: teeTimeReservations.createdAt,
        courseId: courses.id,
        courseSlug: courses.slug,
        courseName: courses.name,
        courseHoles: courses.holes,
        courseRoundDurationMinutes: courses.roundDurationMinutes,
        userId: users.id,
        userEmail: users.email,
        userNombre: users.nombre,
        userApellidos: users.apellidos,
        userLicencia: users.licencia,
        userTelefono: users.telefono,
      })
      .from(teeTimeReservations)
      .innerJoin(courses, eq(teeTimeReservations.courseId, courses.id))
      .innerJoin(users, eq(teeTimeReservations.userId, users.id))
      .orderBy(desc(teeTimeReservations.date), asc(teeTimeReservations.slotTime));

    const filteredRows = rows.filter((row) => {
      if (filters.date && row.date !== filters.date) return false;
      if (filters.courseSlug && row.courseSlug !== filters.courseSlug) return false;
      if (filters.userId && row.userId !== filters.userId) return false;
      return true;
    });

    if (filteredRows.length === 0) {
      return [];
    }

    const reservationIds = filteredRows.map((r) => r.id);
    const linkedVehicles = await db
      .select({
        id: vehicleReservations.id,
        teeTimeReservationId: vehicleReservations.teeTimeReservationId,
        vehicleId: vehicleReservations.vehicleId,
        code: vehicles.code,
        brand: vehicles.brand,
        type: vehicles.type,
        label: vehicles.label,
        status: vehicleReservations.status,
        startTime: vehicleReservations.startTime,
        endTime: vehicleReservations.endTime,
      })
      .from(vehicleReservations)
      .innerJoin(vehicles, eq(vehicleReservations.vehicleId, vehicles.id))
      .where(inArray(vehicleReservations.teeTimeReservationId, reservationIds))
      .orderBy(asc(vehicles.code));

    const vehiclesByReservation = new Map<
      number,
      {
        id: number;
        vehicleId: number;
        code: string;
        brand: string;
        type: string;
        label: string;
        status: string;
        startTime: string;
        endTime: string;
      }[]
    >();

    for (const lv of linkedVehicles) {
      if (!lv.teeTimeReservationId) continue;
      const list = vehiclesByReservation.get(lv.teeTimeReservationId) || [];
      list.push({
        id: lv.id,
        vehicleId: lv.vehicleId,
        code: lv.code,
        brand: lv.brand || '',
        type: lv.type,
        label: lv.label,
        status: lv.status,
        startTime: lv.startTime,
        endTime: lv.endTime,
      });
      vehiclesByReservation.set(lv.teeTimeReservationId, list);
    }

    return filteredRows.map((row) => ({
      ...row,
      assignedVehicles: vehiclesByReservation.get(row.id) || [],
    }));
  } catch (error) {
    console.error('Error listing tee time reservations:', error);
    throw new Error('Error al obtener las reservas de tee times', { cause: error });
  }
}

export async function updateTeeTimeReservationStatus(input: {
  id: number;
  requesterId: number;
  isStaff: boolean;
  managedCourseSlugs?: string[];
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
}) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(teeTimeReservations)
        .where(eq(teeTimeReservations.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de tee time no encontrada.');
      }
      const resRow = existing[0];

      const courseRows = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, resRow.courseId))
        .limit(1);
      const targetCourse = courseRows[0];

      if (
        input.isStaff &&
        input.managedCourseSlugs &&
        targetCourse &&
        !input.managedCourseSlugs.includes(targetCourse.slug)
      ) {
        throw new ForbiddenError(
          `Tu cuenta solo tiene permisos de consulta en ${targetCourse.name}.`
        );
      }

      const hasStaffOnlyFields =
        input.userId !== undefined ||
        input.date !== undefined ||
        input.holes !== undefined ||
        input.playersCount !== undefined ||
        input.playerNames !== undefined ||
        input.isComplete !== undefined ||
        input.notes !== undefined;

      if (!input.isStaff && resRow.userId !== input.requesterId) {
        throw new ValidationError('No tienes permiso para modificar esta reserva.');
      }
      if (!input.isStaff && input.status && input.status !== 'cancelled') {
        throw new ValidationError('Solo recepción puede cambiar el estado operativo.');
      }
      if (!input.isStaff && input.mewsStatus) {
        throw new ValidationError('Solo recepción puede actualizar el estado de cobro.');
      }
      if (!input.isStaff && hasStaffOnlyFields) {
        throw new ValidationError('Solo recepción o administración puede editar esos datos de la reserva.');
      }
      if (!input.isStaff && input.slotTime !== undefined) {
        if (resRow.status === 'cancelled') {
          throw new ValidationError('No puedes mover de hora una reserva cancelada.');
        }
        if (resRow.mewsStatus === 'BILLED_MEWS') {
          throw new ValidationError('No puedes mover de hora una reserva ya cobrada; contacta con recepción.');
        }
      }

      const allowedStatuses = new Set(['confirmed', 'checked_in', 'cancelled']);
      const allowedMewsStatuses = new Set(['PENDING_RECEPTION', 'BILLED_MEWS', 'CANCELLED']);

      const nextStatus = input.status ?? resRow.status;
      if (!allowedStatuses.has(nextStatus)) {
        throw new ValidationError('Estado de reserva no válido.');
      }

      const nextMewsStatus =
        nextStatus === 'cancelled'
          ? 'CANCELLED'
          : input.mewsStatus ?? resRow.mewsStatus;
      if (!allowedMewsStatuses.has(nextMewsStatus)) {
        throw new ValidationError('Estado de cobro no válido.');
      }

      const nextUserId = input.userId ?? resRow.userId;
      if (input.userId !== undefined && input.userId !== resRow.userId) {
        const userRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (userRows.length === 0) {
          throw new NotFoundError('Usuario titular no encontrado.');
        }
      }

      const nextDate = input.date ?? resRow.date;
      if (!isValidIsoDate(nextDate)) {
        throw new ValidationError('Fecha no válida.');
      }

      const nextSlotTime = input.slotTime ?? resRow.slotTime;
      if (!isValidTeeTimeSlot(nextSlotTime)) {
        throw new ValidationError('Horario de salida fuera de rango (08:30 a 19:00 cada 10 minutos).');
      }

      const nextHoles = input.holes !== undefined ? Number(input.holes) : resRow.holes;
      if (nextHoles !== 9 && nextHoles !== 18) {
        throw new ValidationError('La modalidad del tee time debe ser de 9 o 18 hoyos.');
      }

      const nextPlayersCount = input.playersCount ?? resRow.playersCount;
      if (!Number.isInteger(nextPlayersCount) || nextPlayersCount < 1 || nextPlayersCount > 4) {
        throw new ValidationError('El número de jugadores por salida debe estar entre 1 y 4.');
      }

      const nextIsComplete =
        input.isComplete !== undefined ? Boolean(input.isComplete) : resRow.isComplete;

      if (
        nextStatus !== 'cancelled' &&
        (nextDate !== resRow.date ||
          nextSlotTime !== resRow.slotTime ||
          nextHoles !== resRow.holes ||
          nextPlayersCount !== resRow.playersCount ||
          nextIsComplete !== resRow.isComplete ||
          (resRow.status === 'cancelled' && nextStatus !== 'cancelled'))
      ) {
        if (targetCourse?.holes === 9) {
          const prevCrossoverSlot = getOffsetTeeTimeSlot(
            nextSlotTime,
            -GUITIRIZ_CROSSOVER_OFFSET_MINUTES
          );

          if (prevCrossoverSlot) {
            const incomingFlights = await tx
              .select({ id: teeTimeReservations.id })
              .from(teeTimeReservations)
              .where(
                and(
                  eq(teeTimeReservations.courseId, resRow.courseId),
                  eq(teeTimeReservations.date, nextDate),
                  eq(teeTimeReservations.slotTime, prevCrossoverSlot),
                  eq(teeTimeReservations.holes, 18),
                  ne(teeTimeReservations.status, 'cancelled'),
                  ne(teeTimeReservations.id, input.id)
                )
              )
              .limit(1);
            if (incomingFlights.length > 0) {
              throw new ConflictError(
                `La salida de las ${nextSlotTime} en ${targetCourse.name} está bloqueada por el cruce de hoyo 9 de la partida de 18 hoyos de las ${prevCrossoverSlot}.`
              );
            }
          }

          if (nextHoles === 18) {
            const nextCrossoverSlot = getOffsetTeeTimeSlot(
              nextSlotTime,
              GUITIRIZ_CROSSOVER_OFFSET_MINUTES
            );
            if (nextCrossoverSlot) {
              const outgoingClash = await tx
                .select({ id: teeTimeReservations.id })
                .from(teeTimeReservations)
                .where(
                  and(
                    eq(teeTimeReservations.courseId, resRow.courseId),
                    eq(teeTimeReservations.date, nextDate),
                    eq(teeTimeReservations.slotTime, nextCrossoverSlot),
                    ne(teeTimeReservations.status, 'cancelled'),
                    ne(teeTimeReservations.id, input.id)
                  )
                )
                .limit(1);
              if (outgoingClash.length > 0) {
                throw new ConflictError(
                  `No se puede programar 18 hoyos a las ${nextSlotTime} en ${targetCourse.name} porque a las ${nextCrossoverSlot} (cruce a las 2 h) ya hay una salida reservada. Selecciona 9 hoyos u otro horario.`
                );
              }
            }
          }
        }

        const slotFlights = await tx
          .select()
          .from(teeTimeReservations)
          .where(
            and(
              eq(teeTimeReservations.courseId, resRow.courseId),
              eq(teeTimeReservations.date, nextDate),
              eq(teeTimeReservations.slotTime, nextSlotTime),
              ne(teeTimeReservations.status, 'cancelled'),
              ne(teeTimeReservations.id, input.id)
            )
          );
        if (slotFlights.some((f) => f.isComplete)) {
          throw new ConflictError(
            `La salida de las ${nextSlotTime} ya está marcada como partida completa y no admite más jugadores.`
          );
        }
        if (nextIsComplete && slotFlights.length > 0) {
          throw new ConflictError(
            `Ya existen otras reservas en la franja de las ${nextSlotTime}; no se puede marcar como partida completa exclusiva.`
          );
        }

        const bookedOthers = slotFlights.reduce((sum, f) => sum + f.playersCount, 0);
        if (bookedOthers + nextPlayersCount > MAX_PLAYERS_PER_FLIGHT) {
          throw new ConflictError(
            `El tee time de las ${nextSlotTime} solo dispone de ${Math.max(
              0,
              MAX_PLAYERS_PER_FLIGHT - bookedOthers
            )} plaza(s) libres.`
          );
        }
      }

      const updated = await tx
        .update(teeTimeReservations)
        .set({
          userId: nextUserId,
          date: nextDate,
          slotTime: nextSlotTime,
          holes: nextHoles,
          playersCount: nextPlayersCount,
          playerNames:
            input.playerNames !== undefined ? input.playerNames.trim() : resRow.playerNames,
          isComplete: nextIsComplete,
          notes: input.notes !== undefined ? input.notes.trim() : resRow.notes,
          status: nextStatus,
          mewsStatus: nextMewsStatus,
        })
        .where(eq(teeTimeReservations.id, input.id))
        .returning();

      if (nextStatus === 'cancelled') {
        await tx
          .update(vehicleReservations)
          .set({ status: 'cancelled', mewsStatus: 'CANCELLED' })
          .where(eq(vehicleReservations.teeTimeReservationId, input.id));
      } else {
        const linkedVehicles = await tx
          .select()
          .from(vehicleReservations)
          .where(eq(vehicleReservations.teeTimeReservationId, input.id));

        if (linkedVehicles.length > 0) {
          const duration = getRoundDurationMinutes(nextHoles);
          const nextEndTime = addMinutesToTime(nextSlotTime, duration);
          const linkedVehicleAssignmentById = new Map<number, number>();

          if (
            nextDate !== resRow.date ||
            nextSlotTime !== resRow.slotTime ||
            nextHoles !== resRow.holes ||
            (resRow.status === 'cancelled' && nextStatus !== 'cancelled')
          ) {
            const [courseVehicles, dayVehicleRes] = await Promise.all([
              tx
                .select()
                .from(vehicles)
                .where(eq(vehicles.courseId, resRow.courseId))
                .orderBy(asc(vehicles.code)),
              tx
                .select()
                .from(vehicleReservations)
                .where(
                  and(
                    eq(vehicleReservations.courseId, resRow.courseId),
                    eq(vehicleReservations.date, nextDate),
                    ne(vehicleReservations.status, 'cancelled')
                  )
                ),
            ]);

            const linkedResIds = new Set(linkedVehicles.map((lv) => lv.id));
            const busyVehicleIds = new Set(
              dayVehicleRes
                .filter(
                  (other) =>
                    !linkedResIds.has(other.id) &&
                    timesOverlap(
                      nextSlotTime,
                      nextEndTime,
                      other.startTime,
                      getEffectiveVehicleBlockEnd(other.startTime, other.endTime, duration)
                    )
                )
                .map((other) => other.vehicleId)
            );
            const vehicleById = new Map(courseVehicles.map((v) => [v.id, v]));
            const claimedVehicleIds = new Set<number>();

            for (const lv of linkedVehicles) {
              const currentVeh = vehicleById.get(lv.vehicleId);
              const canKeepCurrent =
                currentVeh &&
                currentVeh.status === 'operational' &&
                !busyVehicleIds.has(currentVeh.id) &&
                !claimedVehicleIds.has(currentVeh.id);

              if (canKeepCurrent) {
                claimedVehicleIds.add(currentVeh.id);
                linkedVehicleAssignmentById.set(lv.id, currentVeh.id);
                continue;
              }

              const targetType = currentVeh?.type;
              const replacement = courseVehicles.find(
                (v) =>
                  v.status === 'operational' &&
                  (!targetType || v.type === targetType) &&
                  !busyVehicleIds.has(v.id) &&
                  !claimedVehicleIds.has(v.id)
              );

              if (!replacement) {
                const label =
                  targetType === 'buggy'
                    ? 'buggies'
                    : targetType === 'electric_trolley'
                    ? 'carros eléctricos'
                    : 'vehículos';
                throw new ConflictError(
                  `No hay suficientes ${label} disponibles a las ${nextSlotTime} en ${formatEuropeanDate(nextDate)}.`
                );
              }
              claimedVehicleIds.add(replacement.id);
              linkedVehicleAssignmentById.set(lv.id, replacement.id);
            }
          }

          for (const lv of linkedVehicles) {
            const assignedVehicleId = linkedVehicleAssignmentById.get(lv.id) ?? lv.vehicleId;
            await tx
              .update(vehicleReservations)
              .set({
                vehicleId: assignedVehicleId,
                userId: nextUserId,
                date: nextDate,
                startTime: nextSlotTime,
                endTime: nextEndTime,
                mewsStatus: nextMewsStatus,
                ...(resRow.status === 'cancelled' ? { status: 'reserved' } : {}),
              })
              .where(eq(vehicleReservations.id, lv.id));
          }
        }
      }

      return updated[0];
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }
    console.error('Error updating tee time reservation:', error);
    throw new Error('Error al actualizar la reserva', { cause: error });
  }
}

export async function getAcademyAvailability(date: string) {
  if (!isValidIsoDate(date)) {
    throw new ValidationError('Fecha no válida.');
  }
  try {
    const guitirizRows = await db
      .select()
      .from(courses)
      .where(eq(courses.slug, 'guitiriz'))
      .limit(1);
    if (guitirizRows.length === 0) {
      throw new NotFoundError('Campo de Guitiriz no configurado.');
    }
    const guitiriz = guitirizRows[0];
    const isWednesday = isWednesdayIsoDate(date);

    const dayBookings = isWednesday
      ? await db
          .select()
          .from(academyBookings)
          .where(
            and(
              eq(academyBookings.courseId, guitiriz.id),
              eq(academyBookings.date, date),
              ne(academyBookings.status, 'cancelled')
            )
          )
      : [];

    const bookingsBySlot = new Map<string, typeof dayBookings>();
    for (const b of dayBookings) {
      const list = bookingsBySlot.get(b.slotTime) || [];
      list.push(b);
      bookingsBySlot.set(b.slotTime, list);
    }

    const slots = ACADEMY_ALL_SLOTS.map((slotTime) => {
      const slotBookings = bookingsBySlot.get(slotTime) || [];
      const bookedStudents = slotBookings.reduce((sum, b) => sum + b.studentsCount, 0);
      const isClosedComplete = slotBookings.some((b) => b.isComplete);
      const remainingSpots = isWednesday
        ? isClosedComplete
          ? 0
          : Math.max(0, ACADEMY_MAX_STUDENTS - bookedStudents)
        : 0;
      const session = timeToMinutes(slotTime) < 15 * 60 ? 'morning' : 'afternoon';
      return {
        slotTime,
        endTime: addMinutesToTime(slotTime, 30),
        session,
        bookedStudents,
        remainingSpots,
        maxStudents: ACADEMY_MAX_STUDENTS,
        isClosedComplete,
      };
    });

    return {
      course: guitiriz,
      instructor: ACADEMY_INSTRUCTOR,
      date,
      isWednesday,
      slots,
    };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
    console.error('Error fetching academy availability:', error);
    throw new Error('Error al consultar las clases de golf', { cause: error });
  }
}

export async function createAcademyBooking(input: {
  userId: number;
  date: string;
  slotTime: string;
  studentsCount: number;
  studentName: string;
  studentPhone?: string;
  isComplete?: boolean;
  level?: string;
  notes?: string;
}) {
  if (!isValidIsoDate(input.date) || !isWednesdayIsoDate(input.date)) {
    throw new ValidationError(
      'Las clases con Víctor López en Guitiriz se imparten únicamente los miércoles.'
    );
  }
  if (!ACADEMY_ALL_SLOTS.includes(input.slotTime)) {
    throw new ValidationError(
      'Horario no válido. Las clases son de 30 minutos de 11:00 a 14:00 y de 16:00 a 18:00.'
    );
  }
  if (!Number.isInteger(input.studentsCount) || input.studentsCount < 1 || input.studentsCount > 4) {
    throw new ValidationError('El máximo de alumnos por clase es de 4.');
  }
  const trimmedStudentName = (input.studentName || '').trim();
  if (!trimmedStudentName) {
    throw new ValidationError('Debes indicar al menos un nombre de alumno para reservar la clase.');
  }

  try {
    return await db.transaction(async (tx) => {
      const [guitirizRows, titularRows] = await Promise.all([
        tx.select().from(courses).where(eq(courses.slug, 'guitiriz')).limit(1),
        tx.select().from(users).where(eq(users.id, input.userId)).limit(1),
      ]);
      if (guitirizRows.length === 0) {
        throw new NotFoundError('Campo de Guitiriz no encontrado.');
      }
      if (titularRows.length === 0) {
        throw new NotFoundError('Usuario titular no encontrado.');
      }
      const guitiriz = guitirizRows[0];

      const existing = await tx
        .select()
        .from(academyBookings)
        .where(
          and(
            eq(academyBookings.courseId, guitiriz.id),
            eq(academyBookings.date, input.date),
            eq(academyBookings.slotTime, input.slotTime),
            ne(academyBookings.status, 'cancelled')
          )
        );

      if (existing.some((b) => b.isComplete)) {
        throw new ConflictError(
          `La clase de las ${input.slotTime} ya está marcada como completa y no admite más plazas.`
        );
      }

      const wantComplete = Boolean(input.isComplete);
      if (wantComplete && existing.length > 0) {
        throw new ConflictError(
          `Ya hay alumnos inscritos a las ${input.slotTime}; no se puede reservar como clase completa exclusiva.`
        );
      }

      const currentStudents = existing.reduce((sum, b) => sum + b.studentsCount, 0);
      if (currentStudents + input.studentsCount > ACADEMY_MAX_STUDENTS) {
        throw new ConflictError(
          `Solo quedan ${Math.max(
            0,
            ACADEMY_MAX_STUDENTS - currentStudents
          )} plaza(s) en la clase de las ${input.slotTime}.`
        );
      }

      const inserted = await tx
        .insert(academyBookings)
        .values({
          courseId: guitiriz.id,
          userId: input.userId,
          instructor: ACADEMY_INSTRUCTOR,
          date: input.date,
          slotTime: input.slotTime,
          studentsCount: input.studentsCount,
          studentName: trimmedStudentName,
          studentPhone: (input.studentPhone || '').trim(),
          isComplete: wantComplete,
          level: (input.level || 'Perfeccionamiento').trim(),
          mewsStatus: 'PENDING_RECEPTION',
          status: 'confirmed',
          notes: (input.notes || '').trim(),
        })
        .returning();

      return inserted[0];
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    console.error('Error creating academy booking:', error);
    throw new Error('Error al reservar la clase de golf', { cause: error });
  }
}

export async function listAcademyBookings(filters: { date?: string; userId?: number }) {
  try {
    const rows = await db
      .select({
        id: academyBookings.id,
        date: academyBookings.date,
        slotTime: academyBookings.slotTime,
        instructor: academyBookings.instructor,
        studentsCount: academyBookings.studentsCount,
        studentName: academyBookings.studentName,
        studentPhone: academyBookings.studentPhone,
        isComplete: academyBookings.isComplete,
        level: academyBookings.level,
        mewsStatus: academyBookings.mewsStatus,
        status: academyBookings.status,
        notes: academyBookings.notes,
        createdAt: academyBookings.createdAt,
        courseName: courses.name,
        userId: users.id,
        userEmail: users.email,
        userNombre: users.nombre,
        userApellidos: users.apellidos,
        userLicencia: users.licencia,
        userTelefono: users.telefono,
      })
      .from(academyBookings)
      .innerJoin(courses, eq(academyBookings.courseId, courses.id))
      .innerJoin(users, eq(academyBookings.userId, users.id))
      .orderBy(desc(academyBookings.date), asc(academyBookings.slotTime));

    return rows.filter((row) => {
      if (filters.date && row.date !== filters.date) return false;
      if (filters.userId && row.userId !== filters.userId) return false;
      return true;
    });
  } catch (error) {
    console.error('Error listing academy bookings:', error);
    throw new Error('Error al obtener las reservas de clases', { cause: error });
  }
}

export async function updateAcademyBookingStatus(input: {
  id: number;
  requesterId: number;
  isStaff: boolean;
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
}) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(academyBookings)
        .where(eq(academyBookings.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de clase no encontrada.');
      }
      const row = existing[0];

      const hasStaffEditFields =
        input.userId !== undefined ||
        input.date !== undefined ||
        input.slotTime !== undefined ||
        input.studentsCount !== undefined ||
        input.studentName !== undefined ||
        input.studentPhone !== undefined ||
        input.isComplete !== undefined ||
        input.level !== undefined ||
        input.notes !== undefined;

      if (!input.isStaff && row.userId !== input.requesterId) {
        throw new ValidationError('No tienes permiso para modificar esta reserva.');
      }
      if (!input.isStaff && input.status && input.status !== 'cancelled') {
        throw new ValidationError('Solo recepción o el profesor pueden cambiar este estado.');
      }
      if (!input.isStaff && input.mewsStatus) {
        throw new ValidationError('Solo recepción o el profesor pueden actualizar el estado de cobro.');
      }
      if (!input.isStaff && hasStaffEditFields) {
        throw new ValidationError(
          'Solo los superusuarios o el profesor pueden editar los datos de la clase.'
        );
      }

      const allowedStatuses = new Set(['confirmed', 'completed', 'cancelled']);
      const allowedMewsStatuses = new Set(['PENDING_RECEPTION', 'BILLED_MEWS', 'CANCELLED']);

      const nextStatus = input.status ?? row.status;
      if (!allowedStatuses.has(nextStatus)) {
        throw new ValidationError('Estado de clase no válido.');
      }

      const nextMewsStatus =
        nextStatus === 'cancelled' ? 'CANCELLED' : input.mewsStatus ?? row.mewsStatus;
      if (!allowedMewsStatuses.has(nextMewsStatus)) {
        throw new ValidationError('Estado de cobro no válido.');
      }

      const nextUserId = input.userId ?? row.userId;
      if (input.userId !== undefined && input.userId !== row.userId) {
        const userRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (userRows.length === 0) {
          throw new NotFoundError('Usuario titular no encontrado.');
        }
      }

      const nextDate = input.date ?? row.date;
      if (!isValidIsoDate(nextDate) || !isWednesdayIsoDate(nextDate)) {
        throw new ValidationError(
          'Las clases con Víctor López en Guitiriz se imparten únicamente los miércoles.'
        );
      }

      const nextSlotTime = input.slotTime ?? row.slotTime;
      if (!ACADEMY_ALL_SLOTS.includes(nextSlotTime)) {
        throw new ValidationError(
          'Horario no válido. Las clases son de 30 minutos de 11:00 a 14:00 y de 16:00 a 18:00.'
        );
      }

      const nextStudentsCount = input.studentsCount ?? row.studentsCount;
      if (!Number.isInteger(nextStudentsCount) || nextStudentsCount < 1 || nextStudentsCount > 4) {
        throw new ValidationError('El máximo de alumnos por clase es de 4.');
      }

      const nextIsComplete =
        input.isComplete !== undefined ? Boolean(input.isComplete) : row.isComplete;

      if (
        nextStatus !== 'cancelled' &&
        (nextDate !== row.date ||
          nextSlotTime !== row.slotTime ||
          nextStudentsCount !== row.studentsCount ||
          nextIsComplete !== row.isComplete ||
          (row.status === 'cancelled' && nextStatus !== 'cancelled'))
      ) {
        const otherBookings = await tx
          .select()
          .from(academyBookings)
          .where(
            and(
              eq(academyBookings.courseId, row.courseId),
              eq(academyBookings.date, nextDate),
              eq(academyBookings.slotTime, nextSlotTime),
              ne(academyBookings.status, 'cancelled'),
              ne(academyBookings.id, input.id)
            )
          );

        if (otherBookings.some((b) => b.isComplete)) {
          throw new ConflictError(
            `La clase de las ${nextSlotTime} ya está marcada como completa y no admite más plazas.`
          );
        }
        if (nextIsComplete && otherBookings.length > 0) {
          throw new ConflictError(
            `Ya existen otras reservas en la franja de las ${nextSlotTime}; no se puede marcar como clase completa exclusiva.`
          );
        }

        const bookedOthers = otherBookings.reduce((sum, b) => sum + b.studentsCount, 0);
        if (bookedOthers + nextStudentsCount > ACADEMY_MAX_STUDENTS) {
          throw new ConflictError(
            `Solo quedan ${Math.max(
              0,
              ACADEMY_MAX_STUDENTS - bookedOthers
            )} plaza(s) disponibles en la clase de las ${nextSlotTime}.`
          );
        }
      }

      const nextStudentName =
        input.studentName !== undefined ? input.studentName.trim() : row.studentName;
      if (input.studentName !== undefined && !nextStudentName) {
        throw new ValidationError('Debes indicar al menos un nombre de alumno.');
      }

      const updated = await tx
        .update(academyBookings)
        .set({
          userId: nextUserId,
          date: nextDate,
          slotTime: nextSlotTime,
          studentsCount: nextStudentsCount,
          studentName: nextStudentName,
          studentPhone:
            input.studentPhone !== undefined ? input.studentPhone.trim() : row.studentPhone,
          isComplete: nextIsComplete,
          level: input.level !== undefined ? input.level.trim() : row.level,
          notes: input.notes !== undefined ? input.notes.trim() : row.notes,
          status: nextStatus,
          mewsStatus: nextMewsStatus,
        })
        .where(eq(academyBookings.id, input.id))
        .returning();

      return updated[0];
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    console.error('Error updating academy booking:', error);
    throw new Error('Error al actualizar la reserva de clase', { cause: error });
  }
}

export async function getCentralFleetOverview(date: string, checkStartTime = '10:00') {
  if (!isValidIsoDate(date)) {
    throw new ValidationError('Fecha no válida.');
  }
  try {
    const [allCourses, allVehicles, dayReservations] = await Promise.all([
      db.select().from(courses).orderBy(asc(courses.holes)),
      db.select().from(vehicles).orderBy(asc(vehicles.code)),
      db
        .select({
          id: vehicleReservations.id,
          vehicleId: vehicleReservations.vehicleId,
          courseId: vehicleReservations.courseId,
          userId: vehicleReservations.userId,
          teeTimeReservationId: vehicleReservations.teeTimeReservationId,
          date: vehicleReservations.date,
          startTime: vehicleReservations.startTime,
          endTime: vehicleReservations.endTime,
          mewsStatus: vehicleReservations.mewsStatus,
          status: vehicleReservations.status,
          notes: vehicleReservations.notes,
          userNombre: users.nombre,
          userApellidos: users.apellidos,
          userEmail: users.email,
        })
        .from(vehicleReservations)
        .innerJoin(users, eq(vehicleReservations.userId, users.id))
        .where(eq(vehicleReservations.date, date))
        .orderBy(asc(vehicleReservations.startTime)),
    ]);

    const courseMap = new Map(allCourses.map((c) => [c.id, c]));

    const vehiclesWithState = allVehicles.map((v) => {
      const course = courseMap.get(v.courseId);
      const duration = getEffectiveVehicleDuration(course?.roundDurationMinutes);
      const checkEndTime = addMinutesToTime(checkStartTime, duration);
      const activeReservations = dayReservations
        .filter((r) => r.vehicleId === v.id && r.status !== 'cancelled')
        .map((r) => ({
          ...r,
          endTime: getEffectiveVehicleBlockEnd(r.startTime, r.endTime, duration),
        }));
      const busyAtSelectedTime = activeReservations.some((r) =>
        timesOverlap(checkStartTime, checkEndTime, r.startTime, r.endTime)
      );

      return {
        ...v,
        courseSlug: course?.slug || '',
        courseName: course?.name || '',
        busyAtSelectedTime,
        reservationsToday: activeReservations,
      };
    });

    return {
      date,
      checkStartTime,
      courses: allCourses,
      vehicles: vehiclesWithState,
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    console.error('Error loading central fleet overview:', error);
    throw new Error('Error al consultar la flota centralizada', { cause: error });
  }
}

export async function createStandaloneVehicleReservation(input: {
  courseSlug: string;
  vehicleType: 'buggy' | 'electric_trolley';
  vehicleId?: number;
  userId: number;
  date: string;
  startTime: string;
  notes?: string;
}) {
  if (!isValidIsoDate(input.date)) {
    throw new ValidationError('Fecha no válida.');
  }
  if (timeToMinutes(input.startTime) < 8 * 60 + 30 || timeToMinutes(input.startTime) > 19 * 60) {
    throw new ValidationError('Horario de uso permitido entre 08:30 y 19:00.');
  }

  try {
    return await db.transaction(async (tx) => {
      const [courseRows, titularRows] = await Promise.all([
        tx.select().from(courses).where(eq(courses.slug, input.courseSlug)).limit(1),
        tx.select().from(users).where(eq(users.id, input.userId)).limit(1),
      ]);
      if (courseRows.length === 0) {
        throw new NotFoundError('Campo de golf no encontrado.');
      }
      if (titularRows.length === 0) {
        throw new NotFoundError('Usuario titular no encontrado.');
      }
      const course = courseRows[0];
      const vehicleDuration = getEffectiveVehicleDuration(course.roundDurationMinutes);
      const endTime = addMinutesToTime(input.startTime, vehicleDuration);

      const candidateVehicles = await tx
        .select()
        .from(vehicles)
        .where(
          and(
            eq(vehicles.courseId, course.id),
            eq(vehicles.type, input.vehicleType),
            eq(vehicles.status, 'operational')
          )
        )
        .orderBy(asc(vehicles.code));

      const dayRes = await tx
        .select()
        .from(vehicleReservations)
        .where(
          and(
            eq(vehicleReservations.courseId, course.id),
            eq(vehicleReservations.date, input.date),
            ne(vehicleReservations.status, 'cancelled')
          )
        );

      const busyIds = new Set(
        dayRes
          .filter((r) =>
            timesOverlap(
              input.startTime,
              endTime,
              r.startTime,
              getEffectiveVehicleBlockEnd(r.startTime, r.endTime, vehicleDuration)
            )
          )
          .map((r) => r.vehicleId)
      );

      let chosen = input.vehicleId
        ? candidateVehicles.find((v) => v.id === input.vehicleId && !busyIds.has(v.id))
        : candidateVehicles.find((v) => !busyIds.has(v.id));

      if (!chosen) {
        const label = input.vehicleType === 'buggy' ? 'buggies' : 'carros eléctricos';
        throw new ConflictError(
          `No hay ${label} disponibles en ${course.name} en la franja ${input.startTime}–${endTime}.`
        );
      }

      const inserted = await tx
        .insert(vehicleReservations)
        .values({
          vehicleId: chosen.id,
          courseId: course.id,
          userId: input.userId,
          date: input.date,
          startTime: input.startTime,
          endTime,
          mewsStatus: 'PENDING_RECEPTION',
          status: 'reserved',
          notes: (input.notes || 'Reserva directa de equipo').trim(),
        })
        .returning();

      return {
        reservation: inserted[0],
        vehicle: chosen,
      };
    });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof NotFoundError ||
      error instanceof ConflictError
    ) {
      throw error;
    }
    console.error('Error creating standalone vehicle reservation:', error);
    throw new Error('Error al reservar el vehículo', { cause: error });
  }
}

export async function updateVehicleStatus(input: {
  vehicleId: number;
  status: 'operational' | 'maintenance';
  notes?: string;
  managedCourseSlugs?: string[];
}) {
  try {
    const existingRows = await db
      .select({
        id: vehicles.id,
        courseSlug: courses.slug,
        courseName: courses.name,
      })
      .from(vehicles)
      .innerJoin(courses, eq(vehicles.courseId, courses.id))
      .where(eq(vehicles.id, input.vehicleId))
      .limit(1);

    if (existingRows.length === 0) {
      throw new NotFoundError('Vehículo no encontrado.');
    }

    if (
      input.managedCourseSlugs &&
      !input.managedCourseSlugs.includes(existingRows[0].courseSlug)
    ) {
      throw new ForbiddenError(
        `Tu cuenta solo tiene permisos de consulta en ${existingRows[0].courseName}.`
      );
    }

    const updated = await db
      .update(vehicles)
      .set({
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes.trim() } : {}),
      })
      .where(eq(vehicles.id, input.vehicleId))
      .returning();

    if (updated.length === 0) {
      throw new NotFoundError('Vehículo no encontrado.');
    }
    return updated[0];
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) throw error;
    console.error('Error updating vehicle status:', error);
    throw new Error('Error al actualizar el estado del vehículo', { cause: error });
  }
}

export async function listVehicleReservations(filters: {
  date?: string;
  courseSlug?: string;
  userId?: number;
}) {
  try {
    const rows = await db
      .select({
        id: vehicleReservations.id,
        vehicleId: vehicleReservations.vehicleId,
        vehicleCode: vehicles.code,
        vehicleBrand: vehicles.brand,
        vehicleType: vehicles.type,
        vehicleLabel: vehicles.label,
        courseId: courses.id,
        courseSlug: courses.slug,
        courseName: courses.name,
        teeTimeReservationId: vehicleReservations.teeTimeReservationId,
        date: vehicleReservations.date,
        startTime: vehicleReservations.startTime,
        endTime: vehicleReservations.endTime,
        mewsStatus: vehicleReservations.mewsStatus,
        status: vehicleReservations.status,
        notes: vehicleReservations.notes,
        createdAt: vehicleReservations.createdAt,
        userId: users.id,
        userEmail: users.email,
        userNombre: users.nombre,
        userApellidos: users.apellidos,
        userLicencia: users.licencia,
        userTelefono: users.telefono,
      })
      .from(vehicleReservations)
      .innerJoin(vehicles, eq(vehicleReservations.vehicleId, vehicles.id))
      .innerJoin(courses, eq(vehicleReservations.courseId, courses.id))
      .innerJoin(users, eq(vehicleReservations.userId, users.id))
      .orderBy(desc(vehicleReservations.date), asc(vehicleReservations.startTime));

    return rows.filter((row) => {
      if (filters.date && row.date !== filters.date) return false;
      if (filters.courseSlug && row.courseSlug !== filters.courseSlug) return false;
      if (filters.userId && row.userId !== filters.userId) return false;
      return true;
    });
  } catch (error) {
    console.error('Error listing vehicle reservations:', error);
    throw new Error('Error al obtener las reservas de vehículos', { cause: error });
  }
}

export async function updateVehicleReservationStatus(input: {
  id: number;
  requesterId: number;
  isStaff: boolean;
  managedCourseSlugs?: string[];
  status?: string;
  mewsStatus?: string;
  userId?: number;
  vehicleId?: number;
  date?: string;
  startTime?: string;
  notes?: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(vehicleReservations)
        .where(eq(vehicleReservations.id, input.id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de vehículo no encontrada.');
      }
      const row = existing[0];

      const currentCourseRows = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, row.courseId))
        .limit(1);
      const currentCourse = currentCourseRows[0];

      if (
        input.isStaff &&
        input.managedCourseSlugs &&
        currentCourse &&
        !input.managedCourseSlugs.includes(currentCourse.slug)
      ) {
        throw new ForbiddenError(
          `Tu cuenta solo tiene permisos de consulta en ${currentCourse.name}.`
        );
      }

      const hasStaffEditFields =
        input.userId !== undefined ||
        input.vehicleId !== undefined ||
        input.date !== undefined ||
        input.startTime !== undefined ||
        input.notes !== undefined;

      if (!input.isStaff && row.userId !== input.requesterId) {
        throw new ValidationError('No tienes permiso para modificar esta reserva.');
      }
      if (!input.isStaff && input.status && input.status !== 'cancelled') {
        throw new ValidationError('Solo recepción puede cambiar el estado operativo.');
      }
      if (!input.isStaff && input.mewsStatus) {
        throw new ValidationError('Solo recepción puede actualizar el estado de cobro.');
      }
      if (!input.isStaff && hasStaffEditFields) {
        throw new ValidationError('Solo recepción o administración puede editar los datos del vehículo reservado.');
      }

      const allowedStatuses = new Set(['reserved', 'in_use', 'returned', 'cancelled']);
      const allowedMewsStatuses = new Set(['PENDING_RECEPTION', 'BILLED_MEWS', 'CANCELLED']);

      const nextStatus = input.status ?? row.status;
      if (!allowedStatuses.has(nextStatus)) {
        throw new ValidationError('Estado de reserva de vehículo no válido.');
      }

      const nextMewsStatus =
        nextStatus === 'cancelled' ? 'CANCELLED' : input.mewsStatus ?? row.mewsStatus;
      if (!allowedMewsStatuses.has(nextMewsStatus)) {
        throw new ValidationError('Estado de cobro no válido.');
      }

      const nextUserId = input.userId ?? row.userId;
      if (input.userId !== undefined && input.userId !== row.userId) {
        const userRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        if (userRows.length === 0) {
          throw new NotFoundError('Usuario titular no encontrado.');
        }
      }

      const nextVehicleId = input.vehicleId ?? row.vehicleId;
      const vehicleRows = await tx
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, nextVehicleId))
        .limit(1);
      if (vehicleRows.length === 0) {
        throw new NotFoundError('Vehículo no encontrado.');
      }
      const targetVehicle = vehicleRows[0];
      if (
        nextStatus !== 'cancelled' &&
        input.vehicleId !== undefined &&
        targetVehicle.status !== 'operational'
      ) {
        throw new ConflictError(`La unidad ${targetVehicle.code} está en mantenimiento.`);
      }

      const nextCourseId = targetVehicle.courseId;
      const courseRows = await tx
        .select()
        .from(courses)
        .where(eq(courses.id, nextCourseId))
        .limit(1);
      const targetCourse = courseRows[0];
      if (
        input.isStaff &&
        input.managedCourseSlugs &&
        targetCourse &&
        !input.managedCourseSlugs.includes(targetCourse.slug)
      ) {
        throw new ForbiddenError(
          `Tu cuenta solo tiene permisos de consulta en ${targetCourse.name}.`
        );
      }
      const roundDuration = getEffectiveVehicleDuration(targetCourse?.roundDurationMinutes);

      const nextDate = input.date ?? row.date;
      if (!isValidIsoDate(nextDate)) {
        throw new ValidationError('Fecha no válida.');
      }

      const nextStartTime = input.startTime ?? row.startTime;
      const startMins = timeToMinutes(nextStartTime);
      if (startMins < 8 * 60 + 30 || startMins > 19 * 60) {
        throw new ValidationError('Horario de uso permitido entre 08:30 y 19:00.');
      }
      const nextEndTime = addMinutesToTime(nextStartTime, roundDuration);

      if (
        nextStatus !== 'cancelled' &&
        (nextVehicleId !== row.vehicleId ||
          nextDate !== row.date ||
          nextStartTime !== row.startTime ||
          (row.status === 'cancelled' && nextStatus !== 'cancelled'))
      ) {
        const sameDayVehicleRes = await tx
          .select()
          .from(vehicleReservations)
          .where(
            and(
              eq(vehicleReservations.vehicleId, nextVehicleId),
              eq(vehicleReservations.date, nextDate),
              ne(vehicleReservations.status, 'cancelled'),
              ne(vehicleReservations.id, input.id)
            )
          );
        const clash = sameDayVehicleRes.some((other) =>
          timesOverlap(
            nextStartTime,
            nextEndTime,
            other.startTime,
            getEffectiveVehicleBlockEnd(other.startTime, other.endTime, roundDuration)
          )
        );
        if (clash) {
          throw new ConflictError(
            `La unidad ${targetVehicle.code} ya está ocupada entre ${nextStartTime} y ${nextEndTime} el ${nextDate}.`
          );
        }
      }

      const updated = await tx
        .update(vehicleReservations)
        .set({
          userId: nextUserId,
          vehicleId: nextVehicleId,
          courseId: nextCourseId,
          date: nextDate,
          startTime: nextStartTime,
          endTime: nextEndTime,
          notes: input.notes !== undefined ? input.notes.trim() : row.notes,
          status: nextStatus,
          mewsStatus: nextMewsStatus,
        })
        .where(eq(vehicleReservations.id, input.id))
        .returning();

      return updated[0];
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }
    console.error('Error updating vehicle reservation:', error);
    throw new Error('Error al actualizar la reserva de vehículo', { cause: error });
  }
}

export async function ensureCatalogAndFleetSync() {
  try {
    await db.transaction(async (tx) => {
      const existingCourses = await tx.select().from(courses);
      let guitiriz = existingCourses.find((c) => c.slug === 'guitiriz');
      let aguasSantas = existingCourses.find((c) => c.slug === 'aguas-santas');

      if (!guitiriz) {
        const inserted = await tx
          .insert(courses)
          .values({
            slug: 'guitiriz',
            name: 'Golf Guitiriz',
            holes: 9,
            par: 35,
            buggiesCount: 2,
            trolleysCount: 6,
            roundDurationMinutes: VEHICLE_ROUND_DURATION_MINUTES,
            location: 'Guitiriz, Lugo',
            hotelName: 'Hotel Balneario de Guitiriz',
          })
          .returning();
        guitiriz = inserted[0];
      } else if (
        guitiriz.trolleysCount !== 6 ||
        guitiriz.buggiesCount !== 2 ||
        guitiriz.roundDurationMinutes !== VEHICLE_ROUND_DURATION_MINUTES
      ) {
        const updated = await tx
          .update(courses)
          .set({
            buggiesCount: 2,
            trolleysCount: 6,
            roundDurationMinutes: VEHICLE_ROUND_DURATION_MINUTES,
          })
          .where(eq(courses.id, guitiriz.id))
          .returning();
        guitiriz = updated[0];
      }

      if (!aguasSantas) {
        const inserted = await tx
          .insert(courses)
          .values({
            slug: 'aguas-santas',
            name: 'Golf Aguas Santas',
            holes: 18,
            par: 71,
            buggiesCount: 10,
            trolleysCount: 6,
            roundDurationMinutes: VEHICLE_ROUND_DURATION_MINUTES,
            location: 'Pantón · Ribeira Sacra, Lugo',
            hotelName: 'Hotel Balneario de Aguas Santas',
          })
          .returning();
        aguasSantas = inserted[0];
      } else if (
        aguasSantas.trolleysCount !== 6 ||
        aguasSantas.buggiesCount !== 10 ||
        aguasSantas.roundDurationMinutes !== VEHICLE_ROUND_DURATION_MINUTES
      ) {
        const updated = await tx
          .update(courses)
          .set({
            buggiesCount: 10,
            trolleysCount: 6,
            roundDurationMinutes: VEHICLE_ROUND_DURATION_MINUTES,
          })
          .where(eq(courses.id, aguasSantas.id))
          .returning();
        aguasSantas = updated[0];
      }

      const expectedUnits = [
        // Guitiriz: 2 buggies YAMAHA + 6 carros eléctricos
        {
          courseId: guitiriz.id,
          code: 'GUI-BUG-01',
          type: 'buggy',
          brand: 'YAMAHA',
          label: 'Buggy 01 · YAMAHA · Guitiriz',
        },
        {
          courseId: guitiriz.id,
          code: 'GUI-BUG-02',
          type: 'buggy',
          brand: 'YAMAHA',
          label: 'Buggy 02 · YAMAHA · Guitiriz',
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          courseId: guitiriz.id,
          code: `GUI-CAR-0${i + 1}`,
          type: 'electric_trolley',
          brand: '',
          label: `Carro Eléctrico 0${i + 1} · Guitiriz`,
        })),
        // Aguas Santas: 2 buggies YAMAHA + 8 buggies DEHOU + 6 carros eléctricos
        {
          courseId: aguasSantas.id,
          code: 'AGU-BUG-01',
          type: 'buggy',
          brand: 'YAMAHA',
          label: 'Buggy 01 · YAMAHA · Aguas Santas',
        },
        {
          courseId: aguasSantas.id,
          code: 'AGU-BUG-02',
          type: 'buggy',
          brand: 'YAMAHA',
          label: 'Buggy 02 · YAMAHA · Aguas Santas',
        },
        ...Array.from({ length: 8 }, (_, i) => {
          const num = String(i + 3).padStart(2, '0');
          return {
            courseId: aguasSantas.id,
            code: `AGU-BUG-${num}`,
            type: 'buggy',
            brand: 'DEHOU',
            label: `Buggy ${num} · DEHOU · Aguas Santas`,
          };
        }),
        ...Array.from({ length: 6 }, (_, i) => ({
          courseId: aguasSantas.id,
          code: `AGU-CAR-0${i + 1}`,
          type: 'electric_trolley',
          brand: '',
          label: `Carro Eléctrico 0${i + 1} · Aguas Santas`,
        })),
      ];

      const allExistingVehicles = await tx.select().from(vehicles).orderBy(asc(vehicles.code));
      const existingByCode = new Map(allExistingVehicles.map((v) => [v.code, v]));

      for (const unit of expectedUnits) {
        const existing = existingByCode.get(unit.code);
        if (!existing) {
          await tx.insert(vehicles).values({
            courseId: unit.courseId,
            code: unit.code,
            type: unit.type,
            brand: unit.brand,
            label: unit.label,
            status: 'operational',
            notes: '',
          });
        } else if (
          existing.courseId !== unit.courseId ||
          existing.type !== unit.type ||
          existing.brand !== unit.brand ||
          existing.label !== unit.label
        ) {
          await tx
            .update(vehicles)
            .set({
              courseId: unit.courseId,
              type: unit.type,
              brand: unit.brand,
              label: unit.label,
            })
            .where(eq(vehicles.id, existing.id));
        }
      }

      // Remove any surplus vehicles on both courses not in expectedUnits (e.g. GUI-CAR-07, AGU-CAR-07)
      const expectedCodeSet = new Set(expectedUnits.map((u) => u.code));
      const surplusVehicles = allExistingVehicles.filter((v) => !expectedCodeSet.has(v.code));

      if (surplusVehicles.length > 0) {
        const canonicalVehicles = (
          await tx.select().from(vehicles).orderBy(asc(vehicles.code))
        ).filter((v) => expectedCodeSet.has(v.code));

        for (const extra of surplusVehicles) {
          const validTargets = canonicalVehicles.filter(
            (v) => v.courseId === extra.courseId && v.type === extra.type
          );
          const linkedReservations = await tx
            .select()
            .from(vehicleReservations)
            .where(eq(vehicleReservations.vehicleId, extra.id));

          for (const lr of linkedReservations) {
            if (lr.status !== 'cancelled' && validTargets.length > 0) {
              const targetIds = validTargets.map((t) => t.id);
              const sameDayRes = await tx
                .select()
                .from(vehicleReservations)
                .where(
                  and(
                    eq(vehicleReservations.date, lr.date),
                    inArray(vehicleReservations.vehicleId, targetIds),
                    ne(vehicleReservations.status, 'cancelled')
                  )
                );
              const lrEnd = getEffectiveVehicleBlockEnd(
                lr.startTime,
                lr.endTime,
                VEHICLE_ROUND_DURATION_MINUTES
              );
              const freeTarget = validTargets.find(
                (t) =>
                  !sameDayRes.some(
                    (other) =>
                      other.vehicleId === t.id &&
                      timesOverlap(
                        lr.startTime,
                        lrEnd,
                        other.startTime,
                        getEffectiveVehicleBlockEnd(
                          other.startTime,
                          other.endTime,
                          VEHICLE_ROUND_DURATION_MINUTES
                        )
                      )
                  )
              );
              if (freeTarget) {
                await tx
                  .update(vehicleReservations)
                  .set({ vehicleId: freeTarget.id })
                  .where(eq(vehicleReservations.id, lr.id));
                continue;
              }
            }
            await tx.delete(vehicleReservations).where(eq(vehicleReservations.id, lr.id));
          }

          await tx.delete(vehicles).where(eq(vehicles.id, extra.id));
        }
      }

      // Normalize active vehicle reservations so 9-hole rounds stay 120 min and 18-hole / standalone stay 240 min
      const [activeVehicleRes, teeTimeHolesRows] = await Promise.all([
        tx
          .select()
          .from(vehicleReservations)
          .where(ne(vehicleReservations.status, 'cancelled')),
        tx
          .select({ id: teeTimeReservations.id, holes: teeTimeReservations.holes })
          .from(teeTimeReservations),
      ]);
      const holesByTeeTimeId = new Map<number, number>(
        teeTimeHolesRows.map((row) => [row.id, row.holes])
      );

      for (const vr of activeVehicleRes) {
        const linkedHoles = vr.teeTimeReservationId
          ? holesByTeeTimeId.get(vr.teeTimeReservationId) ?? 18
          : 18;
        const expectedDuration = getRoundDurationMinutes(linkedHoles);
        const startMins = timeToMinutes(vr.startTime);
        const storedEndMins = timeToMinutes(vr.endTime);
        const minEndMins = startMins >= 0 ? startMins + expectedDuration : -1;
        if (minEndMins >= 0 && storedEndMins < minEndMins) {
          await tx
            .update(vehicleReservations)
            .set({ endTime: minutesToTime(minEndMins) })
            .where(eq(vehicleReservations.id, vr.id));
        }
      }
    });
  } catch (error) {
    console.error('Error syncing catalog and fleet:', error);
  }
}

export async function deleteCancelledTeeTimeReservation(
  id: number,
  managedCourseSlugs?: string[]
) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: teeTimeReservations.id,
          status: teeTimeReservations.status,
          courseSlug: courses.slug,
          courseName: courses.name,
        })
        .from(teeTimeReservations)
        .innerJoin(courses, eq(teeTimeReservations.courseId, courses.id))
        .where(eq(teeTimeReservations.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de tee time no encontrada.');
      }
      if (managedCourseSlugs && !managedCourseSlugs.includes(existing[0].courseSlug)) {
        throw new ForbiddenError(
          `Tu cuenta solo tiene permisos de consulta en ${existing[0].courseName}.`
        );
      }
      if (existing[0].status !== 'cancelled') {
        throw new ValidationError('Solo se pueden borrar reservas de tee time que estén canceladas.');
      }

      await tx.delete(vehicleReservations).where(eq(vehicleReservations.teeTimeReservationId, id));
      await tx.delete(teeTimeReservations).where(eq(teeTimeReservations.id, id));
      return { deletedId: id };
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }
    console.error('Error deleting cancelled tee time reservation:', error);
    throw new Error('Error al borrar la reserva cancelada', { cause: error });
  }
}

export async function deleteCancelledAcademyBooking(id: number) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(academyBookings)
        .where(eq(academyBookings.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de clase no encontrada.');
      }
      if (existing[0].status !== 'cancelled') {
        throw new ValidationError('Solo se pueden borrar reservas de clase que estén canceladas.');
      }

      await tx.delete(academyBookings).where(eq(academyBookings.id, id));
      return { deletedId: id };
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    console.error('Error deleting cancelled academy booking:', error);
    throw new Error('Error al borrar la clase cancelada', { cause: error });
  }
}

export async function deleteCancelledVehicleReservation(
  id: number,
  managedCourseSlugs?: string[]
) {
  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: vehicleReservations.id,
          status: vehicleReservations.status,
          courseSlug: courses.slug,
          courseName: courses.name,
        })
        .from(vehicleReservations)
        .innerJoin(courses, eq(vehicleReservations.courseId, courses.id))
        .where(eq(vehicleReservations.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new NotFoundError('Reserva de vehículo no encontrada.');
      }
      if (managedCourseSlugs && !managedCourseSlugs.includes(existing[0].courseSlug)) {
        throw new ForbiddenError(
          `Tu cuenta solo tiene permisos de consulta en ${existing[0].courseName}.`
        );
      }
      if (existing[0].status !== 'cancelled') {
        throw new ValidationError('Solo se pueden borrar reservas de vehículos que estén canceladas.');
      }

      await tx.delete(vehicleReservations).where(eq(vehicleReservations.id, id));
      return { deletedId: id };
    });
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }
    console.error('Error deleting cancelled vehicle reservation:', error);
    throw new Error('Error al borrar la reserva cancelada del vehículo', { cause: error });
  }
}
