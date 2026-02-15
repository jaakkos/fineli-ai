/**
 * Seed script: populates export_template_versions with the initial template.
 * Run with: pnpm db:seed
 * Supports both SQLite and PostgreSQL (when DATABASE_URL is set).
 */
import { getDb, getDbUnified, isPostgres } from './client';
import { exportTemplateVersions } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  if (isPostgres()) {
    const db = await getDbUnified();
    const raw = db.raw as any;
    const s = db.schema as any;
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
  } else {
    const db = getDb();
    const existing = db
      .select()
      .from(exportTemplateVersions)
      .where(eq(exportTemplateVersions.version, 'fineli-diary-v1'))
      .get();
    if (existing) {
      console.log('✓ Export template already seeded.');
      return;
    }
    db.insert(exportTemplateVersions).values({
      version: 'fineli-diary-v1',
      schemaJson: {
        sheetName: 'Ruokapäiväkirja',
        columns: 62,
        description: 'Fineli diary export format v1 — 6 metadata + 55 nutrients + 1 derived kcal',
      },
    }).run();
  }
  console.log('✓ Seeded export template: fineli-diary-v1');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
