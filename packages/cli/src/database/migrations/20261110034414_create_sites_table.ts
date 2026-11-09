import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("sites", (table) => {
      table.id();
      table.foreignId("project_id").constrained("projects").cascadeOnDelete();
      table.foreignId("supervisor_id").constrained("users").nullOnDelete();
      table.string("name");
      table.string("address_line1");
      table.string("address_line2").nullable();
      table.string("city", 100);
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100);
      table.decimal("latitude", 10, 7).nullable();
      table.decimal("longitude", 10, 7).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("sites");
  },
});
