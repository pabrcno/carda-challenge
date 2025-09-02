import { db } from '../db/connection';
import { patients, type DrizzleNewPatient } from '../db/schema';

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
      if (error.code === '23505') {
        if (error.constraint && error.constraint.includes('email')) {
          throw new PatientError(
            'A patient with this email address already exists',
            'EMAIL_ALREADY_EXISTS',
            409
          );
        }
        throw new PatientError(
          'A patient with these details already exists',
          'PATIENT_ALREADY_EXISTS',
          409
        );
      }
      
      throw error;
    }
  }
}
