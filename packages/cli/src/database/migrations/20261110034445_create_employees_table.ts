import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("employees", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.foreignId("department_id").constrained("departments").nullOnDelete();
      table.foreignId("position_id").constrained("positions").nullOnDelete();
      table.string("employee_number", 32).unique();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("gender", 16).nullable(); // male | female | other
      table.date("date_of_birth").nullable();
      table.date("hire_date");
      table.string("employment_type", 32); // full_time | part_time | contract | intern
      table.decimal("salary", 12, 2).nullable();
      table.string("status", 32).default("active"); // active | on_leave | terminated
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.timestamps();
      table.softDeletes();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("employees");
  },
});
