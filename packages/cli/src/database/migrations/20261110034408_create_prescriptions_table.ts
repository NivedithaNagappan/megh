import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("prescriptions", (table) => {
      table.id();
      table.foreignId("patient_id").constrained("patients").cascadeOnDelete();
      table.foreignId("doctor_id").constrained("doctors").nullOnDelete();
      table.foreignId("medical_record_id").constrained("medical_records").nullOnDelete();
      table.foreignId("medication_id").constrained("medications").onDelete("restrict");
      table.string("dosage", 64);
      table.string("frequency", 64);
      table.string("duration", 64).nullable();
      table.integer("quantity").default(1);
      table.text("instructions").nullable();
      table.timestamp("prescribed_at");
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("prescriptions");
  },
});
