import { QueueService } from '../../queue/queue-service';
import { heartRateQueue } from '../../queue/queue-config';
import { PostHeartRateData } from '../../db/schema';

// Mock the queue
jest.mock('../../queue/queue-config', () => ({
  heartRateQueue: {
    add: jest.fn(),
    getJobCounts: jest.fn(),
    getFailed: jest.fn(),
    clean: jest.fn(),
  },
  QUEUE_NAMES: {
    HEART_RATE: 'heart-rate-processing',
  },
}));

describe('QueueService', () => {
  let queueService: QueueService;
  let mockHeartRateQueue: any;

  beforeEach(() => {
    queueService = new QueueService();
    mockHeartRateQueue = heartRateQueue as any;
    jest.clearAllMocks();
  });

  describe('addHeartRateJob', () => {
    const mockHeartRateData: PostHeartRateData = {
      patientId: 1,
      bpm: 72,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    it('should add a heart rate job to the queue', async () => {
      const mockJob = { id: 'job-123' };
      mockHeartRateQueue.add.mockResolvedValue(mockJob);

      const result = await queueService.addHeartRateJob(mockHeartRateData);

      expect(mockHeartRateQueue.add).toHaveBeenCalledWith(
        'heart-rate-processing',
        mockHeartRateData,
        {
          priority: 1,
          delay: 0,
          jobId: expect.stringMatching(/^hr_1_\d+$/),
        }
      );
      expect(result).toBe(mockJob);
    });

    it('should handle queue errors', async () => {
      const error = new Error('Queue error');
      mockHeartRateQueue.add.mockRejectedValue(error);

      await expect(queueService.addHeartRateJob(mockHeartRateData))
        .rejects.toThrow('Queue error');
    });
  });

  describe('addHeartRateBatchJob', () => {
    const mockBatchData: PostHeartRateData[] = [
      { patientId: 1, bpm: 72, timestamp: '2024-01-15T10:30:00.000Z' },
      { patientId: 1, bpm: 75, timestamp: '2024-01-15T10:35:00.000Z' },
    ];

    it('should add a batch heart rate job to the queue', async () => {
      const mockJob = { id: 'batch-job-123' };
      mockHeartRateQueue.add.mockResolvedValue(mockJob);

      const result = await queueService.addHeartRateBatchJob(mockBatchData);

      expect(mockHeartRateQueue.add).toHaveBeenCalledWith(
        'heart-rate-batch',
        mockBatchData,
        {
          priority: 1,
          delay: 0,
          jobId: expect.stringMatching(/^hr_batch_\d+$/),
        }
      );
      expect(result).toBe(mockJob);
    });

    it('should return null for empty batch', async () => {
      const result = await queueService.addHeartRateBatchJob([]);
      expect(result).toBeNull();
      expect(mockHeartRateQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const mockStats = { waiting: 5, active: 2, completed: 100 };
      mockHeartRateQueue.getJobCounts.mockResolvedValue(mockStats);

      const result = await queueService.getQueueStats();

      expect(mockHeartRateQueue.getJobCounts).toHaveBeenCalled();
      expect(result).toEqual({ heartRate: mockStats });
    });
  });

  describe('getFailedJobs', () => {
    it('should return failed jobs', async () => {
      const mockFailedJobs = [{ id: 'failed-1' }, { id: 'failed-2' }];
      mockHeartRateQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const result = await queueService.getFailedJobs();

      expect(mockHeartRateQueue.getFailed).toHaveBeenCalled();
      expect(result).toEqual({ heartRate: mockFailedJobs });
    });
  });

  describe('retryFailedJobs', () => {
    it('should retry all failed jobs', async () => {
      const mockFailedJobs = [
        { id: 'failed-1', retry: jest.fn().mockResolvedValue(true) },
        { id: 'failed-2', retry: jest.fn().mockResolvedValue(true) },
      ];
      mockHeartRateQueue.getFailed.mockResolvedValue(mockFailedJobs);

      const result = await queueService.retryFailedJobs();

      expect(mockHeartRateQueue.getFailed).toHaveBeenCalled();
      expect(mockFailedJobs[0].retry).toHaveBeenCalled();
      expect(mockFailedJobs[1].retry).toHaveBeenCalled();
      expect(result).toEqual({ heartRate: [true, true] });
    });
  });

  describe('cleanOldJobs', () => {
    it('should clean old completed jobs', async () => {
      const mockCleanedCount = 50;
      mockHeartRateQueue.clean.mockResolvedValue(mockCleanedCount);

      const result = await queueService.cleanOldJobs();

      expect(mockHeartRateQueue.clean).toHaveBeenCalledWith(
        24 * 60 * 60 * 1000, // 24 hours in milliseconds
        'completed'
      );
      expect(result).toEqual({ heartRate: mockCleanedCount });
    });
  });
});
