import { Job } from 'bull';
import { VitalsService } from '../services/vitals-service';
import { 
  PostHeartRateData,
} from '../db/schema';

const vitalsService = new VitalsService();


export async function processHeartRateBatch(job: Job<PostHeartRateData[]>) {
  const readings = job.data;
  
  console.log(`🫀 Processing batch of ${readings.length} heart rate readings`);
  
  try {
    await vitalsService.processHeartRateBatch(readings);
    
    console.log(`✅ Batch of ${readings.length} heart rate readings processed successfully`);
  } catch (error) {
    console.error(`❌ Heart rate batch processing failed:`, error);
    throw error;
  }
}
