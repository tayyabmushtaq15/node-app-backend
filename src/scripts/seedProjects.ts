import Project from '../models/project.model';
import Entity from '../models/entities.model';
import connectDB from '../config/database';

const projects = [
  { projectCode: '2000', projectName: 'Knightsbridge Park(Test)', projectShortName: 'KPTEST' },
  { projectCode: '2563', projectName: 'Hadley Heights', projectShortName: 'HH' },
  { projectCode: '2787', projectName: 'Weybridge Gardens', projectShortName: 'WG' },
  { projectCode: '2866', projectName: 'Cavendish Square', projectShortName: 'CS' },
  { projectCode: '3007', projectName: 'Weybridge Gardens - 2', projectShortName: 'WG2' },
  { projectCode: '3164', projectName: 'Weybridge Gardens 3', projectShortName: 'WG3' },
  { projectCode: '3361', projectName: 'Knightsbridge Park', projectShortName: 'KP' },
  { projectCode: '3378', projectName: 'Kensington Gardens', projectShortName: 'KG' },
  { projectCode: '3500', projectName: 'HQ Operations & Utilities', projectShortName: 'HQ' },
  { projectCode: 'GEN', projectName: 'GEN', projectShortName: 'GEN' },
  { projectCode: 'P0011', projectName: 'Knightsbridge Park 2', projectShortName: 'KP2' },
  { projectCode: 'P0013', projectName: 'Weybridge Gardens 4 - Kensington Gardens', projectShortName: 'WG4KG' },
  { projectCode: 'P0014', projectName: 'Weybridge Gardens 5', projectShortName: 'WG5' },
  { projectCode: 'P0015', projectName: 'Hadley Heights 2 - Vitality', projectShortName: 'HH2V' },
  { projectCode: 'P0016', projectName: 'Greenwood Master Community', projectShortName: 'GMC' },
  { projectCode: 'P0017', projectName: 'Windsor', projectShortName: 'WIN' },
  { projectCode: 'P0018', projectName: "Regent's Park", projectShortName: 'RP' },
  { projectCode: 'P0019', projectName: 'LEOS Royal', projectShortName: 'LR' },
];

const seedProjects = async (): Promise<void> => {
  try {
    await connectDB();

    console.log('🌱 Seeding projects...');

    // Find LDP entity
    const ldpEntity = await Entity.findOne({ entityCode: 'LDP' });
    if (!ldpEntity) {
      throw new Error('LDP entity not found. Please seed entities first.');
    }

    console.log(`✅ Found LDP entity: ${ldpEntity.entityName} (${ldpEntity.entityCode})`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const projectData of projects) {
      const existingProject = await Project.findOne({ projectCode: projectData.projectCode });

      if (existingProject) {
        // Update project if name or short name changed
        let updatedFields = false;
        
        if (existingProject.projectName !== projectData.projectName) {
          existingProject.projectName = projectData.projectName;
          updatedFields = true;
        }
        
        if (existingProject.projectShortName !== projectData.projectShortName) {
          existingProject.projectShortName = projectData.projectShortName;
          updatedFields = true;
        }

        // Ensure entity is set to LDP
        if (existingProject.entity.toString() !== ldpEntity._id.toString()) {
          existingProject.entity = ldpEntity._id;
          updatedFields = true;
        }

        if (updatedFields) {
          existingProject.lastSyncDateTime = new Date();
          await existingProject.save();
          updated++;
          console.log(`✅ Updated: ${projectData.projectCode} - ${projectData.projectName}`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${projectData.projectCode} (already exists)`);
        }
      } else {
        await Project.create({
          projectCode: projectData.projectCode,
          projectName: projectData.projectName,
          projectShortName: projectData.projectShortName,
          entity: ldpEntity._id,
          parentEntity: null,
          isAvailable: true,
          totalUnits: 0,
          type: 'Residential',
          status: 'Planning',
          lastSyncDateTime: new Date(),
        });
        created++;
        console.log(`✅ Created: ${projectData.projectCode} - ${projectData.projectName}`);
      }
    }

    console.log(`\n📊 Seeding Summary:`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${projects.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding projects:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  seedProjects();
}

export default seedProjects;

