import { eq, and, gte,  desc } from 'drizzle-orm';
import { db } from '../db/connection';
import {
  bloodPressureRecords,
  weightRecords,
  heartRateAggregates,
  heartRateRecords,
  type DrizzleBloodPressureRecord,
  type DrizzleWeightRecord,
  type DrizzleHeartRateAggregate,
  type DrizzleHeartRateRecord,
  type PostHeartRateData,
  PostBloodPressureData,
  PostWeightData,
  WeightSummary,
  HeartRateSummary,
  ChartPeriod,
} from '../db/schema';
import { redisRepository } from '../db/redis-repository';

export class VitalsService {
  
  async processHeartRateReading(data: PostHeartRateData): Promise<void> {
    const timestamp = data.timestamp;
    const date = new Date(timestamp).toISOString().split('T')[0]; 
    
    await db.insert(heartRateRecords)
      .values({
        patientId: data.patientId,
        bpm: data.bpm,
        recordedAt: new Date(timestamp),
        createdAt: new Date(),
      });

    const dailyMinMax = await this.updateDailyMinMaxCache(
      data.patientId,
      date,
      data.bpm,
      timestamp
    );
    
    if (!dailyMinMax) return;
    
    await this.upsertHeartRateAggregate(
      data.patientId,
      date,
      dailyMinMax.min,
      new Date(dailyMinMax.minTime),
      dailyMinMax.max,
      new Date(dailyMinMax.maxTime),
    );
  }

  async processHeartRateBatch(readings: PostHeartRateData[]): Promise<void> {
    if (readings.length === 0) return;
    
    console.log(`🔄 Processing batch of ${readings.length} heart rate readings`);
    
    // Group readings by patient and date for efficient processing
    const readingsByPatientAndDate = new Map<string, PostHeartRateData[]>();
    
    for (const reading of readings) {
      const date = new Date(reading.timestamp).toISOString().split('T')[0];
      const key = `${reading.patientId}_${date}`;
      
      if (!readingsByPatientAndDate.has(key)) {
        readingsByPatientAndDate.set(key, []);
      }
      readingsByPatientAndDate.get(key)?.push(reading);
    }
    
    // Process each group
    for (const [key, groupReadings] of readingsByPatientAndDate) {
      const [patientIdStr, date] = key.split('_');
      const patientId = parseInt(patientIdStr);
      
      // Bulk insert all readings for this patient/date
      const recordsToInsert = groupReadings.map(reading => ({
        patientId: reading.patientId,
        bpm: reading.bpm,
        recordedAt: new Date(reading.timestamp),
        createdAt: new Date(),
      }));
      
      await db.insert(heartRateRecords).values(recordsToInsert);
      
      // Update daily min/max cache for this patient/date
      await this.updateDailyMinMaxCacheForBatch(patientId, date, groupReadings);
    }
    
    console.log(`✅ Batch processing completed for ${readings.length} readings across ${readingsByPatientAndDate.size} patient/date groups`);
  }

  private async updateDailyMinMaxCacheForBatch(
    patientId: number, 
    date: string, 
    readings: PostHeartRateData[]
  ): Promise<void> {
    if (readings.length === 0) return;
    
    const current = await redisRepository.getDailyMinMax(patientId, date);
    const ttlSeconds = this.getSecondsUntilEndOfNextDay();
    
    // Find min and max from all readings in this batch
    let minBpm = readings[0].bpm;
    let maxBpm = readings[0].bpm;
    let minTime = readings[0].timestamp;
    let maxTime = readings[0].timestamp;
    
    for (const reading of readings) {
      if (reading.bpm < minBpm) {
        minBpm = reading.bpm;
        minTime = reading.timestamp;
      }
      if (reading.bpm > maxBpm) {
        maxBpm = reading.bpm;
        maxTime = reading.timestamp;
      }
    }
    
    if (!current) {
      // No existing cache, create new one
      await redisRepository.setDailyMinMax(
        patientId,
        date,
        minBpm,
        maxBpm,
        minTime,
        maxTime,
        ttlSeconds
      );
    } else {
      // Update existing cache if we have new min/max
      const isNewMin = minBpm < current.min;
      const isNewMax = maxBpm > current.max;
      
      if (isNewMin || isNewMax) {
        const finalMin = isNewMin ? minBpm : current.min;
        const finalMax = isNewMax ? maxBpm : current.max;
        const finalMinTime = isNewMin ? minTime : current.minTime;
        const finalMaxTime = isNewMax ? maxTime : current.maxTime;
        
        await redisRepository.setDailyMinMax(
          patientId,
          date,
          finalMin,
          finalMax,
          finalMinTime,
          finalMaxTime,
          ttlSeconds
        );
      }
    }
    
    // Update aggregates in database
    await this.upsertHeartRateAggregate(
      patientId,
      date,
      minBpm,
      new Date(minTime),
      maxBpm,
      new Date(maxTime),
    );
  }

  async storeBloodPressureReading(data: PostBloodPressureData): Promise<DrizzleBloodPressureRecord> {
    const recordedAt = new Date(data.timestamp);
    
    const result = await db.insert(bloodPressureRecords)
      .values({
        patientId: data.patientId,
        systolic: data.systolic,
        diastolic: data.diastolic,
        recordedAt,
        createdAt: new Date(),
      })
      .returning();
    
    return result[0];
  }

  async getBloodPressureChartData(patientId: number, period: ChartPeriod) {
    const { startDate } = this.getDateRange(period);
    
    const records = await db.select()
      .from(bloodPressureRecords)
      .where(
        and(
          eq(bloodPressureRecords.patientId, patientId),
          gte(bloodPressureRecords.recordedAt, startDate)
        )
      )
      .orderBy(desc(bloodPressureRecords.recordedAt));
      
    const diastolicByDate: { [key: string]: number[] } = {};
    const systolicByDate: { [key: string]: number[] } = {};
  

    for (const record of records) {
      const date = record.recordedAt.toISOString().split('T')[0];
      diastolicByDate[date] = [...(diastolicByDate[date] ?? []), record.diastolic] ;
      systolicByDate[date] = [...(systolicByDate[date] ?? []), record.systolic] ;
    } 


    const diastolicAverages: { [key: string]: number } = {};
    const systolicAverages: { [key: string]: number } = {};

    for (const date in diastolicByDate) {
      diastolicAverages[date] = diastolicByDate[date].reduce((acc, curr) => acc + curr, 0) / diastolicByDate[date].length;
      systolicAverages[date] = systolicByDate[date].reduce((acc, curr) => acc + curr, 0) / systolicByDate[date].length;
    }
    
    return {
      diastolicMeasuments: diastolicAverages,
      systolicMeasuments: systolicAverages,
    }
  }
  
 
  async storeWeightReading(data: PostWeightData): Promise<DrizzleWeightRecord> {
    const recordedAt = new Date(data.timestamp);
    
    const result = await db.insert(weightRecords)
      .values({
        patientId: data.patientId,
        weightKg: data.weightKg,
        recordedAt,
        createdAt: new Date(),
      })
      .returning();
    
    return result[0];
  }

  async getWeightChartData(patientId: number, period: ChartPeriod): Promise<WeightSummary[]> {
    const { startDate } = this.getDateRange(period);
    
    const records = await db.select()
      .from(weightRecords)
      .where(
        and(
          eq(weightRecords.patientId, patientId),
          gte(weightRecords.recordedAt, startDate)
        )
      )
      .orderBy(desc(weightRecords.recordedAt));

    return records.map(record => ({
      recordedAt: record.recordedAt,
      weightKg: record.weightKg,
    }));
  }



  private async updateDailyMinMaxCache(
    patientId: number, 
    date: string, 
    bpm: number, 
    timestamp: string
  ): Promise<{min: number, max: number, minTime: string, maxTime: string} | null> {
    const current = await redisRepository.getDailyMinMax(patientId, date);
    const ttlSeconds = this.getSecondsUntilEndOfNextDay();

    if (!current) {
    
      await redisRepository.setDailyMinMax(
        patientId,
        date,
        bpm,
        bpm,
        timestamp,
        timestamp,
        ttlSeconds
      );
      
      return { min: bpm, max: bpm, minTime: timestamp, maxTime: timestamp };
    }

    const isNewMin = bpm < current.min;
    const isNewMax = bpm > current.max;

    if (!isNewMin && !isNewMax) return null;
  

    if (isNewMin) {
      await redisRepository.updateDailyMin(
        patientId,
        date,
        bpm,
        timestamp,
        ttlSeconds
      );
    }
    
    if (isNewMax) {
      await redisRepository.updateDailyMax(
        patientId,
        date,
        bpm,
        timestamp,
        ttlSeconds
      );
    }
    
  
    return {
      min: isNewMin ? bpm : current.min,
      max: isNewMax ? bpm : current.max,
      minTime: isNewMin ? timestamp : current.minTime,
      maxTime: isNewMax ? timestamp : current.maxTime,
    };
  }

  async getHeartRateChartData(patientId: number, period: ChartPeriod): Promise<HeartRateSummary[]> {
    const { startDate } = this.getDateRange(period);
    const startDateString = startDate.toISOString().split('T')[0]; 
    
    const aggregates = await db.select()
      .from(heartRateAggregates)
      .where(
        and(
          eq(heartRateAggregates.patientId, patientId),
          gte(heartRateAggregates.date, startDateString)
        )
      )
      .orderBy(desc(heartRateAggregates.date));

    return aggregates.map(aggregate => ({
      date: aggregate.date,
      min: aggregate.bpmMin,
      max: aggregate.bpmMax,
    }));
  }

  async getExistingHeartRateAggregate(patientId: number, date: string): Promise<DrizzleHeartRateAggregate | null> {
    const existing = await db.select()
      .from(heartRateAggregates)
      .where(
        and(
          eq(heartRateAggregates.patientId, patientId),
          eq(heartRateAggregates.date, date)
        )
      );
    
    return existing.length > 0 ? existing[0] : null;
  }

  async upsertHeartRateAggregate(
    patientId: number,
    date: string,
    bpmMin: number,
    bpmMinRecordedAt: Date,
    bpmMax: number,
    bpmMaxRecordedAt: Date,
  ): Promise<DrizzleHeartRateAggregate> {
    const existing = await db.select()
      .from(heartRateAggregates)
      .where(
        and(
          eq(heartRateAggregates.patientId, patientId),
          eq(heartRateAggregates.date, date)
        )
      );

    if (existing.length > 0) {
      const result = await db.update(heartRateAggregates)
        .set({
          bpmMin,
          bpmMinRecordedAt,
          bpmMax,
          bpmMaxRecordedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(heartRateAggregates.patientId, patientId),
            eq(heartRateAggregates.date, date)
          )
        )
        .returning();
      
      return result[0];
    }
    
    const result = await db.insert(heartRateAggregates)
      .values({
        patientId,
        date,
        bpmMin,
        bpmMinRecordedAt,
        bpmMax,
        bpmMaxRecordedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    return result[0];
  }

  async getHeartRateReadings(patientId: number, period: ChartPeriod): Promise<DrizzleHeartRateRecord[]> {
    const { startDate } = this.getDateRange(period);
    
    const readings = await db.select()
      .from(heartRateRecords)
      .where(
        and(
          eq(heartRateRecords.patientId, patientId),
          gte(heartRateRecords.recordedAt, startDate)
        )
      )
      .orderBy(desc(heartRateRecords.recordedAt));

    return readings;
  }

  private getDateRange(period: ChartPeriod): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7_days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '31_days':
        startDate.setDate(endDate.getDate() - 31);
        break;
      case '12_months':
        startDate.setMonth(endDate.getMonth() - 12);
        break;
    }
    
    return { startDate, endDate };
  }

  private getSecondsUntilEndOfNextDay(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const diffMs = tomorrow.getTime() - now.getTime();
    return Math.ceil(diffMs / 1000);
  }
}
