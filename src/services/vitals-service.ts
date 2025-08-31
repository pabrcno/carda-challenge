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
import { redisService } from './redis-service';

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
    
    await db.insert(heartRateRecords)
      .values({
        patientId: data.patientId,
        bpm: data.bpm,
        recordedAt: new Date(timestamp),
        createdAt: new Date(),
      });
    

    
    const { isNewMin, isNewMax, isFirstOfDay } = await redisService.updateDailyMinMax(
      data.patientId,
      date,
      data.bpm,
      timestamp
    );
    
    
    const shouldUpdateDB = isNewMin || isNewMax || isFirstOfDay;
    
    if (!shouldUpdateDB) {
      this.logNonUpdateReason(data.patientId, data.bpm, date, isFirstOfDay);
      return;
    }
    
    const dailyMinMax = await redisService.getDailyMinMax(data.patientId, date);
    
    if (!dailyMinMax) {
      console.log(`⚠️  No daily min/max data found for patient ${data.patientId} on ${date}`);
      return;
    }
    
    
    await this.upsertHeartRateAggregate(
      data.patientId,
      date,
      dailyMinMax.min,
      new Date(dailyMinMax.minTime),
      dailyMinMax.max,
      new Date(dailyMinMax.maxTime),

    );
    
    this.logUpdateReason(data.patientId, data.bpm, date, isFirstOfDay, isNewMin, isNewMax, dailyMinMax);
  }

  private logNonUpdateReason(
    patientId: number, 
    bpm: number, 
    date: string, 
    isFirstOfDay: boolean, 
  ): void {
    if (isFirstOfDay) {
      console.log(`🛡️  Prevented duplicate DB entry for patient ${patientId} on ${date} - Redis TTL/calendar day boundary mismatch`);
      return;
    }
    
    console.log(`⏭️  Heart rate ${bpm} for patient ${patientId} is not a new daily min/max - Redis updated, DB unchanged`);
  }


  private logUpdateReason(
    patientId: number,
    bpm: number,
    date: string,
    isFirstOfDay: boolean,
    isNewMin: boolean,
    isNewMax: boolean,
    dailyMinMax: { min: number; max: number },
   
  ): void {
    if (isFirstOfDay) {
      console.log(`🌅 Created first heart rate aggregate for patient ${patientId} on ${date} - BPM: ${bpm}`);
      return;
    }
    
      if (isFirstOfDay) {
      console.log(`🔄 Prevented duplicate: Found existing aggregate for patient ${patientId} on ${date} despite Redis indicating first of day`);
      return;
    }
    
    const reasons = [];
    if (isNewMin) reasons.push('new min');
    if (isNewMax) reasons.push('new max');
    console.log(`📊 Updated heart rate aggregate for patient ${patientId} on ${date} (${reasons.join(', ')}) - Min: ${dailyMinMax.min}, Max: ${dailyMinMax.max}`);
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
}
