import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("medical_records", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").cascadeOnDelete();
      table.foreignId("doctor_id").constrained("doctors").nullOnDelete();
      table.foreignId("appointment_id").constrained("appointments").nullOnDelete();
      table.date("visit_date");
      table.text("chief_complaint").nullable();
      table.text("diagnosis").nullable();
      table.text("treatment").nullable();
      table.json("vitals").nullable();
      table.text("notes").nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("medical_records");
  },
});
