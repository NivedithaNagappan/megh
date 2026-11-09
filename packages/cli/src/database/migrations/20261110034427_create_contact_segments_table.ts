import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("contact_segments", (table) => {
      table.foreignId("contact_id").constrained("contacts").cascadeOnDelete();
      table.foreignId("segment_id").constrained("segments").cascadeOnDelete();
      table.primary(["contact_id", "segment_id"]);
    });
  },

  async down(schema) {
    await schema.drop("contact_segments");
  },
});
