import { VitalsService } from '../../services/vitals-service';
import { redisService } from '../../services/redis-service';
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

jest.mock('../../services/redis-service', () => ({
  redisService: {
    storeHeartRateReading: jest.fn(),
    updateDailyMinMax: jest.fn(),
    getDailyMinMax: jest.fn(),
    getLatestHeartRate: jest.fn(),
  },
}));

describe('VitalsService', () => {
  let vitalsService: VitalsService;
  let mockDb: any;
  let mockRedisService: any;

  beforeEach(() => {
    vitalsService = new VitalsService();
    mockDb = db as any;
    mockRedisService = redisService as any;
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('storeHeartRateReading', () => {
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

      // Mock Redis operations
      mockRedisService.storeHeartRateReading.mockResolvedValue(undefined);
      mockRedisService.updateDailyMinMax.mockResolvedValue({
        isNewMin: false,
        isNewMax: false,
        isFirstOfDay: false
      });

      await vitalsService.storeHeartRateReading(mockHeartRateData);

 
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

      mockRedisService.storeHeartRateReading.mockResolvedValue(undefined);
      mockRedisService.updateDailyMinMax.mockResolvedValue({
        isNewMin: true,
        isNewMax: true,
        isFirstOfDay: true
      });

      mockRedisService.getDailyMinMax.mockResolvedValue({
        min: 72,
        max: 72,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T10:30:00.000Z'
      });

      // Mock upsertHeartRateAggregate
      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.storeHeartRateReading(mockHeartRateData);

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

      mockRedisService.storeHeartRateReading.mockResolvedValue(undefined);
      mockRedisService.updateDailyMinMax.mockResolvedValue({
        isNewMin: true,
        isNewMax: false,
        isFirstOfDay: false
      });

      mockRedisService.getDailyMinMax.mockResolvedValue({
        min: 65,
        max: 85,
        minTime: '2024-01-15T10:30:00.000Z',
        maxTime: '2024-01-15T09:00:00.000Z'
      });

      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.storeHeartRateReading(mockHeartRateData);

      expect(mockUpsert).toHaveBeenCalledWith(
        1,
        '2024-01-15',
        65,
        new Date('2024-01-15T10:30:00.000Z'),
        85,
        new Date('2024-01-15T09:00:00.000Z')
      );
    });

    it('should not update database when no new min/max is recorded', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue(undefined)
      });

      mockRedisService.storeHeartRateReading.mockResolvedValue(undefined);
      mockRedisService.updateDailyMinMax.mockResolvedValue({
        isNewMin: false,
        isNewMax: false,
        isFirstOfDay: false
      });

      const mockUpsert = jest.spyOn(vitalsService as any, 'upsertHeartRateAggregate');
      mockUpsert.mockResolvedValue({});

      await vitalsService.storeHeartRateReading(mockHeartRateData);

      expect(mockUpsert).not.toHaveBeenCalled();
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