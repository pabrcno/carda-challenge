import { pgTable, serial, varchar, timestamp, integer, real, date, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';



// NOTE: IDs are serial just for this test project. In production, we should use UUIDs.

export const patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  dateOfBirth: date('date_of_birth'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('patients_email_idx').on(table.email),
  index('patients_name_idx').on(table.name),
]);

export const heartRateAggregates = pgTable('heart_rate_aggregates', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  date: date('date').notNull(), 
  bpmMin: integer('bpm_min').notNull(),
  bpmMinRecordedAt: timestamp('bpm_min_recorded_at').notNull(),
  bpmMax: integer('bpm_max').notNull(),
  bpmMaxRecordedAt: timestamp('bpm_max_recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('heart_rate_patient_date_idx').on(table.patientId, table.date),
  index('heart_rate_date_idx').on(table.date),
]);

export const bloodPressureRecords = pgTable('blood_pressure_records', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  systolic: integer('systolic').notNull(),
  diastolic: integer('diastolic').notNull(),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('blood_pressure_patient_idx').on(table.patientId),
  index('blood_pressure_recorded_at_idx').on(table.recordedAt),
]);

export const weightRecords = pgTable('weight_records', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  weightKg: real('weight_kg').notNull(),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('weight_patient_idx').on(table.patientId),
  index('weight_recorded_at_idx').on(table.recordedAt),
]);

// NEW TABLE: Store all individual heart rate records for analysis
export const heartRateRecords = pgTable('heart_rate_records', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  bpm: integer('bpm').notNull(),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('heart_rate_records_patient_idx').on(table.patientId),
  index('heart_rate_records_recorded_at_idx').on(table.recordedAt),
  index('heart_rate_records_patient_date_idx').on(table.patientId, table.recordedAt),
]);


export const patientsRelations = relations(patients, ({ many }) => ({
  heartRateAggregates: many(heartRateAggregates),
  bloodPressureRecords: many(bloodPressureRecords),
  weightRecords: many(weightRecords),
  heartRateRecords: many(heartRateRecords),
}));

export const heartRateAggregatesRelations = relations(heartRateAggregates, ({ one }) => ({
  patient: one(patients, {
    fields: [heartRateAggregates.patientId],
    references: [patients.id],
  }),
}));

export const bloodPressureRecordsRelations = relations(bloodPressureRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [bloodPressureRecords.patientId],
    references: [patients.id],
  }),
}));

export const weightRecordsRelations = relations(weightRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [weightRecords.patientId],
    references: [patients.id],
  }),
}));

export const heartRateRecordsRelations = relations(heartRateRecords, ({ one }) => ({
  patient: one(patients, {
    fields: [heartRateRecords.patientId],
    references: [patients.id],
  }),
}));


// SINGLE SOURCE OF TRUTH: Patient schemas using drizzle-zod as the foundation
// Using type assertions to make them compatible with ts-rest

function makeApiCompatible<T = any>(schema: any): z.ZodType<T> {
  
  return schema as z.ZodType<T>;
}


export const selectPatientSchema = makeApiCompatible(createSelectSchema(patients));
export const insertPatientSchema = makeApiCompatible(createInsertSchema(patients, {
  name: (schema) => schema.min(1, 'Name is required').max(255, 'Name too long'),
  email: (schema) => schema.email('Invalid email format').max(255, 'Email too long'),
}).omit({ id: true, createdAt: true, updatedAt: true }));
export const updatePatientSchema = createUpdateSchema(patients).omit({ id: true, createdAt: true, updatedAt: true });


export const selectHeartRateAggregateSchema = createSelectSchema(heartRateAggregates);
export const insertHeartRateAggregateSchema = createInsertSchema(heartRateAggregates);
export const updateHeartRateAggregateSchema = createUpdateSchema(heartRateAggregates);

export const selectBloodPressureRecordSchema = createSelectSchema(bloodPressureRecords);
export const insertBloodPressureRecordSchema = createInsertSchema(bloodPressureRecords);
export const updateBloodPressureRecordSchema = createUpdateSchema(bloodPressureRecords);

export const selectWeightRecordSchema = createSelectSchema(weightRecords);
export const insertWeightRecordSchema = createInsertSchema(weightRecords);
export const updateWeightRecordSchema = createUpdateSchema(weightRecords);

export const selectHeartRateRecordSchema = createSelectSchema(heartRateRecords);
export const insertHeartRateRecordSchema = createInsertSchema(heartRateRecords);
export const updateHeartRateRecordSchema = createUpdateSchema(heartRateRecords);


export const postHeartRateDataSchema = z.object({
  patientId: z.number().positive('Patient ID must be positive'),
  bpm: z.number().min(20, 'Heart rate must be at least 20 BPM').max(300, 'Heart rate must not exceed 300 BPM'),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid timestamp'),
});

export const postBloodPressureDataSchema = z.object({
  patientId: z.number().positive('Patient ID must be positive'),
  systolic: z.number().min(50, 'Systolic pressure too low').max(300, 'Systolic pressure too high'),
  diastolic: z.number().min(30, 'Diastolic pressure too low').max(200, 'Diastolic pressure too high'),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid timestamp'),
});

const baseWeightSchema = createInsertSchema(weightRecords, {
  patientId: (schema) => schema.positive('Patient ID must be positive'),
  weightKg: (schema) => schema.min(1, 'Weight must be positive').max(1000, 'Weight too high'),
}).pick({ patientId: true, weightKg: true });

export const postWeightDataSchema = makeApiCompatible(
  baseWeightSchema.extend({
    timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid timestamp'),
  })
);


export const patientIdParamSchema = z.object({
  patientId: z.string()
    .regex(/^\d+$/, 'Patient ID must be a number')
    .transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num <= 0) {
        throw new Error('Patient ID must be a positive number');
      }
      return num;
    }),
});

export const chartPeriodEnumSchema = z.enum(['7_days', '31_days', '12_months']);
export type ChartPeriod = z.infer<typeof chartPeriodEnumSchema>;

export const chartPeriodParamSchema = z.object({
  period: chartPeriodEnumSchema,
});

// Schema for endpoints that need both patient ID and period
export const patientIdAndPeriodParamSchema = z.object({
  patientId: z.string()
    .regex(/^\d+$/, 'Patient ID must be a number')
    .transform((val) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num <= 0) {
        throw new Error('Patient ID must be a positive number');
      }
      return num;
    }),
  period: chartPeriodEnumSchema,
});

export const heartRateChartDataSchema = makeApiCompatible(
  z.array(z.object({
    date: z.string(),
    min: z.number(),
    max: z.number(),
  }))
);

export const bloodPressureChartDataSchema = makeApiCompatible(
  z.array(z.object({
    recordedAt: z.date(),
    systolic: z.number().int(),
    diastolic: z.number().int(),
  }))
);

export const weightChartDataSchema = makeApiCompatible(
  z.array(z.object({
    recordedAt: z.date(),
    weightKg: z.number(),
  }))
);

// Latest heart rate schema - matches Redis HeartRateReading interface
export const latestHeartRateSchema = z.object({
  patientId: z.number(),
  bpm: z.number(),
  timestamp: z.string(),
});

// Common response schemas
export const healthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
});

export const errorResponseSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export type PostHeartRateData = z.infer<typeof postHeartRateDataSchema>;
export type PostBloodPressureData = z.infer<typeof postBloodPressureDataSchema>;
export type PostWeightData = z.infer<typeof postWeightDataSchema>;
export type ChartPeriodParam = z.infer<typeof chartPeriodParamSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type BloodPressureSummary = z.infer<typeof bloodPressureChartDataSchema>[number];
export type WeightSummary = z.infer<typeof weightChartDataSchema>[number];
export type HeartRateSummary = z.infer<typeof heartRateChartDataSchema>[number];

export type DrizzlePatient = typeof patients.$inferSelect;
export type DrizzleNewPatient = typeof patients.$inferInsert;
export type DrizzleHeartRateAggregate = typeof heartRateAggregates.$inferSelect;
export type DrizzleNewHeartRateAggregate = typeof heartRateAggregates.$inferInsert;
export type DrizzleBloodPressureRecord = typeof bloodPressureRecords.$inferSelect;
export type DrizzleNewBloodPressureRecord = typeof bloodPressureRecords.$inferInsert;
export type DrizzleWeightRecord = typeof weightRecords.$inferSelect;
export type DrizzleNewWeightRecord = typeof weightRecords.$inferInsert;
export type DrizzleHeartRateRecord = typeof heartRateRecords.$inferSelect;
export type DrizzleNewHeartRateRecord = typeof heartRateRecords.$inferInsert;
