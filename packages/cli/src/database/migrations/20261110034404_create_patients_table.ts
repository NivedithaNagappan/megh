import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("patients", (table) => {
      table.id();
      table.string("mrn", 32).unique();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("gender", 16).nullable(); // male | female | other
      table.date("date_of_birth").nullable();
      table.string("phone", 32).nullable();
      table.string("email").nullable();
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.string("blood_group", 32).nullable(); // A+ | A- | B+ | B- | AB+ | AB- | O+ | O-
      table.text("allergies").nullable();
      table.string("emergency_contact_name").nullable();
      table.string("emergency_contact_phone", 32).nullable();
      table.timestamps();
      table.softDeletes();
    });
  },

  async down(schema) {
    await schema.drop("patients");
  },
});
