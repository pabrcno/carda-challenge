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
  BloodPressureSummary,
  PostBloodPressureData,
  PostWeightData,
  WeightSummary,
  HeartRateSummary,
  ChartPeriod,
} from '../db/schema';
import { redisRepository } from '../db/redis-repository';

export class VitalsService {
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

  async getBloodPressureChartData(patientId: number, period: ChartPeriod): Promise<BloodPressureSummary[]> {
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

    return records.map(record => ({
      recordedAt: record.recordedAt,
      systolic: record.systolic,
      diastolic: record.diastolic,
    }));
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

  async storeHeartRateReading(data: PostHeartRateData): Promise<void> {
    const timestamp = data.timestamp;
    const date = new Date(timestamp).toISOString().split('T')[0]; 
    
    // Store individual heart rate reading in database
    await db.insert(heartRateRecords)
      .values({
        patientId: data.patientId,
        bpm: data.bpm,
        recordedAt: new Date(timestamp),
        createdAt: new Date(),
      });

        // Handle daily min/max logic
    const dailyMinMax = await this.updateDailyMinMaxCache(
      data.patientId,
      date,
      data.bpm,
      timestamp
    );
    
    // Only update database if there are changes
    if (!dailyMinMax) return;
    
    // Update the database aggregate
    await this.upsertHeartRateAggregate(
      data.patientId,
      date,
      dailyMinMax.min,
      new Date(dailyMinMax.minTime),
      dailyMinMax.max,
      new Date(dailyMinMax.maxTime),
    );
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
  

    // Update min if new minimum
    if (isNewMin) {
      await redisRepository.updateDailyMin(
        patientId,
        date,
        bpm,
        timestamp,
        ttlSeconds
      );
    }
    
    // Update max if new maximum
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
