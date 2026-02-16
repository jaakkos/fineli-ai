/**
 * Seed script: populates export_template_versions with the initial template.
 * Run with: pnpm db:seed
 */
import { getDbUnified } from './client';
import { eq } from 'drizzle-orm';

async function seed() {
  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;
  const existing = await db.selectOne(
    raw.select().from(s.exportTemplateVersions).where(
      eq(s.exportTemplateVersions.version, 'fineli-diary-v1')
    )
  );
  if (existing) {
    console.log('✓ Export template already seeded.');
    return;
  }
  await db.run(
    raw.insert(s.exportTemplateVersions).values({
      version: 'fineli-diary-v1',
      schemaJson: {
        sheetName: 'Ruokapäiväkirja',
        columns: 62,
        description: 'Fineli diary export format v1 — 6 metadata + 55 nutrients + 1 derived kcal',
      },
    })
  );
  console.log('✓ Seeded export template: fineli-diary-v1');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
