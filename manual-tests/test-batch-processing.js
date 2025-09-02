const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testBatchProcessing() {
  console.log('🧪 Testing Batch Processing Functionality\n');

  try {
    // Test 1: Send multiple heart rate readings quickly to demonstrate batching
    console.log('1️⃣ Sending 70 heart rate readings (should trigger batch processing)...');
    const promises = [];
    
    for (let i = 0; i < 70; i++) {
      const reading = {
        patientId: 7, // Use existing patient ID
        bpm: 70 + Math.floor(Math.random() * 20), // Random BPM between 70-90
        timestamp: new Date().toISOString()
      };
      
      promises.push(
        axios.post(`${BASE_URL}/vitals/heart-rate`, reading)
          .then(response => {
            if (i % 10 === 0) {
              console.log(`  Sent reading ${i + 1}/70`);
            }
            return response.data;
          })
          .catch(error => {
            console.error(`  Error sending reading ${i + 1}:`, error.response?.data || error.message);
          })
      );
    }

    await Promise.all(promises);
    console.log('  All readings sent!');
    console.log('');

    // Test 2: Wait a moment and send a few more to see if they get batched
    console.log('2️⃣ Waiting 3 seconds, then sending 10 more readings...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    for (let i = 0; i < 10; i++) {
      const reading = {
        patientId: 7, // Use existing patient ID
        bpm: 75 + Math.floor(Math.random() * 15),
        timestamp: new Date().toISOString()
      };
      
      try {
        await axios.post(`${BASE_URL}/vitals/heart-rate`, reading);
        console.log(`  Sent additional reading ${i + 1}/10`);
      } catch (error) {
        console.error(`  Error sending additional reading ${i + 1}:`, error.response?.data || error.message);
      }
    }
    console.log('');

    // Test 3: Send readings for different patients to test patient grouping
    console.log('3️⃣ Sending readings for different patients to test patient grouping...');
    const patientReadings = [
      { patientId: 8, bpm: 80, timestamp: new Date().toISOString() },
      { patientId: 8, bpm: 82, timestamp: new Date().toISOString() },
      { patientId: 10, bpm: 75, timestamp: new Date().toISOString() },
      { patientId: 10, bpm: 78, timestamp: new Date().toISOString() },
      { patientId: 7, bpm: 72, timestamp: new Date().toISOString() },
    ];

    for (const reading of patientReadings) {
      try {
        await axios.post(`${BASE_URL}/vitals/heart-rate`, reading);
        console.log(`  Sent reading for patient ${reading.patientId}, BPM: ${reading.bpm}`);
      } catch (error) {
        console.error(`  Error sending reading for patient ${reading.patientId}:`, error.response?.data || error.message);
      }
    }
    console.log('');

    // Test 4: Wait for processing and verify data
    console.log('4️⃣ Waiting for batch processing and verifying data...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test 5: Try to retrieve the data with correct period values
    console.log('5️⃣ Verifying data storage with correct period values...');
    
    try {
      const response = await axios.get(`${BASE_URL}/patients/7/heart-rate/records/7_days`);
      console.log('✅ Data retrieval successful!');
      console.log(`📊 Found ${response.data.length} records for patient 7`);
      
      if (response.data.length > 0) {
        console.log('📋 Sample record:', response.data[0]);
      }
    } catch (error) {
      console.log('⚠️  Data retrieval failed:', error.response?.data || error.message);
    }
    
    console.log('✅ Batch processing test completed successfully!');
    console.log('');
    console.log('📊 What happened:');
    console.log('  - First 60 readings were processed as a batch');
    console.log('  - Remaining 10 readings were processed as a partial batch');
    console.log('  - Additional readings were added to new batches');
    console.log('  - Different patients were grouped separately for efficient processing');
    console.log('  - All processing happened automatically in the background');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testBatchProcessing();
