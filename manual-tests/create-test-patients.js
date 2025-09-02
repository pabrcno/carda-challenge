const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function createTestPatients() {
  console.log('👥 Creating Test Patients for Batch Processing Test\n');

  try {
    // Create 10 test patients
    const patients = [];
    
    for (let i = 1; i <= 10; i++) {
      const patient = {
        name: `Test User ${i}`,
        email: `test${i}@example.com`,
        dateOfBirth: '1990-01-01'
      };
      
      try {
        const response = await axios.post(`${BASE_URL}/patients`, patient);
        patients.push(response.data);
        console.log(`  ✅ Created patient ${i}: ${patient.name} (ID: ${response.data.id})`);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`  ℹ️  Patient ${i} already exists (ID: ${i})`);
        } else {
          console.error(`  ❌ Failed to create patient ${i}:`, error.response?.data || error.message);
        }
      }
    }
    
    console.log('');
    console.log(`🎯 Test patients ready: ${patients.length} created`);
    console.log('🚀 Now you can run the batch processing tests!');
    console.log('');
    console.log('Commands to run:');
    console.log('  node test-batch-processing.js     # Basic batch test');
    console.log('  node test-high-volume.js         # High-volume test');

  } catch (error) {
    console.error('❌ Failed to create test patients:', error.response?.data || error.message);
  }
}

// Run the patient creation
createTestPatients();
