import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("lab_tests", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").cascadeOnDelete();
      table.foreignId("doctor_id").constrained("doctors").nullOnDelete();
      table.string("name");
      table.string("code", 32).nullable();
      table.string("status", 32).default("ordered"); // ordered | collected | completed | cancelled
      table.text("result").nullable();
      table.string("normal_range", 128).nullable();
      table.string("unit", 32).nullable();
      table.timestamp("ordered_at");
      table.timestamp("completed_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("lab_tests");
  },
});
