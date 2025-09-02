import Queue from 'bull';
import 'dotenv/config';

export const QUEUE_NAMES = {
  HEART_RATE_BATCH: 'heart-rate-batch',
} as const;

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

export const queueOptions: Queue.QueueOptions = {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};

export const heartRateQueue = new Queue(QUEUE_NAMES.HEART_RATE_BATCH, queueOptions);

export const queues = {
  heartRate: heartRateQueue,
};

export async function closeQueues() {
  await heartRateQueue.close();
  console.log('🔌 Heart rate batch queue closed');
}
