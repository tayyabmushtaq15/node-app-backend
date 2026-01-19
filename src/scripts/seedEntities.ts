;import Entity from '../models/entities.model';
import connectDB from '../config/database';

const entities = [
  { entityCode: 'AI', entityName: 'Asia Investment L.L.C-FZ' },
  { entityCode: 'AXY', entityName: 'AXY Solutions' },
  { entityCode: 'BFL', entityName: 'Brightness Fusion Limited' },
  { entityCode: 'BFT', entityName: 'BF two L.L.C-FZ' },
  { entityCode: 'CPO', entityName: 'C P O Properties LLC' },
  { entityCode: 'CPO1', entityName: 'Central Pacific One Property L.L.C' },
  { entityCode: 'dat', entityName: '' },
  { entityCode: 'DEVC', entityName: 'Devcore Properties LLC' },
  { entityCode: 'DTA', entityName: 'DT Asia L.L.C-FZ' },
  { entityCode: 'GCI', entityName: 'G C I Contracting LLC' },
  { entityCode: 'HFI', entityName: 'Hadley First Investments LLC' },
  { entityCode: 'KAC', entityName: 'Knightsbridge Arts Center FZE' },
  { entityCode: 'LDP', entityName: 'LEOS Development LLC' },
  { entityCode: 'LID1', entityName: 'L I D One Limited – Offshore' },
  { entityCode: 'LIDP', entityName: 'LEOS International Developments LLC' },
  { entityCode: 'LII', entityName: 'LEOS International Investments LLC' },
  { entityCode: 'LIT', entityName: 'LEOS International Trade (Guangzhou) Co., Ltd' },
  { entityCode: 'LMM', entityName: 'LEOS Marketing Management LLC' },
  { entityCode: 'LPDC', entityName: 'LEOMAR PROJECT DEVELOPMENT CONSULTANT L.L.C' },
  { entityCode: 'LPM', entityName: 'LEOS One Project Management LLC' },
  { entityCode: 'LPMP', entityName: 'LEOS Project Management (Private) Limited' },
  { entityCode: 'LUD', entityName: 'L U D Design Consultancy LLC' },
  { entityCode: 'LVM', entityName: 'LVW Investments' },
  { entityCode: 'NP', entityName: 'NISEKO PROPERTIES L.L.C' },
  { entityCode: 'RLI', entityName: 'RL Investments - OFFSHORE' },
  { entityCode: 'SD', entityName: 'Safaitte digital L.L.C – FZ' },
  { entityCode: 'VELP', entityName: 'VE Live Property Management' },
  { entityCode: 'VLRE', entityName: 'VISTA LAND REAL ESTATE SURVEY SERVICES L.L.C' },
  { entityCode: 'VWAN', entityName: 'VWAN Limited – Offshore' },
  { entityCode: 'WGO', entityName: 'WG One L.L.C-FZ' },
  { entityCode: 'WJL', entityName: 'Wise Jasmine Limited – Offshore' },
];

const seedEntities = async (): Promise<void> => {
  try {
    await connectDB();

    console.log('🌱 Seeding entities...');

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const entityData of entities) {
      const existingEntity = await Entity.findOne({ entityCode: entityData.entityCode });

      if (existingEntity) {
        // Update entity name if it's empty or different
        if (entityData.entityName && existingEntity.entityName !== entityData.entityName) {
          existingEntity.entityName = entityData.entityName;
          await existingEntity.save();
          updated++;
          console.log(`✅ Updated: ${entityData.entityCode} - ${entityData.entityName}`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${entityData.entityCode} (already exists)`);
        }
      } else {
        await Entity.create({
          entityCode: entityData.entityCode,
          entityName: entityData.entityName || entityData.entityCode,
          entityType: 1,
          entityCurrency: 'AED',
        });
        created++;
        console.log(`✅ Created: ${entityData.entityCode} - ${entityData.entityName || entityData.entityCode}`);
      }
    }

    console.log(`\n📊 Seeding Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${entities.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding entities:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  seedEntities();
}

export default seedEntities;

