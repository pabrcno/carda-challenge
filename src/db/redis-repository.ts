import Redis from 'ioredis';

export interface HeartRateAggregate {
  min: number;
  max: number;
  minTime: string;
  maxTime: string;
}

export class RedisRepository {
  private redis: Redis;
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

  async getDailyMinMax(patientId: number, date: string): Promise<HeartRateAggregate | null> {
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

  async setDailyMinMax(
    patientId: number, 
    date: string, 
    min: number,
    max: number,
    minTime: string,
    maxTime: string,
    ttlSeconds: number
  ): Promise<void> {
    const key = `${this.DAILY_MIN_MAX_KEY}:${patientId}:${date}`;
    const pipeline = this.redis.pipeline();
    
    pipeline.hset(key, {
      min: min.toString(),
      max: max.toString(),
      minTime,
      maxTime,
    });
    
    pipeline.expire(key, ttlSeconds);
    await pipeline.exec();
  }

  async updateDailyMin(
    patientId: number, 
    date: string, 
    min: number,
    minTime: string,
    ttlSeconds: number
  ): Promise<void> {
    const key = `${this.DAILY_MIN_MAX_KEY}:${patientId}:${date}`;
    const pipeline = this.redis.pipeline();
    
    pipeline.hset(key, 'min', min.toString(), 'minTime', minTime);
    pipeline.expire(key, ttlSeconds);
    
    await pipeline.exec();
  }

  async updateDailyMax(
    patientId: number, 
    date: string, 
    max: number,
    maxTime: string,
    ttlSeconds: number
  ): Promise<void> {
    const key = `${this.DAILY_MIN_MAX_KEY}:${patientId}:${date}`;
    const pipeline = this.redis.pipeline();
    
    pipeline.hset(key, 'max', max.toString(), 'maxTime', maxTime);
    pipeline.expire(key, ttlSeconds);
    
    await pipeline.exec();
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

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Export singleton instance
export const redisRepository = new RedisRepository();
