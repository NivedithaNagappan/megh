import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("appointments", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").cascadeOnDelete();
      table.foreignId("doctor_id").constrained("doctors").cascadeOnDelete();
      table.foreignId("department_id").constrained("departments").nullOnDelete();
      table.timestamp("scheduled_at");
      table.integer("duration_minutes").default(30);
      table.string("status", 32).default("scheduled"); // scheduled | confirmed | checked_in | completed | cancelled | no_show
      table.string("reason", 500).nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("scheduled_at");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("appointments");
  },
});
