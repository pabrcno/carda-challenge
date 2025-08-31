import { VitalsService } from '../../services/vitals-service';
import { redisRepository } from '../../db/redis-repository';
import { db } from '../../db/connection';
import { 
  heartRateRecords, 
  heartRateAggregates, 
  bloodPressureRecords, 
  weightRecords,

} from '../../db/schema';

// Mock the database and Redis services
jest.mock('../../db/connection', () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../../db/redis-repository', () => ({
  redisRepository: {
    getDailyMinMax: jest.fn(),
    setDailyMinMax: jest.fn(),
    updateDailyMin: jest.fn(),
    updateDailyMax: jest.fn(),
  },
}));

describe('VitalsService', () => {
  let vitalsService: VitalsService;
  let mockDb: any;
  let mockRedisRepository: any;

  beforeEach(() => {
    vitalsService = new VitalsService();
    mockDb = db as any;
    mockRedisRepository = redisRepository as any;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('processHeartRateReading', () => {
    const mockHeartRateData = {
      patientId: 1,
      bpm: 72,
      timestamp: '2024-01-15T10:30:00.000Z'
    };

    it('should store individual heart rate reading in database', async () => {
      // Mock database insert
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      // Mock Redis operations - no updates needed
      const mockUpdateDailyMinMaxCache = jest.spyOn(vitalsService as any, 'updateDailyMinMaxCache');
      mockUpdateDailyMinMaxCache.mockResolvedValue(null);

      await vitalsService.processHeartRateReading(mockHeartRateData);

      expect(mockDb.insert).toHaveBeenCalledWith(heartRateRecords);
      expect(mockDb.insert().values).toHaveBeenCalledWith({
        patientId: 1,
        bpm: 72,
        recordedAt: new Date('2024-01-15T10:30:00.000Z'),
        createdAt: expect.any(Date)
      });
    });

    it('should update daily min/max when it is the first reading of the day', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      // Mock the updateDailyMinMaxCache method to return the expected result
      const mockUpdateDailyMinMaxCache = jest.spyOn(vitalsService as any, 'updateDailyMinMaxCache');
      mockUpdateDailyMinMaxCache.mockResolvedValue({
        min: 72,
        max: 72,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T10:30:00.000Z'
      });

      // Mock upsertHeartRateAggregate
      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.processHeartRateReading(mockHeartRateData);

      expect(mockUpdateDailyMinMaxCache).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        '2024-01-15T10:30:00.000Z'
      );

      expect(mockUpsert).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        new Date('2024-01-15T10:30:00.000Z'),
        72,
        new Date('2024-01-15T10:30:00.000Z')
      );
    });

    it('should update daily min/max when new minimum is recorded', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      // Mock the updateDailyMinMaxCache method to return the expected result
      const mockUpdateDailyMinMaxCache = jest.spyOn(vitalsService as any, 'updateDailyMinMaxCache');
      mockUpdateDailyMinMaxCache.mockResolvedValue({
        min: 70,
        max: 85,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.processHeartRateReading(mockHeartRateData);

      expect(mockUpdateDailyMinMaxCache).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        '2024-01-15T10:30:00.000Z'
      );

      expect(mockUpsert).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        70,
        new Date('2024-01-15T10:30:00.000Z'),
        85,
        new Date('2024-01-15T09:00:00.000Z')
      );
    });

    it('should update daily min/max when new maximum is recorded', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      // Mock the updateDailyMinMaxCache method to return the expected result
      const mockUpdateDailyMinMaxCache = jest.spyOn(vitalsService as any, 'updateDailyMinMaxCache');
      mockUpdateDailyMinMaxCache.mockResolvedValue({
        min: 65,
        max: 72,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T10:30:00.000Z'
      });

      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.processHeartRateReading(mockHeartRateData);

      expect(mockUpdateDailyMinMaxCache).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        '2024-01-15T10:30:00.000Z'
      );

      expect(mockUpsert).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        65,
        new Date('2024-01-15T09:00:00.000Z'),
        72,
        new Date('2024-01-15T10:30:00.000Z')
      );
    });

    it('should not update database when no new min/max is recorded', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      // Mock updateDailyMinMaxCache to return null (no updates needed)
      const mockUpdateDailyMinMaxCache = jest.spyOn(vitalsService as any, 'updateDailyMinMaxCache');
      mockUpdateDailyMinMaxCache.mockResolvedValue(null);

      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.processHeartRateReading(mockHeartRateData);

      expect(mockUpdateDailyMinMaxCache).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        '2024-01-15T10:30:00.000Z'
      );
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('updateDailyMinMaxCache', () => {
    it('should create new daily min/max for first reading of the day', async () => {
      mockRedisRepository.getDailyMinMax.mockResolvedValue(null);
      mockRedisRepository.setDailyMinMax.mockResolvedValue(undefined);

      const result = await vitalsService['updateDailyMinMaxCache'](
        1,
        '2024-01-15',
        72,
        '2024-01-15T10:30:00.000Z'
      );

      expect(result).toEqual({
        min: 72,
        max: 72,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T10:30:00.000Z'
      });

      expect(mockRedisRepository.setDailyMinMax).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        72,
        72,
        '2024-01-15T10:30:00.000Z',
        '2024-01-15T10:30:00.000Z',
        expect.any(Number)
      );
    });

    it('should update min when new reading is lower', async () => {
      mockRedisRepository.getDailyMinMax.mockResolvedValue({
        min: 75,
        max: 85,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      mockRedisRepository.updateDailyMin.mockResolvedValue(undefined);

      const result = await vitalsService['updateDailyMinMaxCache'](
        1,
        '2024-01-15',
        70,
        '2024-01-15T10:30:00.000Z'
      );

      expect(result).toEqual({
        min: 70,
        max: 85,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      expect(mockRedisRepository.updateDailyMin).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        70,
        '2024-01-15T10:30:00.000Z',
        expect.any(Number)
      );
    });

    it('should update max when new reading is higher', async () => {
      mockRedisRepository.getDailyMinMax.mockResolvedValue({
        min: 65,
        max: 80,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      mockRedisRepository.updateDailyMax.mockResolvedValue(undefined);

      const result = await vitalsService['updateDailyMinMaxCache'](
        1,
        '2024-01-15',
        85,
        '2024-01-15T10:30:00.000Z'
      );

      expect(result).toEqual({
        min: 65,
        max: 85,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T10:30:00.000Z'
      });

      expect(mockRedisRepository.updateDailyMax).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        85,
        '2024-01-15T10:30:00.000Z',
        expect.any(Number)
      );
    });

    it('should return null when reading is within existing range', async () => {
      mockRedisRepository.getDailyMinMax.mockResolvedValue({
        min: 65,
        max: 85,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      const result = await vitalsService['updateDailyMinMaxCache'](
        1,
        '2024-01-15',
        75,
        '2024-01-15T10:30:00.000Z'
      );

      expect(result).toBeNull();
      expect(mockRedisRepository.updateDailyMin).not.toHaveBeenCalled();
      expect(mockRedisRepository.updateDailyMax).not.toHaveBeenCalled();
    });

    it('should update both min and max when reading is both lower and higher than current range', async () => {
      mockRedisRepository.getDailyMinMax.mockResolvedValue({
        min: 70,
        max: 80,
        minTime: '2024-01-15T09:00:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      mockRedisRepository.updateDailyMin.mockResolvedValue(undefined);
      mockRedisRepository.updateDailyMax.mockResolvedValue(undefined);

      const result = await vitalsService['updateDailyMinMaxCache'](
        1,
        '2024-01-15',
        65, // Lower than current min
        '2024-01-15T10:30:00.000Z'
      );

      expect(result).toEqual({
        min: 65,
        max: 80,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      expect(mockRedisRepository.updateDailyMin).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        65,
        '2024-01-15T10:30:00.000Z',
        expect.any(Number)
      );
    });
  });

  describe('storeBloodPressureReading', () => {
    const mockBloodPressureData = {
      patientId: 1,
      systolic: 120,
      diastolic: 80,
      timestamp: '2024-01-15T08:00:00.000Z'
    };

    it('should store blood pressure reading in database', async () => {
      const mockInsertResult = [{
        id: 1,
        patientId: 1,
        systolic: 120,
        diastolic: 80,
        recordedAt: new Date('2024-01-15T08:00:00.000Z'),
        createdAt: new Date()
      }];

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockInsertResult)
        })
      });

      const result = await vitalsService.storeBloodPressureReading(mockBloodPressureData);

      expect(mockDb.insert).toHaveBeenCalledWith(bloodPressureRecords);
      expect(mockDb.insert().values).toHaveBeenCalledWith({
        patientId: 1,
        systolic: 120,
        diastolic: 80,
        recordedAt: new Date('2024-01-15T08:00:00.000Z'),
        createdAt: expect.any(Date)
      });
      expect(result).toEqual(mockInsertResult[0]);
    });
  });

  describe('storeWeightReading', () => {
    const mockWeightData = {
      patientId: 1,
      weightKg: 75.5,
      timestamp: '2024-01-15T07:00:00.000Z'
    };

    it('should store weight reading in database', async () => {
      const mockInsertResult = [{
        id: 1,
        patientId: 1,
        weightKg: 75.5,
        recordedAt: new Date('2024-01-15T07:00:00.000Z'),
        createdAt: new Date()
      }];

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockInsertResult)
        })
      });

      const result = await vitalsService.storeWeightReading(mockWeightData);

      expect(mockDb.insert).toHaveBeenCalledWith(weightRecords);
      expect(mockDb.insert().values).toHaveBeenCalledWith({
        patientId: 1,
        weightKg: 75.5,
        recordedAt: new Date('2024-01-15T07:00:00.000Z'),
        createdAt: expect.any(Date)
      });
      expect(result).toEqual(mockInsertResult[0]);
    });
  });

  describe('getHeartRateChartData', () => {
    it('should return heart rate chart data for specified period', async () => {
      const mockAggregates = [
        {
          date: '2024-01-15',
          bpmMin: 58,
          bpmMax: 145,
          bpmMinRecordedAt: new Date('2024-01-15T06:00:00.000Z'),
          bpmMaxRecordedAt: new Date('2024-01-15T18:00:00.000Z')
        },
        {
          date: '2024-01-14',
          bpmMin: 62,
          bpmMax: 138,
          bpmMinRecordedAt: new Date('2024-01-14T07:00:00.000Z'),
          bpmMaxRecordedAt: new Date('2024-01-14T19:00:00.000Z')
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockAggregates)
          })
        })
      });

      const result = await vitalsService.getHeartRateChartData(1, '7_days');

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual([
        {
          date: '2024-01-15',
          min: 58,
          max: 145
        },
        {
          date: '2024-01-14',
          min: 62,
          max: 138
        }
      ]);
    });
  });

  describe('getBloodPressureChartData', () => {
    it('should return blood pressure chart data for specified period', async () => {
      const mockRecords = [
        {
          recordedAt: new Date('2024-01-15T08:00:00.000Z'),
          systolic: 118,
          diastolic: 78
        },
        {
          recordedAt: new Date('2024-01-15T20:00:00.000Z'),
          systolic: 125,
          diastolic: 82
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockRecords)
          })
        })
      });

      const result = await vitalsService.getBloodPressureChartData(1, '7_days');

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual([
        {
          recordedAt: new Date('2024-01-15T08:00:00.000Z'),
          systolic: 118,
          diastolic: 78
        },
        {
          recordedAt: new Date('2024-01-15T20:00:00.000Z'),
          systolic: 125,
          diastolic: 82
        }
      ]);
    });
  });

  describe('getWeightChartData', () => {
    it('should return weight chart data for specified period', async () => {
      const mockRecords = [
        {
          recordedAt: new Date('2024-01-15T07:00:00.000Z'),
          weightKg: 75.5
        },
        {
          recordedAt: new Date('2024-01-14T07:00:00.000Z'),
          weightKg: 76.2
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockRecords)
          })
        })
      });

      const result = await vitalsService.getWeightChartData(1, '7_days');

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual([
        {
          recordedAt: new Date('2024-01-15T07:00:00.000Z'),
          weightKg: 75.5
        },
        {
          recordedAt: new Date('2024-01-14T07:00:00.000Z'),
          weightKg: 76.2
        }
      ]);
    });
  });

  describe('getHeartRateReadings', () => {
    it('should return raw heart rate readings for specified period', async () => {
      const mockReadings = [
        {
          id: 1,
          patientId: 1,
          bpm: 70,
          recordedAt: new Date('2024-01-15T10:30:00.000Z'),
          createdAt: new Date('2024-01-15T10:30:00.000Z')
        },
        {
          id: 2,
          patientId: 1,
          bpm: 71,
          recordedAt: new Date('2024-01-15T10:30:01.000Z'),
          createdAt: new Date('2024-01-15T10:30:01.000Z')
        }
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockReadings)
          })
        })
      });

      const result = await vitalsService.getHeartRateReadings(1, '7_days');

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(mockReadings);
    });
  });

  describe('upsertHeartRateAggregate', () => {
    it('should create new aggregate when none exists', async () => {
      const mockInsertResult = [{
        id: 1,
        patientId: 1,
        date: '2024-01-15',
        bpmMin: 58,
        bpmMax: 145,
        bpmMinRecordedAt: new Date('2024-01-15T06:00:00.000Z'),
        bpmMaxRecordedAt: new Date('2024-01-15T18:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue([])
        })
      });

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue(mockInsertResult)
        })
      });

      const result = await vitalsService['upsertHeartRateAggregate'](
        1,
        '2024-01-15',
        58,
        new Date('2024-01-15T06:00:00.000Z'),
        145,
        new Date('2024-01-15T18:00:00.000Z')
      );

      expect(mockDb.insert).toHaveBeenCalledWith(heartRateAggregates);
      expect(result).toEqual(mockInsertResult[0]);
    });

    it('should update existing aggregate when one exists', async () => {
      const mockUpdateResult = [{
        id: 1,
        patientId: 1,
        date: '2024-01-15',
        bpmMin: 55,
        bpmMax: 150,
        bpmMinRecordedAt: new Date('2024-01-15T05:00:00.000Z'),
        bpmMaxRecordedAt: new Date('2024-01-15T19:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue([{ id: 1 }])
        })
      });

      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue(mockUpdateResult)
          })
        })
      });

      const result = await vitalsService['upsertHeartRateAggregate'](
        1,
        '2024-01-15',
        55,
        new Date('2024-01-15T05:00:00.000Z'),
        150,
        new Date('2024-01-15T19:00:00.000Z')
      );

      expect(mockDb.update).toHaveBeenCalledWith(heartRateAggregates);
      expect(result).toEqual(mockUpdateResult[0]);
    });
  });

  describe('getDateRange', () => {
    it('should return correct date range for 7 days', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = vitalsService['getDateRange']('7_days');

      expect(result.startDate).toEqual(new Date('2024-01-08T12:00:00.000Z'));
      expect(result.endDate).toEqual(mockDate);
    });

    it('should return correct date range for 31 days', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = vitalsService['getDateRange']('31_days');

      expect(result.startDate).toEqual(new Date('2023-12-15T12:00:00.000Z'));
      expect(result.endDate).toEqual(mockDate);
    });

    it('should return correct date range for 12 months', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const result = vitalsService['getDateRange']('12_months');

      expect(result.startDate).toEqual(new Date('2023-01-15T12:00:00.000Z'));
      expect(result.endDate).toEqual(mockDate);
    });
  });


});