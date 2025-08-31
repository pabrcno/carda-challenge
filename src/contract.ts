import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  healthResponseSchema,
  errorResponseSchema,
  patientIdParamSchema,
  patientIdAndPeriodParamSchema,

  postHeartRateDataSchema,
  postBloodPressureDataSchema,
  postWeightDataSchema,
  
  heartRateChartDataSchema,
  bloodPressureChartDataSchema,
  weightChartDataSchema,
  
  latestHeartRateSchema,
  selectHeartRateRecordSchema,

  insertPatientSchema,
  selectPatientSchema,
  chartPeriodEnumSchema,
} from './db/schema';

const c = initContract();

export const contract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: {
      200: healthResponseSchema,
    },
    summary: 'Health check endpoint',
  },

  createPatient: {
    method: 'POST',
    path: '/patients',
    body: insertPatientSchema,
    responses: {
      200: selectPatientSchema,
      400: errorResponseSchema,
      409: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Create a new patient',
  },

 
  postHeartRate: {
    method: 'POST',
    path: '/vitals/heart-rate',
    body: postHeartRateDataSchema,
    responses: {
      201: z.object({ message: z.string() }),
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Post heart rate data (Redis + conditional DB aggregation)',
  },

  postBloodPressure: {
    method: 'POST',
    path: '/vitals/blood-pressure',
    body: postBloodPressureDataSchema,
    responses: {
      201: z.object({ message: z.string() }),
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Post blood pressure data (stored directly in SQL)',
  },

  postWeight: {
    method: 'POST',
    path: '/vitals/weight',
    body: postWeightDataSchema,
    responses: {
      201: z.object({ message: z.string() }),
      400: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Post weight data (stored directly in SQL)',
  },

  getHeartRateChart: {
    method: 'GET',
    path: '/patients/:patientId/heart-rate/:period',
    pathParams: patientIdAndPeriodParamSchema,
    responses: {
      200: heartRateChartDataSchema,  
      404: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Get heart rate chart data for specified period (aggregated from Redis min/max)',
  },

  getBloodPressureChart: {
    method: 'GET',
    path: '/patients/:patientId/blood-pressure/:period',
    pathParams: patientIdAndPeriodParamSchema,
    responses: {
      200: bloodPressureChartDataSchema,
      404: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Get blood pressure chart data for specified period',
  },

  getWeightChart: {
    method: 'GET',
    path: '/patients/:patientId/weight/:period',
    pathParams: patientIdAndPeriodParamSchema,
    responses: {
      200: weightChartDataSchema,
      404: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Get weight chart data for specified period',
  },


  getHeartRateReadings: {
    method: 'GET',
    path: '/patients/:patientId/heart-rate/readings/:period',
    pathParams: patientIdAndPeriodParamSchema,
    responses: {
      200: z.array(z.object({
        id: z.number(),
        patientId: z.number(),
        bpm: z.number(),
        recordedAt: z.date(),
        createdAt: z.date(),
      })),
      404: errorResponseSchema,
      500: errorResponseSchema,
    },
    summary: 'Get raw heart rate readings for analysis (not shown to patients)',
  },
});

export type Contract = typeof contract;

