import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("students", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("student_number", 32).unique();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("gender", 16).nullable(); // male | female | other
      table.date("date_of_birth").nullable();
      table.date("admission_date").nullable();
      table.string("status", 32).default("active"); // active | graduated | suspended | withdrawn
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("students");
  },
});
