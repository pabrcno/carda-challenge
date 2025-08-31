import { db } from '../db/connection';
import { patients, type DrizzleNewPatient } from '../db/schema';
import { eq } from 'drizzle-orm';

// Custom error class for better error handling
export class PatientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: 400 | 409 | 500 = 500
  ) {
    super(message);
    this.name = 'PatientError';
  }
}

export class PatientService {
  async createPatient(patient: DrizzleNewPatient): Promise<DrizzleNewPatient> {
    try {
      const newPatient = await db.insert(patients).values(patient).returning();
      return newPatient[0];
    } catch (error: any) {
      // Handle PostgreSQL unique violation error
      if (error.code === '23505') {
        // Check if it's specifically an email violation
        if (error.constraint && error.constraint.includes('email')) {
          throw new PatientError(
            'A patient with this email address already exists',
            'EMAIL_ALREADY_EXISTS',
            409
          );
        }
        // Generic unique constraint violation
        throw new PatientError(
          'A patient with these details already exists',
          'PATIENT_ALREADY_EXISTS',
          409
        );
      }
      
      // Re-throw other errors
      throw error;
    }
  }
}
