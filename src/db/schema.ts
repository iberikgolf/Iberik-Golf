import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  holes: integer('holes').notNull(),
  par: integer('par').notNull(),
  buggiesCount: integer('buggies_count').notNull(),
  trolleysCount: integer('trolleys_count').notNull(),
  roundDurationMinutes: integer('round_duration_minutes').notNull(),
  location: text('location').notNull(),
  hotelName: text('hotel_name').notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull().default(''),
  apellidos: text('apellidos').notNull().default(''),
  telefono: text('telefono').notNull().default(''),
  licencia: text('licencia').notNull().default(''),
  poblacion: text('poblacion').notNull().default(''),
  role: text('role').notNull().default('player'), // 'admin' | 'reception' | 'player'
  createdAt: timestamp('created_at').defaultNow(),
});

export const vehicles = pgTable('vehicles', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id)
    .notNull(),
  code: text('code').notNull().unique(),
  type: text('type').notNull(), // 'buggy' | 'electric_trolley'
  brand: text('brand').notNull().default(''),
  label: text('label').notNull(),
  status: text('status').notNull().default('operational'), // 'operational' | 'maintenance'
  notes: text('notes').notNull().default(''),
});

export const teeTimeReservations = pgTable('tee_time_reservations', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  slotTime: text('slot_time').notNull(), // HH:MM (08:30 - 19:00 every 10 min)
  holes: integer('holes').notNull().default(18), // 9 | 18
  playersCount: integer('players_count').notNull().default(1),
  playerNames: text('player_names').notNull().default(''),
  isComplete: boolean('is_complete').notNull().default(false),
  buggiesRequested: integer('buggies_requested').notNull().default(0),
  trolleysRequested: integer('trolleys_requested').notNull().default(0),
  paymentMethod: text('payment_method').notNull().default('RECEPTION_MEWS'),
  mewsStatus: text('mews_status').notNull().default('PENDING_RECEPTION'), // 'PENDING_RECEPTION' | 'BILLED_MEWS' | 'CANCELLED'
  mewsReference: text('mews_reference').notNull().default(''),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'checked_in' | 'cancelled'
  confirmationEmail: text('confirmation_email').notNull().default(''),
  confirmationSentAt: timestamp('confirmation_sent_at'),
  morningSentDate: text('morning_sent_date').notNull().default(''), // YYYY-MM-DD when 07:00 AM email was sent
  createdAt: timestamp('created_at').defaultNow(),
});

export const vehicleReservations = pgTable('vehicle_reservations', {
  id: serial('id').primaryKey(),
  vehicleId: integer('vehicle_id')
    .references(() => vehicles.id)
    .notNull(),
  courseId: integer('course_id')
    .references(() => courses.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  teeTimeReservationId: integer('tee_time_reservation_id').references(
    () => teeTimeReservations.id,
    { onDelete: 'cascade' }
  ),
  date: text('date').notNull(), // YYYY-MM-DD
  startTime: text('start_time').notNull(), // HH:MM
  endTime: text('end_time').notNull(), // HH:MM
  mewsStatus: text('mews_status').notNull().default('PENDING_RECEPTION'),
  status: text('status').notNull().default('reserved'), // 'reserved' | 'in_use' | 'returned' | 'cancelled'
  notes: text('notes').notNull().default(''),
  confirmationEmail: text('confirmation_email').notNull().default(''),
  confirmationSentAt: timestamp('confirmation_sent_at'),
  morningSentDate: text('morning_sent_date').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const academyBookings = pgTable('academy_bookings', {
  id: serial('id').primaryKey(),
  courseId: integer('course_id')
    .references(() => courses.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  instructor: text('instructor').notNull().default('Víctor López'),
  date: text('date').notNull(), // YYYY-MM-DD (Wednesday only)
  slotTime: text('slot_time').notNull(), // 30-min intervals
  studentsCount: integer('students_count').notNull().default(1),
  studentName: text('student_name').notNull().default(''),
  studentPhone: text('student_phone').notNull().default(''),
  isComplete: boolean('is_complete').notNull().default(false),
  level: text('level').notNull().default('Perfeccionamiento'),
  mewsStatus: text('mews_status').notNull().default('PENDING_RECEPTION'),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'completed' | 'cancelled'
  notes: text('notes').notNull().default(''),
  confirmationEmail: text('confirmation_email').notNull().default(''),
  confirmationSentAt: timestamp('confirmation_sent_at'),
  morningSentDate: text('morning_sent_date').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

export const emailLogs = pgTable('email_logs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(), // 'instant_confirmation' | 'daily_0700'
  reservationType: text('reservation_type').notNull(), // 'tee_time' | 'academy' | 'vehicle'
  reservationId: integer('reservation_id').notNull(),
  targetDate: text('target_date').notNull(), // YYYY-MM-DD
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  bodyPreview: text('body_preview').notNull().default(''),
  status: text('status').notNull().default('pending_smtp'), // 'sent' | 'pending_smtp' | 'failed'
  errorMessage: text('error_message').notNull().default(''),
  sentAt: timestamp('sent_at').defaultNow(),
});

export const coursesRelations = relations(courses, ({ many }) => ({
  vehicles: many(vehicles),
  teeTimeReservations: many(teeTimeReservations),
  vehicleReservations: many(vehicleReservations),
  academyBookings: many(academyBookings),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teeTimeReservations: many(teeTimeReservations),
  vehicleReservations: many(vehicleReservations),
  academyBookings: many(academyBookings),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  course: one(courses, {
    fields: [vehicles.courseId],
    references: [courses.id],
  }),
  reservations: many(vehicleReservations),
}));

export const teeTimeReservationsRelations = relations(teeTimeReservations, ({ one, many }) => ({
  course: one(courses, {
    fields: [teeTimeReservations.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [teeTimeReservations.userId],
    references: [users.id],
  }),
  vehicleReservations: many(vehicleReservations),
}));

export const vehicleReservationsRelations = relations(vehicleReservations, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [vehicleReservations.vehicleId],
    references: [vehicles.id],
  }),
  course: one(courses, {
    fields: [vehicleReservations.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [vehicleReservations.userId],
    references: [users.id],
  }),
  teeTimeReservation: one(teeTimeReservations, {
    fields: [vehicleReservations.teeTimeReservationId],
    references: [teeTimeReservations.id],
  }),
}));

export const academyBookingsRelations = relations(academyBookings, ({ one }) => ({
  course: one(courses, {
    fields: [academyBookings.courseId],
    references: [courses.id],
  }),
  user: one(users, {
    fields: [academyBookings.userId],
    references: [users.id],
  }),
}));

