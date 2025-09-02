import { Job } from 'bull';
import { VitalsService } from '../services/vitals-service';
import { 
  PostHeartRateData,
} from '../db/schema';

const vitalsService = new VitalsService();

export async function processHeartRate(job: Job<PostHeartRateData>) {
  const { patientId, bpm } = job.data;
  
  console.log(`🫀 Processing heart rate: Patient ${patientId}, BPM: ${bpm}`);
  
  try {
    await vitalsService.processHeartRateReading(job.data);
    console.log(`✅ Heart rate processed successfully for patient ${patientId}`);
  } catch (error) {
    console.error(`❌ Heart rate processing failed for patient ${patientId}:`, error);
    throw error;
  }
}

export async function processHeartRateBatch(job: Job<PostHeartRateData[]>) {
  const readings = job.data;
  
  console.log(`🫀 Processing batch of ${readings.length} heart rate readings`);
  
  try {
    await Promise.all(
      readings.map(reading => vitalsService.processHeartRateReading(reading))
    );
    
    console.log(`✅ Batch of ${readings.length} heart rate readings processed successfully`);
  } catch (error) {
    console.error(`❌ Heart rate batch processing failed:`, error);
    throw error;
  }
}
