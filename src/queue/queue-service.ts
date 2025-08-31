import { 
  heartRateQueue,
  QUEUE_NAMES 
} from './queue-config';
import { 
  PostHeartRateData
} from '../db/schema';

export class QueueService {
  
  async addHeartRateJob(data: PostHeartRateData) {
    const job = await heartRateQueue.add(QUEUE_NAMES.HEART_RATE, data, {
      priority: 1,
      delay: 0,
      jobId: `hr_${data.patientId}_${Date.now()}`,
    });
    
    console.log(`📤 Heart rate job queued: ${job.id}`);
    return job;
  }

  async addHeartRateBatchJob(readings: PostHeartRateData[]) {
    if (readings.length === 0) return null;
    
    const job = await heartRateQueue.add('heart-rate-batch', readings, {
      priority: 1,
      delay: 0,
      jobId: `hr_batch_${Date.now()}`,
    });
    
    console.log(`📤 Heart rate batch job queued: ${job.id} with ${readings.length} readings`);
    return job;
  }

  async getQueueStats() {
    const heartRateStats = await heartRateQueue.getJobCounts();
    return { heartRate: heartRateStats };
  }

  async getFailedJobs() {
    const heartRateFailed = await heartRateQueue.getFailed();
    return { heartRate: heartRateFailed };
  }

  async retryFailedJobs() {
    const failedJobs = await heartRateQueue.getFailed();
    const retriedJobs = await Promise.all(
      failedJobs.map(job => job.retry())
    );
    return { heartRate: retriedJobs };
  }

  async cleanOldJobs() {
    const heartRateCleaned = await heartRateQueue.clean(24 * 60 * 60 * 1000, 'completed');
    return { heartRate: heartRateCleaned };
  }
}
