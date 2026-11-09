import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("inspections", (table) => {
      table.id();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.foreignId("site_id").constrained("sites").nullOnDelete();
      table.string("inspector_name");
      table.string("type", 32);
      table.timestamp("scheduled_at").nullable();
      table.timestamp("inspected_at").nullable();
      table.string("result", 32); // pending | passed | failed | conditional
      table.text("notes").nullable();
      table.timestamps();
      table.index("type");
    });
  },

  async down(schema) {
    await schema.drop("inspections");
  },
});
