import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { contract } from './contract';
import { testConnection, closeConnection } from './db/connection';
import { VitalsService } from './services/vitals-service';
import { redisService } from './services/redis-service';

import { PatientService, PatientError } from './services/patient-service';



const app = express();
const PORT = process.env.PORT || 3000;

const s = initServer();

const patientService = new PatientService();
const vitalsService = new VitalsService();

app.use(cors());
app.use(express.json());

const router = s.router(contract, {
  health: async () => {
    return {
      status: 200,
      body: {
        status: 'OK',
        timestamp: new Date().toISOString(),
      },
    };
  },

  createPatient: async ({ body }) => {
    try {
      const newPatient = await patientService.createPatient(body);
      return {
        status: 200,
        body: newPatient,
      };
    } catch (error: any) {
      if (error instanceof PatientError) {
        return {
          status: error.statusCode,
          body: {
            message: error.message,
            code: error.code,
          },
        };
      }
      
      console.error('Error creating patient:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  postHeartRate: async ({ body }) => {
    try {
     

      await vitalsService.storeHeartRateReading(body);

      return {
        status: 201,
        body: {
          message: 'Heart rate data stored and processed',
        },
      };
    } catch (error) {
      console.error('Error posting heart rate data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  postBloodPressure: async ({ body }) => {
    try {
     
      await vitalsService.storeBloodPressureReading(body);

      return {
        status: 201,
        body: {
          message: 'Blood pressure data stored successfully',
        },
      };
    } catch (error) {
      console.error('Error posting blood pressure data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  postWeight: async ({ body }) => {
    try {
    
     

     
      await vitalsService.storeWeightReading(body);

      return {
        status: 201,
        body: {
          message: 'Weight data stored successfully',
        },
      };
    } catch (error) {
      console.error('Error posting weight data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  getHeartRateChart: async ({ params: { patientId, period } }) => {
    try {
   
      const data = await vitalsService.getHeartRateChartData(patientId, period);

      return {
        status: 200,
        body: data,
      };
    } catch (error) {
      console.error('Error getting heart rate chart data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  getBloodPressureChart: async ({ params: { patientId, period } }) => {
    try {
   
      const data = await vitalsService.getBloodPressureChartData(patientId, period);

      return {
        status: 200,
        body: data,
      };
    } catch (error) {
      console.error('Error getting blood pressure chart data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },

  getWeightChart: async ({ params: { patientId, period } }) => {
    try {
   
      const data = await vitalsService.getWeightChartData(patientId, period);

      return {
        status: 200,
        body: data,
      };
    } catch (error) {
      console.error('Error getting weight chart data:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },


  getHeartRateRecords: async ({ params: { patientId, period } }) => {
    try {
      const readings = await vitalsService.getHeartRateReadings(patientId, period);

      return {
        status: 200,
        body: readings,
      };
    } catch (error) {
      console.error('Error getting heart rate records:', error);
      return {
        status: 500,
        body: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      };
    }
  },
});

createExpressEndpoints(contract, router, app, {
  logInitialization: true,
  responseValidation: true,
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
});

async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Failed to connect to database. Server will not start.');
      process.exit(1);
    }

    const redisConnected = await redisService.testConnection();
    if (!redisConnected) {
      console.error('Failed to connect to Redis. Server will not start.');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 API documentation available at http://localhost:${PORT}/health`);
      console.log(`⏰ Redis TTL set to 24 hours for automatic data cleanup`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await redisService.disconnect();
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await redisService.disconnect();
  await closeConnection();
  process.exit(0);
});

startServer();
