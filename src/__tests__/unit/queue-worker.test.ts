import { QueueWorker } from '../../queue/worker';
import { heartRateQueue, closeQueues } from '../../queue/queue-config';

// Mock the queue configuration
jest.mock('../../queue/queue-config', () => ({
  heartRateQueue: {
    process: jest.fn(),
    on: jest.fn(),
    isReady: jest.fn(),
    close: jest.fn(),
  },
  closeQueues: jest.fn(),
}));

// Mock the processors
jest.mock('../../queue/processors', () => ({
  processHeartRate: jest.fn(),
  processHeartRateBatch: jest.fn(),
}));

describe('QueueWorker', () => {
  let queueWorker: QueueWorker;
  let mockHeartRateQueue: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHeartRateQueue = heartRateQueue as any;
    queueWorker = new QueueWorker();
  });

  describe('constructor', () => {
    it('should set up processors and event handlers', () => {
      expect(mockHeartRateQueue.process).toHaveBeenCalledTimes(2);
      expect(mockHeartRateQueue.process).toHaveBeenCalledWith('heart-rate-processing', expect.any(Function));
      expect(mockHeartRateQueue.process).toHaveBeenCalledWith('heart-rate-batch', expect.any(Function));
      
      expect(mockHeartRateQueue.on).toHaveBeenCalledTimes(4);
      expect(mockHeartRateQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockHeartRateQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockHeartRateQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockHeartRateQueue.on).toHaveBeenCalledWith('waiting', expect.any(Function));
    });
  });

  describe('start', () => {
    it('should start the queue worker successfully', async () => {
      mockHeartRateQueue.isReady.mockResolvedValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await queueWorker.start();

      expect(mockHeartRateQueue.isReady).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('🚀 Starting heart rate queue worker...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Heart rate queue worker started successfully');

      consoleSpy.mockRestore();
    });

    it('should handle start errors', async () => {
      const error = new Error('Start failed');
      mockHeartRateQueue.isReady.mockRejectedValue(error);

      await expect(queueWorker.start()).rejects.toThrow('Start failed');
    });
  });

  describe('stop', () => {
    it('should stop the queue worker successfully', async () => {
      const mockCloseQueues = closeQueues as jest.MockedFunction<typeof closeQueues>;
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await queueWorker.stop();

      expect(mockCloseQueues).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('🛑 Stopping queue worker...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Queue worker stopped successfully');

      consoleSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('should return queue status', async () => {
      mockHeartRateQueue.isReady.mockResolvedValue(true);

      const status = await queueWorker.getStatus();

      expect(mockHeartRateQueue.isReady).toHaveBeenCalled();
      expect(status).toEqual({
        heartRate: { ready: true },
      });
    });

    it('should return false when queue is not ready', async () => {
      mockHeartRateQueue.isReady.mockResolvedValue(false);

      const status = await queueWorker.getStatus();

      expect(status).toEqual({
        heartRate: { ready: false },
      });
    });
  });

  describe('event handlers', () => {
    let errorHandler: Function;
    let completedHandler: Function;
    let failedHandler: Function;
    let waitingHandler: Function;

    beforeEach(() => {
      // Capture the event handlers
      const calls = mockHeartRateQueue.on.mock.calls;
      errorHandler = calls.find(([event]: [string]) => event === 'error')?.[1];
      completedHandler = calls.find(([event]: [string]) => event === 'completed')?.[1];
      failedHandler = calls.find(([event]: [string]) => event === 'failed')?.[1];
      waitingHandler = calls.find(([event]: [string]) => event === 'waiting')?.[1];
    });

    it('should handle error events', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Queue error');

      errorHandler(error);

      expect(consoleSpy).toHaveBeenCalledWith('❌ Heart rate queue error:', error);
      consoleSpy.mockRestore();
    });

    it('should handle completed events', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const job = { id: 'job-123' };

      completedHandler(job);

      expect(consoleSpy).toHaveBeenCalledWith('✅ Heart rate job job-123 completed successfully');
      consoleSpy.mockRestore();
    });

    it('should handle failed events', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const job = { id: 'job-123' };
      const error = new Error('Job failed');

      failedHandler(job, error);

      expect(consoleSpy).toHaveBeenCalledWith('❌ Heart rate job job-123 failed:', 'Job failed');
      consoleSpy.mockRestore();
    });

    it('should handle waiting events', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const jobId = 'job-123';

      waitingHandler(jobId);

      expect(consoleSpy).toHaveBeenCalledWith('⏳ Heart rate job job-123 waiting to be processed');
      consoleSpy.mockRestore();
    });
  });
});
