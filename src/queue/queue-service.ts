import { 
  heartRateQueue,
} from './queue-config';
import { 
  PostHeartRateData
} from '../db/schema';

export class QueueService {
  private heartRateBatch: PostHeartRateData[] = [];
  private batchSize = 200;
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_FLUSH_INTERVAL = 2000;
  private readonly MAX_BATCH_SIZE = 1000;
  
  constructor() {
    this.setupBatchFlushTimer();
  }

  private setupBatchFlushTimer() {
    setInterval(() => {
      this.flushHeartRateBatch();
    }, this.BATCH_FLUSH_INTERVAL);
  }

  async addHeartRateJob(data: PostHeartRateData) {
    this.heartRateBatch.push(data);
    
    if (this.heartRateBatch.length % 50 === 0) {
      console.log(`📥 Heart rate reading added to batch. Batch size: ${this.heartRateBatch.length}`);
    }
    
    if (this.heartRateBatch.length >= this.batchSize) {
      await this.flushHeartRateBatch();
    } else {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      this.batchTimeout = setTimeout(() => {
        this.flushHeartRateBatch();
      }, 500);
    }

    return {
      id: `hr_batch_${Date.now()}_${Math.random()}`,
      data: data
    };
  }

  private async flushHeartRateBatch() {
    if (this.heartRateBatch.length === 0) return;
    
    const batchToProcess = [...this.heartRateBatch];
    this.heartRateBatch = [];
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    console.log(`🔄 Flushing heart rate batch with ${batchToProcess.length} readings`);
    
    try {
      await this.addHeartRateBatchJob(batchToProcess);
    } catch (error) {
      console.error('❌ Error processing heart rate batch:', error);
    }
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
    return { 
      heartRate: heartRateStats,
      batchStatus: {
        currentBatchSize: this.heartRateBatch.length,
        maxBatchSize: this.batchSize,
        batchFlushInterval: this.BATCH_FLUSH_INTERVAL,
        isTimeoutActive: this.batchTimeout !== null
      }
    };
  }

  async getBatchStatus() {
    return {
      currentBatchSize: this.heartRateBatch.length,
      maxBatchSize: this.batchSize,
      batchFlushInterval: this.BATCH_FLUSH_INTERVAL,
      isTimeoutActive: this.batchTimeout !== null,
      estimatedTimeToFlush: this.batchTimeout ? '500ms' : 'immediate'
    };
  }

  async forceFlushBatch() {
    console.log('🔄 Force flushing heart rate batch...');
    await this.flushHeartRateBatch();
  }

  async updateBatchSize(newSize: number) {
    if (newSize < 1 || newSize > this.MAX_BATCH_SIZE) {
      throw new Error(`Batch size must be between 1 and ${this.MAX_BATCH_SIZE}`);
    }
    
    this.batchSize = newSize;
    console.log(`⚙️ Batch size updated to ${newSize}`);
    
    if (this.heartRateBatch.length >= this.batchSize) {
      await this.flushHeartRateBatch();
    }
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
