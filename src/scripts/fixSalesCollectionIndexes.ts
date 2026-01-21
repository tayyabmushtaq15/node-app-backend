import mongoose from 'mongoose';
import connectDB from '../config/database';

/**
 * Script to fix Sales Collection indexes
 * Drops old conflicting indexes and creates new ones with proper partial filters
 */
const fixSalesCollectionIndexes = async (): Promise<void> => {
  try {
    await connectDB();
    console.log('✅ Connected to database');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    const collection = db.collection('salescollections');
    
    console.log('📋 Current indexes:');
    const currentIndexes = await collection.indexes();
    currentIndexes.forEach((idx: any) => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Drop old conflicting indexes
    console.log('\n🗑️  Dropping old indexes...');
    
    try {
      await collection.dropIndex('entity_1_project_1_date_1');
      console.log('   ✅ Dropped entity_1_project_1_date_1');
    } catch (error: any) {
      if (error.codeName === 'IndexNotFound') {
        console.log('   ℹ️  Index entity_1_project_1_date_1 does not exist');
      } else {
        console.error('   ❌ Error dropping entity_1_project_1_date_1:', error.message);
      }
    }

    try {
      await collection.dropIndex('specialType_1_date_1');
      console.log('   ✅ Dropped specialType_1_date_1');
    } catch (error: any) {
      if (error.codeName === 'IndexNotFound') {
        console.log('   ℹ️  Index specialType_1_date_1 does not exist');
      } else {
        console.error('   ❌ Error dropping specialType_1_date_1:', error.message);
      }
    }

    // Create new indexes with proper partial filters
    console.log('\n📝 Creating new indexes with partial filters...');

    // Compound unique index for normal records (only when entity and project are not null)
    await collection.createIndex(
      { entity: 1, project: 1, date: 1 },
      {
        unique: true,
        name: 'entity_1_project_1_date_1',
        partialFilterExpression: {
          entity: { $ne: null },
          project: { $ne: null },
          specialType: null,
        },
      }
    );
    console.log('   ✅ Created entity_1_project_1_date_1 with partial filter');

    // Unique index for special types (only when specialType is not null)
    await collection.createIndex(
      { specialType: 1, date: 1 },
      {
        unique: true,
        name: 'specialType_1_date_1',
        partialFilterExpression: { specialType: { $ne: null } },
      }
    );
    console.log('   ✅ Created specialType_1_date_1 with partial filter');

    // Verify new indexes
    console.log('\n📋 New indexes:');
    const newIndexes = await collection.indexes();
    newIndexes.forEach((idx: any) => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
      if (idx.partialFilterExpression) {
        console.log(`     Partial filter: ${JSON.stringify(idx.partialFilterExpression)}`);
      }
    });

    console.log('\n✅ Index fix completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error fixing indexes:', error);
    process.exit(1);
  }
};

// Run the script
fixSalesCollectionIndexes();

