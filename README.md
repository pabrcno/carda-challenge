# Carda Health Vitals Tracking API

## 🚀 Quick Start

### Prerequisites
- **Node.js 23+** 
- **Docker & Docker Compose**
- **npm**

### Installation & Setup

1. **Install dependencies**
```bash
npm install
```

2. **Environment setup**
```bash
cp env.example .env
# Edit .env file with your configuration if needed
```

3. **Start infrastructure (PostgreSQL + Redis)**
```bash
npm run docker:up
# Or start only the database: npm run docker:db
```

4. **Initialize database**
```bash
npm run db:push
# Or run migrations: npm run db:migrate
```

5. **Start the application**

**Development mode (recommended for development):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```


### 🌐 Access Points

- **API Server**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/health`
- **Drizzle Studio**: `http://localhost:4983` (if using `npm run db:studio`)

## 🏗️ Architecture Overview

### Type-Safe API Stack
- **Drizzle ORM**: Type-safe database operations
- **Zod**: Runtime validation and type inference
- **ts-rest**: End-to-end type safety for REST APIs

### Queue System
Heart rate data is processed asynchronously using Redis queues to handle high-volume readings efficiently.

#### Processing Flow
1. API receives data → queues job → returns immediately
2. Background worker processes job asynchronously
3. Data stored + cache updated + aggregates calculated

#### Error Handling
- Automatic retries with exponential backoff
- Failed job monitoring and manual retry capability

## 🧠 Heart Rate Optimization Strategy

### Problem
Heart rate data is collected **once per second** (86,400 readings per day), creating significant performance challenges:
- Database load: 86,400 inserts per patient per day
- Query performance: Aggregating millions of records
- Storage costs: Exponential data growth

### Solution: Hybrid Caching + Conditional Persistence + Async Processing
#### Processing Flow
1. **Queue Job**: API receives data → queues for async processing
2. **Store Reading**: Individual reading saved to `heart_rate_records`
3. **Update Cache**: Redis tracks daily min/max values (O(1) lookup)
4. **Conditional Update**: Only update `heart_rate_aggregates` when min/max changes

#### Performance Benefits
- **Response Time**: < 10ms (vs variable DB-dependent)
- **DB Writes**: ~2/day per patient (vs 86,400/day)
- **Queries**: Simple date ranges (vs complex JOINs)
- **Storage**: Minimal growth with automatic retries

## 📊 Data Models

See [schema.ts](src/db/schema.ts) for the complete database schema and validation schemas.

## 🔄 API Endpoints

### Patient Management
- `POST /patients` - Create new patient
- `GET /health` - Health check

### Vitals Data
- `POST /vitals/heart-rate` - Queue heart rate reading (async)
- `POST /vitals/blood-pressure` - Store blood pressure reading (sync)
- `POST /vitals/weight` - Store weight reading (sync)

### Chart Data (Optimized)
- `GET /patients/:id/heart-rate/:period` - Daily min/max aggregates
- `GET /patients/:id/blood-pressure/:period` - Individual readings
- `GET /patients/:id/weight/:period` - Individual readings
- `GET /patients/:id/heart-rate/records/:period` - Raw heart rate data (analysis only)

### Queue Management
- `GET /queue/stats` - Queue statistics
- `GET /queue/failed` - Failed jobs
- `POST /queue/retry` - Retry failed jobs
- `POST /queue/clean` - Clean old completed jobs

### Time Periods
- `7_days` - Last 7 days
- `31_days` - Last 31 days  
- `12_months` - Last 12 months

## 🔧 Development

### Available Scripts

#### Development Commands
```bash
npm run dev              # Start development server with hot reload
npm run build           # Compile TypeScript to JavaScript
npm start               # Start production server
npm run type-check      # TypeScript type checking without compilation
```

#### Database Commands
```bash
npm run db:generate     # Generate new migration files
npm run db:migrate      # Run database migrations
npm run db:studio       # Open Drizzle Studio for database management
npm run db:push         # Push schema changes directly to database
npm run db:seed         # Seed database with initial data
```

#### Docker Commands
```bash
npm run docker:up       # Start all Docker services
npm run docker:down     # Stop all Docker services
npm run docker:logs     # View Docker service logs
npm run docker:restart  # Restart all Docker services
```

### Environment Variables
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carda_challenge
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
NODE_ENV=development
```

---

**Built with**: TypeScript, Node.js, Express, Drizzle ORM, Zod, ts-rest, PostgreSQL, Redis, Bull Queue, Docker
 
