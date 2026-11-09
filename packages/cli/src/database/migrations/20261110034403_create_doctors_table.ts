import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("doctors", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.foreignId("department_id").constrained("departments").nullOnDelete();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("specialization", 128);
      table.string("license_number", 64).unique();
      table.decimal("consultation_fee", 12, 2).nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("doctors");
  },
});
