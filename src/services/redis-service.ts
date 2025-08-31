import Redis from 'ioredis';

export interface HeartRateReading {
  patientId: number;
  bpm: number;
  timestamp: string;
}

export class RedisService {
  private redis: Redis;
  private readonly LATEST_HEART_RATE_KEY = 'latest_heart_rate';
  private readonly DAILY_MIN_MAX_KEY = 'daily_min_max';

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost', 
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: () => 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis connected');
    });

    this.redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    this.redis.on('close', () => {
      console.log('🔌 Redis connection closed');
    });
  }


  async getLatestHeartRate(patientId: number): Promise<HeartRateReading | null> {
    const latestKey = `${this.LATEST_HEART_RATE_KEY}:${patientId}`;
    const data = await this.redis.hgetall(latestKey);

    if (!data.patientId || !data.bpm || !data.timestamp) {
      return null;
    }

    return {
      patientId: parseInt(data.patientId),
      bpm: parseInt(data.bpm),
      timestamp: data.timestamp,
    };
  }

  async getDailyMinMax(patientId: number, date: string): Promise<{min: number, max: number, minTime: string, maxTime: string} | null> {
    const key = `${this.DAILY_MIN_MAX_KEY}:${patientId}:${date}`;
    
    const data = await this.redis.hgetall(key);
    if (!data.min || !data.max) {
      return null;
    }
    
    return {
      min: parseInt(data.min),
      max: parseInt(data.max),
      minTime: data.minTime,
      maxTime: data.maxTime,
    };
  }

  async updateDailyMinMax(
    patientId: number, 
    date: string, 
    bpm: number, 
    timestamp: string
  ): Promise<{isNewMin: boolean, isNewMax: boolean, isFirstOfDay: boolean}> {
    const key = `${this.DAILY_MIN_MAX_KEY}:${patientId}:${date}`;
    const current = await this.getDailyMinMax(patientId, date);
    const pipeline = this.redis.pipeline();

    if (!current) {
      pipeline.hset(key, {
        min: bpm.toString(),
        max: bpm.toString(),
        minTime: timestamp,
        maxTime: timestamp,
      });
      
      const ttlSeconds = this.getSecondsUntilEndOfNextDay();
      pipeline.expire(key, ttlSeconds);
      await pipeline.exec();
      
      return { isNewMin: true, isNewMax: true, isFirstOfDay: true };
    }

    const updates = {
      isNewMin: bpm < current.min,
      isNewMax: bpm > current.max,
      isFirstOfDay: false
    };

    if (updates.isNewMin) {
      pipeline.hset(key, 'min', bpm.toString(), 'minTime', timestamp);
    }
    
    if (updates.isNewMax) {
      pipeline.hset(key, 'max', bpm.toString(), 'maxTime', timestamp);
    }
    
    const ttlSeconds = this.getSecondsUntilEndOfNextDay();
    pipeline.expire(key, ttlSeconds);
    
    await pipeline.exec();
    
    return updates;
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis connection test failed:', error);
      return false;
    }
  }

  private getSecondsUntilEndOfNextDay(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const diffMs = tomorrow.getTime() - now.getTime();
    return Math.ceil(diffMs / 1000);
  }

  async hasCalendarDayChanged(patientId: number): Promise<boolean> {
    const latest = await this.getLatestHeartRate(patientId);
    if (!latest) return true; 

    const latestDate = new Date(latest.timestamp).toISOString().split('T')[0];
    const currentDate = new Date().toISOString().split('T')[0];
    
    return latestDate !== currentDate;
  }


  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Export singleton instance
export const redisService = new RedisService();
