import { 
  heartRateQueue,
  closeQueues 
} from './queue-config';
import { 
  processHeartRate,
  processHeartRateBatch 
} from './processors';

export class QueueWorker {
  
  constructor() {
    this.setupProcessors();
    this.setupEventHandlers();
  }

  private setupProcessors() {
    heartRateQueue.process('heart-rate-processing', processHeartRate);
    heartRateQueue.process('heart-rate-batch', processHeartRateBatch);
    
    console.log('🔧 Heart rate queue processors set up successfully');
  }

  private setupEventHandlers() {
    heartRateQueue.on('error', (error) => {
      console.error('❌ Heart rate queue error:', error);
    });

    heartRateQueue.on('completed', (job) => {
      console.log(`✅ Heart rate job ${job.id} completed successfully`);
    });

    heartRateQueue.on('failed', (job, err) => {
      console.error(`❌ Heart rate job ${job?.id} failed:`, err.message);
    });

    heartRateQueue.on('waiting', (jobId) => {
      console.log(`⏳ Heart rate job ${jobId} waiting to be processed`);
    });

    console.log('🔧 Heart rate queue event handlers set up successfully');
  }

  async start() {
    console.log('🚀 Starting heart rate queue worker...');
    await heartRateQueue.isReady();
    console.log('✅ Heart rate queue worker started successfully');
  }

  async stop() {
    console.log('🛑 Stopping queue worker...');
    await closeQueues();
    console.log('✅ Queue worker stopped successfully');
  }

  async getStatus() {
    const heartRateReady = await heartRateQueue.isReady();

    return {
      heartRate: { ready: heartRateReady },
    };
  }
}
